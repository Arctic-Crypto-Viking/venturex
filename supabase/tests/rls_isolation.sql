-- rls_isolation.sql — the acceptance test that ships with the schema.
--
-- A fresh test user with their own account must see ZERO rows of the internal
-- (founder) account across every tenant table, cannot write into it, cannot
-- escalate, and can still use their own account normally. The superadmin path
-- works and is audited with the real actor. Anonymous visitors see nothing.
--
-- Run with a superuser/postgres connection (it switches roles with SET ROLE):
--   psql … -v owner_email=you@example.com -v tester_email=tester@example.test -f supabase/tests/rls_isolation.sql
-- Both auth users must exist (insert into auth.users locally; run.sh does it).
-- Every check raises on failure; a clean run ends with "RLS suite: all checks passed".
--
-- B1 (18 Oct 2026): the core-only suite — tenancy, entitlements, admin/audit, delete
-- account, the feedback board. B2 adds the product checks (HANDOFF §8 B2) and replaces
-- the direct account inserts below with create_venture().

\set ON_ERROR_STOP on
\set QUIET on

select id as owner_id  from auth.users where lower(email) = lower(:'owner_email')  \gset
select id as tester_id from auth.users where lower(email) = lower(:'tester_email') \gset

-- ---------------------------------------------------------------------------
-- 0. Fixtures, as the founder's own steps make them: the superadmin flag by SQL
--    (HANDOFF §9 step 3), his internal account, and one account for the tester.
-- ---------------------------------------------------------------------------
update public.users set is_superadmin = true where id = :'owner_id';

insert into public.accounts (name, slug, owner_user_id, plan_id, is_internal)
select 'Internal', 'internal', :'owner_id', p.id, true from public.plans p where p.key = 'founder'
on conflict (slug) do nothing;
select id as internal_account from public.accounts where slug = 'internal' \gset
insert into public.account_members (account_id, user_id, role, status, accepted_at)
values (:'internal_account', :'owner_id', 'owner', 'active', now()) on conflict do nothing;

insert into public.accounts (name, slug, owner_user_id, plan_id)
select 'Tester venture', 'tester-venture', :'tester_id', p.id from public.plans p where p.is_default_for_signup
on conflict (slug) do nothing;
select id as tester_account from public.accounts where slug = 'tester-venture' \gset
insert into public.account_members (account_id, user_id, role, status, accepted_at)
values (:'tester_account', :'tester_id', 'owner', 'active', now()) on conflict do nothing;

select set_config('test.internal_account', :'internal_account', false);
select set_config('test.tester_account', :'tester_account', false);
select set_config('test.owner_id', :'owner_id', false);
select set_config('test.tester_id', :'tester_id', false);
select set_config('test.tester_email', lower(:'tester_email'), false);
select set_config('test.started', now()::text, false);   -- audit rows this run writes are newer

create temp table test_results (name text, ok boolean);
grant insert on test_results to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. The tester, as `authenticated`: zero internal rows in every table that
--    carries account_id, and none of the tenant data without one
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'tester_id', 'role', 'authenticated')::text, false);
set role authenticated;

do $$
declare r record; n bigint; leaks text[] := '{}'; checked int := 0;
begin
  for r in select c.table_name from information_schema.columns c
            join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'account_id' and t.table_type = 'BASE TABLE'
           order by 1 loop
    execute format('select count(*) from public.%I where account_id = $1', r.table_name)
       into n using current_setting('test.internal_account')::uuid;
    checked := checked + 1;
    if n > 0 then leaks := leaks || (r.table_name || '=' || n); end if;
  end loop;
  if cardinality(leaks) > 0 then
    raise exception 'RLS LEAK — tester can see internal rows in: %', leaks;
  end if;
  raise notice 'tenant tables checked: % (all zero)', checked;
end $$;

do $$
declare n bigint;
begin
  select count(*) into n from public.users where id = current_setting('test.owner_id')::uuid;
  if n <> 0 then raise exception 'RLS LEAK — tester can see the owner user row'; end if;
  select count(*) into n from public.accounts where id = current_setting('test.internal_account')::uuid;
  if n <> 0 then raise exception 'RLS LEAK — tester can see the internal account'; end if;
  select count(*) into n from public.account_members where user_id = current_setting('test.owner_id')::uuid;
  if n <> 0 then raise exception 'RLS LEAK — tester can see the owner''s memberships'; end if;
  select count(*) into n from public.audit_log;
  if n <> 0 then raise exception 'RLS LEAK — tester can read the audit log'; end if;
  select count(*) into n from public.discount_codes;
  if n <> 0 then raise exception 'RLS LEAK — tester can read discount codes'; end if;
  select count(*) into n from public.system_settings;
  if n <> 0 then raise exception 'RLS LEAK — tester can read system settings'; end if;
  select count(*) into n from public.impersonation_sessions;
  if n <> 0 then raise exception 'RLS LEAK — tester can read impersonation sessions'; end if;
  -- the registry IS readable (plans, features): that is how the UI explains a plan
  select count(*) into n from public.plans where is_public;
  if n < 1 then raise exception 'public plans must be readable'; end if;
  select count(*) into n from public.plans where not is_public;
  if n <> 0 then raise exception 'RLS LEAK — tester can read non-public plans'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Writes into the internal account and escalations must fail
-- ---------------------------------------------------------------------------
do $$
declare ok boolean;
begin
  -- write a usage event into the internal account
  ok := false;
  begin
    insert into public.usage_events (account_id, user_id, feature_key, quantity)
    values (current_setting('test.internal_account')::uuid, current_setting('test.tester_id')::uuid, 'venture.ai_verdicts_per_month', 1);
  exception when others then ok := true;
  end;
  insert into test_results values ('cannot write into the internal account', ok);

  -- flip own account to internal
  ok := false;
  begin
    update public.accounts set is_internal = true where id = current_setting('test.tester_account')::uuid;
  exception when others then ok := true;
  end;
  insert into test_results values ('cannot set own account internal', ok);

  -- change own plan
  ok := false;
  begin
    update public.accounts set plan_id = gen_random_uuid() where id = current_setting('test.tester_account')::uuid;
  exception when others then ok := true;
  end;
  insert into test_results values ('cannot change own plan', ok);

  -- make self superadmin
  ok := false;
  begin
    update public.users set is_superadmin = true where id = current_setting('test.tester_id')::uuid;
  exception when others then ok := true;
  end;
  insert into test_results values ('cannot self-promote to superadmin', ok);

  -- read another account's entitlements
  ok := false;
  begin
    perform public.effective_entitlements(current_setting('test.internal_account')::uuid);
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot read internal entitlements', ok);

  -- 018-core: plan status of another account is not readable either
  ok := false;
  begin
    perform public.is_entitled(current_setting('test.internal_account')::uuid);
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot read internal plan status', ok);

  -- consume quota on another account
  ok := false;
  begin
    perform public.consume_quota(current_setting('test.internal_account')::uuid, 'venture.ai_verdicts_per_month', 1);
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot consume internal quota', ok);

  -- record a payment (superadmin only)
  ok := false;
  begin
    perform public.record_manual_payment(current_setting('test.tester_account')::uuid, 'wise', 2900, 'EUR', current_date, current_date + 30);
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot record own payment', ok);

  -- read the internal overview
  ok := false;
  begin
    perform public.internal_overview();
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot read internal overview', ok);

  -- admin console RPCs (core_007) are superadmin-only
  ok := false;
  begin
    perform count(*) from public.admin_list_accounts();
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot list accounts (admin rpc)', ok);

  ok := false;
  begin
    perform public.admin_account_detail(current_setting('test.internal_account')::uuid);
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot read account detail (admin rpc)', ok);

  ok := false;
  begin
    perform public.admin_start_view_as(current_setting('test.internal_account')::uuid, 'sneaky');
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot start view-as (admin rpc)', ok);

  ok := false;
  begin
    perform public.admin_set_plan_feature('free', 'venture.ventures_max', '99'::jsonb);
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot edit plan matrix (admin rpc)', ok);

  ok := false;
  begin
    perform public.admin_set_account_entitlement(current_setting('test.tester_account')::uuid, 'venture.workspace', 'true'::jsonb, 'self-grant');
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot grant own entitlement (admin rpc)', ok);

  ok := false;
  begin
    perform public.admin_set_setting('signup', '{"trial_days": 365}'::jsonb);
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot edit settings (admin rpc)', ok);

  ok := false;
  begin
    perform public.admin_set_flag('signup.open', false);
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot flip flags (admin rpc)', ok);

  ok := public.owner_setting('signup') is null;
  insert into test_results values ('owner settings read as null', ok);

  -- deleting an account is superadmin-only, also for one's own account (core_020)
  ok := false;
  begin
    perform public.admin_delete_account(current_setting('test.tester_account')::uuid, 'tester-venture', 'self-delete');
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot delete an account (admin rpc)', ok);

  -- the audit log is written by the superadmin or the service only
  ok := false;
  begin
    perform public.log_audit('invite', 'email', 'someone@example.test', null, null, null);
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot write to the audit log', ok);

  -- feedback drafts come from the server only (core_024)
  ok := false;
  begin
    perform public.feedback_create_draft(current_setting('test.tester_id')::uuid, 'idea', 'Suite sneaky', 'x', 'x', false);
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('cannot create a feedback draft directly', ok);
end $$;

-- ---------------------------------------------------------------------------
-- 3. The tester's own account works, on the default plan
-- ---------------------------------------------------------------------------
do $$
declare acc uuid := current_setting('test.tester_account')::uuid; ent jsonb; q jsonb;
begin
  ent := public.effective_entitlements(acc);
  if (ent ->> 'venture.ventures_max')::int <> 3 then raise exception 'free plan should allow 3 saved ventures, got %', ent ->> 'venture.ventures_max'; end if;
  if (ent ->> 'venture.workspace')::boolean then raise exception 'free plan should not have the workspace'; end if;
  if (ent ->> 'venture.members_max')::int <> 0 then raise exception 'free plan should allow no invited people'; end if;
  if public.has_feature(acc, 'venture.workspace') then raise exception 'has_feature must agree with the matrix'; end if;
  if (public.feature_value(acc, 'venture.ventures_max'))::int <> 3 then raise exception 'feature_value must agree with the matrix'; end if;
  if public.is_entitled(acc) then raise exception 'free account must not be "entitled" (no subscription)'; end if;
  -- a quota at 0 is refused, not raised
  q := public.consume_quota(acc, 'venture.ai_verdicts_per_month', 1);
  if (q ->> 'allowed')::boolean then raise exception 'a quota of 0 must refuse, got %', q; end if;
  -- the flag that is on is readable by everyone signed in
  if not public.flag_enabled('signup.open') then raise exception 'signup.open should be on'; end if;
  if public.flag_enabled('venture.forecast_log') then raise exception 'venture.forecast_log should be off'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Anonymous: nothing of the tenant tables, the registry only
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
do $$
declare n bigint; ok boolean;
begin
  select count(*) into n from public.accounts;
  if n <> 0 then raise exception 'RLS LEAK — anon can see accounts'; end if;
  select count(*) into n from public.users;
  if n <> 0 then raise exception 'RLS LEAK — anon can see users'; end if;
  select count(*) into n from public.plans where is_public;
  if n < 1 then raise exception 'anon should read the public plans (the landing page)'; end if;
  ok := false;
  begin
    perform public.is_entitled(current_setting('test.tester_account')::uuid);
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('anon cannot read a plan status', ok);
  ok := false;
  begin
    perform public.effective_entitlements(current_setting('test.tester_account')::uuid);
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('anon cannot read entitlements', ok);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. The superadmin path (core_007): admin RPCs work and are audited with the
--    real actor; the hooks carry the product's keys
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'owner_id', 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare n bigint; v_session uuid; d jsonb; o jsonb; owner uuid := current_setting('test.owner_id')::uuid;
        tester_acc uuid := current_setting('test.tester_account')::uuid;
begin
  select count(*) into n from public.admin_list_accounts();
  if n < 2 then raise exception 'superadmin should list every account (got %)', n; end if;
  select count(*) into n from public.admin_list_accounts(current_setting('test.tester_email'));
  if n <> 1 then raise exception 'account search should find the tester by e-mail (got %)', n; end if;
  select count(*) into n from public.admin_list_accounts('no-such-venture-anywhere');
  if n <> 0 then raise exception 'account search must not match everything (got %)', n; end if;

  d := public.admin_account_detail(tester_acc);
  if (d -> 'entitlements' ->> 'venture.ventures_max')::int <> 3 then raise exception 'detail should resolve entitlements'; end if;
  if not (d ? 'venture') then raise exception 'detail should carry the product hook keys (venture)'; end if;
  if jsonb_typeof(d -> 'usage') <> 'array' then raise exception 'detail should carry usage'; end if;

  v_session := public.admin_start_view_as(tester_acc, 'RLS suite');
  select count(*) into n from public.audit_log
   where entity_type = 'impersonation_sessions' and entity_id = v_session::text and actor_user_id = owner;
  if n < 1 then raise exception 'view-as must be audited with the superadmin as actor'; end if;
  perform public.admin_end_view_as(v_session);
  d := public.admin_account_detail(tester_acc);
  if jsonb_typeof(d -> 'view_as_sessions' -> 0 -> 'ended_at') = 'null' then raise exception 'view-as session should be closed'; end if;

  perform public.admin_set_plan_feature('free', 'venture.ventures_max', '3'::jsonb);   -- same value: exercises the path
  select count(*) into n from public.audit_log where entity_type = 'plan_features' and actor_user_id = owner;
  if n < 1 then raise exception 'plan matrix edit must be audited with the superadmin as actor'; end if;
  begin
    perform public.admin_set_plan_feature('free', 'venture.workspace', '3'::jsonb);
    raise exception 'a flag must reject a number';
  exception when invalid_parameter_value then null;
  end;

  perform public.admin_set_account_entitlement(tester_acc, 'venture.workspace', 'true'::jsonb, 'suite grant');
  select count(*) into n from public.audit_log where entity_type = 'account_entitlements' and actor_user_id = owner;
  if n < 1 then raise exception 'entitlement grant must be audited with the superadmin as actor'; end if;
  if not public.has_feature(tester_acc, 'venture.workspace') then raise exception 'a grant must show in has_feature'; end if;
  perform public.admin_set_account_entitlement(tester_acc, 'venture.workspace', null, 'suite revoke');
  if public.has_feature(tester_acc, 'venture.workspace') then raise exception 'null must revoke the grant'; end if;

  perform public.admin_set_setting('suite.tmp', '{"x": 1}'::jsonb, 'suite fixture');
  if public.owner_setting('suite.tmp') is null then raise exception 'superadmin should read the setting back'; end if;
  perform public.admin_set_setting('suite.tmp', null);
  if public.owner_setting('suite.tmp') is not null then raise exception 'null must delete the setting'; end if;
  perform public.admin_set_flag('signup.open', true);   -- same value: exercises the path

  o := public.internal_overview();
  if (o ->> 'ventures_live') is null then raise exception 'overview must carry the product hook figures'; end if;
  if (o ->> 'active_accounts')::int < 1 then raise exception 'overview must count the tester account'; end if;

  -- an invite, written as the admin action writes it
  perform public.log_audit('invite', 'email', current_setting('test.tester_email'), null, null,
                           jsonb_build_object('user_id', current_setting('test.tester_id'), 'new_login', true));
  select count(*) into n from public.audit_log
   where action = 'invite' and entity_type = 'email' and entity_id = current_setting('test.tester_email') and actor_user_id = owner;
  if n <> 1 then raise exception 'an invite must be audited with the superadmin as actor (got %)', n; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. The feedback board (core_024): drafts come from the server only, the board
--    shows no author and no original text, one vote per person
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select public.feedback_create_draft(:'owner_id', 'idea', 'Suite owner idea', 'Suite summary from the owner',
                                    'owner wrote this, with a private detail', true) as fb_owner \gset
select set_config('test.fb_owner', :'fb_owner', false);

select set_config('request.jwt.claims', json_build_object('sub', :'owner_id', 'role', 'authenticated')::text, false);
set role authenticated;
select public.feedback_publish(:'fb_owner');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'tester_id', 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare n bigint; ok boolean; item uuid := current_setting('test.fb_owner')::uuid;
begin
  select count(*) into n from public.feedback_board where id = item;
  if n <> 1 then raise exception 'a published suggestion must be on the board for everyone signed in'; end if;
  select count(*) into n from public.feedback_items where id = item;
  if n <> 0 then raise exception 'RLS LEAK — the tester can read another person''s feedback row (author, body)'; end if;
  perform public.feedback_vote(item);
  select vote_count into n from public.feedback_board where id = item;
  if n <> 2 then raise exception 'the author''s vote plus the tester''s should make 2, got %', n; end if;
  ok := false;
  begin
    perform public.feedback_vote(item);
    select vote_count into n from public.feedback_board where id = item;
    ok := n = 2;   -- a second vote by the same person changes nothing
  exception when others then ok := true;
  end;
  insert into test_results values ('feedback: one vote per person', ok);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Deleting an account (core_020): refusals first, then the tester's account
--    goes row by row, with the login, and the audit keeps no address
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'owner_id', 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare ok boolean; r jsonb; n bigint; tester_acc uuid := current_setting('test.tester_account')::uuid;
begin
  ok := false;
  begin
    perform public.admin_delete_account(current_setting('test.internal_account')::uuid, 'internal', 'suite');
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('delete: refuses the internal account', ok);

  ok := false;
  begin
    perform public.admin_delete_account(tester_acc, 'wrong-name', 'suite');
  exception when invalid_parameter_value then ok := true;
  end;
  insert into test_results values ('delete: refuses a wrong confirmation', ok);

  r := public.admin_delete_account(tester_acc, 'tester-venture', 'RLS suite: the tester asked');
  select count(*) into n from public.accounts where id = tester_acc;
  if n <> 0 then raise exception 'the account should be gone'; end if;
  select count(*) into n from public.audit_log where action = 'invite' and entity_id = current_setting('test.tester_email');
  if n <> 0 then raise exception 'the invite audit rows must no longer carry the address'; end if;
  insert into test_results values ('delete: the account and its rows are gone', true);
end $$;
reset role;
-- (The login itself is removed by the admin action after the database step, through
--  Supabase's admin API — not by SQL — so it is not checked here.)

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
\set QUIET off
select name, ok from test_results order by ok, name;
do $$
declare failed int; total int;
begin
  select count(*) filter (where not ok), count(*) into failed, total from test_results;
  if failed > 0 then
    raise exception 'RLS suite: % of % checks FAILED', failed, total;
  end if;
  raise notice 'RLS suite: all % checks passed', total;
end $$;
