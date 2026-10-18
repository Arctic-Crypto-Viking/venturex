-- 020_core_admin_delete_account — platform core (docs/PLATFORM-CORE.md §2, "Signup &
-- admin RPCs"). Written in artist-platform on 13 Oct 2026 as 015 in pull request 4,
-- which was never merged or applied; renumbered 020 on 15 Oct 2026 because 019 was
-- applied first, and the Supabase CLI refuses a local migration dated before the
-- last one on the remote. A verbatim copy is core/supabase/migrations/
-- core_020_admin_delete_account.sql. It names no vertical table: row counts and
-- user references are found from the catalogue, the way the RLS suite finds tenant
-- tables.
--
-- Why: removing an account was a manual SQL procedure (docs/SETUP-GUIDE.md Part 12).
-- Deleting the auth user alone fails, because accounts.owner_user_id has no cascade,
-- and every other reference to public.users is NO ACTION too.
--
-- What it does, in one transaction:
--   1. Caller must be superadmin or the service role (app.assert_superadmin).
--   2. Refuses the internal account, the caller's own account, an account owned by a
--      superadmin login, a wrong confirmation, an empty reason, and any account with
--      a payment or an invoice (bookkeeping records are not deleted by a button).
--   3. Counts the account's rows per table, then deletes the account; every table
--      with account_id cascades. Only base tables are counted: views that carry
--      account_id (019's public_identities) show rows of those tables and would
--      count them twice.
--   4. Clears the before/after snapshots of that account's audit entries. They hold
--      copies of the deleted rows; the skeleton (who, what, when) stays.
--   5. If the owner owns no other account and is a member of none: clears every
--      nullable reference to that user in rows that survive (for example a lead they
--      sent in and the founder published), so the login can be removed afterwards.
--      Otherwise the login is kept and the result says why. In the same case it
--      clears the person's e-mail address from the invite entries (Admin → Accounts
--      → Invite a tester writes action 'invite', entity_type 'email', the address as
--      entity_id): the entry stays, without the address.
--   6. Writes one audit entry: the account's id, row counts and the reason. No name
--      and no e-mail address.
--
-- What it does not do: remove files in Storage or the auth user. The server action
-- does both afterwards, files first (Supabase refuses to delete a user who owns
-- Storage objects), and records the outcome with log_audit(). Which Storage buckets
-- hold an account's files is the product's to say (product.admin.storageBuckets).
--
-- Depends on core SQL that is not cut into platform-core yet: audit_log,
-- app.current_impersonation() and log_audit() (artist-platform 007) and
-- app.assert_superadmin() (009).

create or replace function public.admin_delete_account(p_account uuid, p_confirm text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a              public.accounts%rowtype;
  v_owner_admin  boolean;
  v_other        int;
  v_rows         jsonb := '{}'::jsonb;
  v_blockers     text[] := '{}';
  v_cleared      int := 0;
  v_invites      int := 0;
  v_email        text;
  v_login        text;
  v_audit        bigint;
  n              bigint;
  r              record;
begin
  perform app.assert_superadmin();

  select * into a from public.accounts where id = p_account for update;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
  if a.is_internal then
    raise exception 'The internal account cannot be deleted.' using errcode = '42501';
  end if;
  if a.owner_user_id = auth.uid() then
    raise exception 'This is your own account. Nothing was deleted.' using errcode = '42501';
  end if;
  select is_superadmin into v_owner_admin from public.users where id = a.owner_user_id;
  if coalesce(v_owner_admin, false) then
    raise exception 'This account belongs to a founder login. Nothing was deleted.' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(p_confirm, ''))) is distinct from lower(a.slug) then
    raise exception 'The typed name does not match this account. Nothing was deleted.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required. Nothing was deleted.' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments where account_id = p_account)
     or exists (select 1 from public.invoices where account_id = p_account) then
    raise exception 'This account has a payment or an invoice. Bookkeeping records are not deleted here. Nothing was deleted.' using errcode = '42501';
  end if;

  -- 3. what is in it (table name -> rows), then the delete; base tables only, never views
  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'account_id'
       and t.table_type = 'BASE TABLE' and c.table_name <> 'audit_log'
     order by c.table_name
  loop
    execute format('select count(*) from public.%I where account_id = $1', r.table_name) into n using p_account;
    if n > 0 then v_rows := v_rows || jsonb_build_object(r.table_name, n); end if;
  end loop;

  delete from public.accounts where id = p_account;

  -- 4. audit snapshots of this account, including the ones the cascade just wrote
  update public.audit_log set before = null, after = null
   where account_id = p_account and (before is not null or after is not null);
  get diagnostics v_cleared = row_count;

  -- 5. the owner's login
  select count(*) into v_other from public.accounts where owner_user_id = a.owner_user_id;
  select count(*) into n from public.account_members where user_id = a.owner_user_id;
  if v_other > 0 then
    v_login := 'kept: owns another account';
  elsif n > 0 then
    v_login := 'kept: member of another account';
  else
    for r in
      select c.conrelid::regclass as tbl, att.attname as col, att.attnotnull as notnull
        from pg_constraint c
        join pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
       where c.contype = 'f' and c.confrelid = 'public.users'::regclass
         and c.confdeltype = 'a' and array_length(c.conkey, 1) = 1
       order by 1, 2
    loop
      if r.notnull then
        execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into n using a.owner_user_id;
        if n > 0 then v_blockers := v_blockers || (r.tbl::text || '.' || r.col); end if;
      else
        execute format('update %s set %I = null where %I = $1', r.tbl, r.col, r.col) using a.owner_user_id;
      end if;
    end loop;
    v_login := case when cardinality(v_blockers) = 0 then 'removable'
                    else 'kept: still referenced by ' || array_to_string(v_blockers, ', ') end;
    -- the invite entries name the person by address; the entry stays, the address goes
    select email into v_email from public.users where id = a.owner_user_id;
    update public.audit_log set entity_id = null, before = null, after = null
     where action = 'invite' and entity_type = 'email'
       and (lower(entity_id) = lower(v_email) or after ->> 'user_id' = a.owner_user_id::text);
    get diagnostics v_invites = row_count;
  end if;

  -- 6. the one entry that records the deletion (no name, no e-mail)
  insert into public.audit_log (actor_user_id, actor_role, impersonation_session_id, account_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), coalesce(auth.role(), session_user::text), app.current_impersonation(), p_account, 'delete', 'accounts', p_account::text,
          jsonb_build_object('rows', v_rows, 'created_at', a.created_at, 'access_status', a.access_status),
          jsonb_build_object('reason', btrim(p_reason), 'login', v_login, 'audit_snapshots_cleared', v_cleared,
                             'invites_cleared', v_invites))
  returning id into v_audit;

  return jsonb_build_object(
    'account_id', p_account,
    'owner_user_id', a.owner_user_id,
    'login', v_login,
    'login_removable', v_login = 'removable',
    'rows', v_rows,
    'audit_id', v_audit);
end $$;

revoke execute on function public.admin_delete_account(uuid, text, text) from public, anon;
grant execute on function public.admin_delete_account(uuid, text, text) to authenticated, service_role;
