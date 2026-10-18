-- 007_core_admin_audit — platform core (docs/PLATFORM-CORE.md §2, "Admin & audit"
-- and "Signup & admin RPCs"). Cut on 18 Oct 2026 in the New Venture repo from
-- artist-platform migrations 007 (audit log, feature flags, internal overview),
-- 009 §2 (the admin console RPCs) and 014 (the hooks, the settings / flag / grant
-- RPCs, usage in the account detail), with the artist code taken out:
--   · 009's identity limit, stage history and set_profile_stage stay in Mainfloor;
--   · admin_list_accounts no longer joins artist_identities: the search goes through
--     the hook app.admin_account_matches() and each row carries app.admin_account_extra();
--   · admin_account_detail no longer builds an `identities` key inline: a product adds
--     its keys through app.admin_account_extra();
--   · the hook bodies are the empty defaults; a product redefines them in its own
--     migration (create or replace), never by editing this file;
--   · the audit trigger on email_aliases (a Mainfloor table) is not here.
-- A verbatim copy is core/supabase/migrations/core_007_admin_audit.sql. Every product
-- that carries the core takes it as its next migration number (PLATFORM-CORE §4 rule 1).
-- Needs 001 (users, accounts, impersonation_sessions, system_settings, app.is_*) and
-- 003 (plans, features, subscriptions, invoices, payments, entitlements).

-- ---------------------------------------------------------------------------
-- 1. Audit log and feature flags (kill switches)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id                        bigint generated always as identity primary key,
  actor_user_id             uuid,
  actor_role                text,
  impersonation_session_id  uuid references public.impersonation_sessions (id),
  account_id                uuid,
  action                    text not null,               -- insert / update / delete / <custom>
  entity_type               text not null,
  entity_id                 text,
  before                    jsonb,
  after                     jsonb,
  ip                        inet,
  user_agent                text,
  at                        timestamptz not null default now()
);
create index audit_log_account_idx on public.audit_log (account_id, at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

-- Runtime kill switches and rollouts. Separate from entitlements on purpose:
-- entitlements = what a customer is allowed; flags = what the system has on.
create table public.feature_flags (
  key                text primary key,
  enabled            boolean not null default false,
  rollout_percent    int not null default 100 check (rollout_percent between 0 and 100),
  account_allowlist  uuid[] not null default '{}',
  description        text,
  updated_by         uuid,
  updated_at         timestamptz not null default now()
);

create or replace function public.flag_enabled(p_key text, p_account uuid default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select f.enabled
       and (f.rollout_percent = 100
            or (p_account is not null and p_account = any (f.account_allowlist))
            or (p_account is not null and (abs(hashtext(p_account::text || f.key)) % 100) < f.rollout_percent))
      from public.feature_flags f where f.key = p_key), false)
$$;

-- The impersonation session the current request runs in, if any
-- (set by the admin route: select set_config('app.impersonation_session', '<uuid>', true)).
create or replace function app.current_impersonation()
returns uuid language sql stable as $$
  select nullif(current_setting('app.impersonation_session', true), '')::uuid
$$;

-- Generic audit trigger for admin- and billing-relevant tables
create or replace function app.audit_row()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_account uuid; v_before jsonb; v_after jsonb; v_id text;
begin
  if tg_op in ('UPDATE','DELETE') then v_before := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_after := to_jsonb(new); end if;
  v_account := coalesce((v_after ->> 'account_id')::uuid, (v_before ->> 'account_id')::uuid);
  v_id := coalesce(v_after ->> 'id', v_before ->> 'id', v_after ->> 'key', v_before ->> 'key');
  insert into public.audit_log (actor_user_id, actor_role, impersonation_session_id, account_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), coalesce(auth.role(), session_user::text), app.current_impersonation(), v_account, lower(tg_op), tg_table_name, v_id, v_before, v_after);
  return coalesce(new, old);
end $$;

create trigger audit_subscriptions after insert or update or delete on public.subscriptions for each row execute function app.audit_row();
create trigger audit_payments after insert or update or delete on public.payments for each row execute function app.audit_row();
create trigger audit_invoices after insert or update or delete on public.invoices for each row execute function app.audit_row();
create trigger audit_account_entitlements after insert or update or delete on public.account_entitlements for each row execute function app.audit_row();
create trigger audit_plan_features after insert or update or delete on public.plan_features for each row execute function app.audit_row();
create trigger audit_plan_prices after insert or update or delete on public.plan_prices for each row execute function app.audit_row();
create trigger audit_discount_codes after insert or update or delete on public.discount_codes for each row execute function app.audit_row();
create trigger audit_feature_flags after insert or update or delete on public.feature_flags for each row execute function app.audit_row();
create trigger audit_system_settings after insert or update or delete on public.system_settings for each row execute function app.audit_row();
create trigger audit_impersonation after insert or update on public.impersonation_sessions for each row execute function app.audit_row();

-- accounts: audit status/plan/internal/owner changes only
create or replace function app.audit_account_row()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and (new.access_status is distinct from old.access_status
                           or new.plan_id is distinct from old.plan_id
                           or new.is_internal is distinct from old.is_internal
                           or new.owner_user_id is distinct from old.owner_user_id) then
    insert into public.audit_log (actor_user_id, actor_role, impersonation_session_id, account_id, action, entity_type, entity_id, before, after)
    values (auth.uid(), coalesce(auth.role(), session_user::text), app.current_impersonation(), new.id, 'update', 'accounts', new.id::text,
            jsonb_build_object('access_status', old.access_status, 'plan_id', old.plan_id, 'is_internal', old.is_internal, 'owner_user_id', old.owner_user_id),
            jsonb_build_object('access_status', new.access_status, 'plan_id', new.plan_id, 'is_internal', new.is_internal, 'owner_user_id', new.owner_user_id));
  end if;
  return new;
end $$;
create trigger audit_accounts after update on public.accounts for each row execute function app.audit_account_row();

create or replace function app.audit_user_row()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.is_superadmin is distinct from old.is_superadmin then
    insert into public.audit_log (actor_user_id, actor_role, action, entity_type, entity_id, before, after)
    values (auth.uid(), coalesce(auth.role(), session_user::text), 'update', 'users', new.id::text,
            jsonb_build_object('is_superadmin', old.is_superadmin), jsonb_build_object('is_superadmin', new.is_superadmin));
  end if;
  return new;
end $$;
create trigger audit_users after update on public.users for each row execute function app.audit_user_row();

-- Explicit audit entry from server code (admin actions that are not row writes)
create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id text, p_account uuid default null, p_before jsonb default null, p_after jsonb default null)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  if not (app.is_service() or app.is_superadmin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.audit_log (actor_user_id, actor_role, impersonation_session_id, account_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), coalesce(auth.role(), session_user::text), app.current_impersonation(), p_account, p_action, p_entity_type, p_entity_id, p_before, p_after)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Hooks: core functions call these; the product redefines them in its own
--    migration (create or replace) to add its figures and keys.
-- ---------------------------------------------------------------------------
-- Extra tiles on the internal overview (merged into internal_overview()).
create or replace function app.overview_extra()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select '{}'::jsonb
$$;

-- Extra keys on one account (merged into every admin_list_accounts() row and into admin_account_detail()).
create or replace function app.admin_account_extra(p_account uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select '{}'::jsonb
$$;

-- Whether the admin accounts search matches this account on the product's own fields
-- (Mainfloor: the artist names). Core already matches name, slug and the owner's e-mail.
create or replace function app.admin_account_matches(p_account uuid, p_query text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select false
$$;

-- ---------------------------------------------------------------------------
-- 3. Internal overview — read by GET /api/internal/overview (service role,
--    superadmin-scoped) and the admin Overview. The internal account is
--    excluded from every figure. The product's tiles come from the hook.
-- ---------------------------------------------------------------------------
create or replace function public.internal_overview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not (app.is_service() or app.is_superadmin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'mrr_cents', coalesce((
        select sum(round(pp.price_cents::numeric / pp.term_months))::bigint
          from public.subscriptions s
          join public.accounts a on a.id = s.account_id and not a.is_internal
          join public.plan_prices pp on pp.id = s.plan_price_id
         where s.status in ('active','grace') and public.is_entitled(s.account_id)), 0),
    'active_accounts', (select count(*) from public.accounts a where not a.is_internal and a.access_status not in ('suspended','cancelled')),
    'paying_accounts', (select count(distinct s.account_id) from public.subscriptions s join public.accounts a on a.id = s.account_id
                         where not a.is_internal and s.status in ('active','grace') and public.is_entitled(s.account_id)),
    'signups_7d', (select count(*) from public.accounts a where not a.is_internal and a.created_at > now() - interval '7 days'),
    'signups_30d', (select count(*) from public.accounts a where not a.is_internal and a.created_at > now() - interval '30 days'),
    'invoices_overdue', (select count(*) from public.invoices where status = 'overdue'),
    'generated_at', now()
  ) || app.overview_extra() into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Admin console RPCs. All judge the caller in SQL (app.is_superadmin() /
--    app.is_service()) and run as the signed-in superadmin, so the audit
--    triggers record the real actor.
-- ---------------------------------------------------------------------------
create or replace function app.assert_superadmin()
returns void language plpgsql stable as $$
begin
  if not (app.is_service() or app.is_superadmin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;

-- Accounts list: one row per account with the columns the admin list shows, plus the hook's keys.
create or replace function public.admin_list_accounts(p_query text default null, p_limit int default 50)
returns setof jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.assert_superadmin();
  return query
    select jsonb_build_object(
      'id', a.id,
      'name', a.name,
      'slug', a.slug,
      'access_status', a.access_status,
      'is_internal', a.is_internal,
      'country', a.country,
      'created_at', a.created_at,
      'plan_key', p.key,
      'plan_name', p.name,
      'owner_email', u.email,
      'paid_through', (select max(s.paid_through) from public.subscriptions s
                        where s.account_id = a.id and s.status in ('trialing','active','grace','past_due','comped')),
      'subscription_status', (select s.status from public.subscriptions s
                               where s.account_id = a.id and s.status in ('trialing','active','grace','past_due','comped')
                               limit 1),
      'wizard_done', (a.wizard_state ? 'completed_at')
    ) || app.admin_account_extra(a.id)
    from public.accounts a
    left join public.plans p on p.id = public.effective_plan_id(a.id)
    left join public.users u on u.id = a.owner_user_id
    where p_query is null or p_query = ''
       or a.name ilike '%' || p_query || '%'
       or a.slug ilike '%' || p_query || '%'
       or u.email ilike '%' || p_query || '%'
       or app.admin_account_matches(a.id, p_query)
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;

-- Everything the account page shows, in one call. The product's keys come from the hook.
create or replace function public.admin_account_detail(p_account uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform app.assert_superadmin();
  select jsonb_build_object(
    'account', (select to_jsonb(a) from public.accounts a where a.id = p_account),
    'owner', (select jsonb_build_object('id', u.id, 'email', u.email, 'display_name', u.display_name, 'is_superadmin', u.is_superadmin)
                from public.accounts a join public.users u on u.id = a.owner_user_id where a.id = p_account),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role, 'status', m.status) order by m.created_at)
                from public.account_members m join public.users u on u.id = m.user_id where m.account_id = p_account), '[]'::jsonb),
    'subscription', (select to_jsonb(s) || jsonb_build_object('plan_key', p.key, 'plan_name', p.name)
                       from public.subscriptions s join public.plans p on p.id = s.plan_id
                      where s.account_id = p_account and s.status in ('trialing','active','grace','past_due','comped')
                      limit 1),
    'plan', (select jsonb_build_object('key', p.key, 'name', p.name) from public.plans p where p.id = public.effective_plan_id(p_account)),
    'entitled', public.is_entitled(p_account),
    'entitlements', public.effective_entitlements(p_account),
    'overrides', coalesce((select jsonb_agg(jsonb_build_object('feature_key', f.key, 'value', ae.value, 'reason', ae.reason, 'expires_at', ae.expires_at))
                from public.account_entitlements ae join public.features f on f.id = ae.feature_id where ae.account_id = p_account), '[]'::jsonb),
    'usage', coalesce((select jsonb_agg(jsonb_build_object('feature_key', c.feature_key, 'period_start', c.period_start, 'used', c.used) order by c.period_start desc, c.feature_key)
                from (select * from public.usage_counters where account_id = p_account order by period_start desc limit 12) c), '[]'::jsonb),
    'view_as_sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'admin_email', u.email, 'reason', s.reason, 'started_at', s.started_at, 'ended_at', s.ended_at) order by s.started_at desc)
                from (select * from public.impersonation_sessions where account_id = p_account order by started_at desc limit 10) s
                join public.users u on u.id = s.admin_user_id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'action', l.action, 'entity_type', l.entity_type, 'actor_role', l.actor_role, 'actor_user_id', l.actor_user_id) order by l.at desc)
                from (select * from public.audit_log where account_id = p_account order by at desc limit 20) l), '[]'::jsonb)
  ) || app.admin_account_extra(p_account) into v;
  if jsonb_typeof(v -> 'account') = 'null' then
    raise exception 'no such account' using errcode = 'P0002';
  end if;
  return v;
end $$;

-- View-as: opens an audited impersonation session (spec §6; §10.3 default: view any account).
-- Writes into a customer's account are NOT unlocked by this — that needs owner consent (later).
create or replace function public.admin_start_view_as(p_account uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform app.assert_superadmin();
  if auth.uid() is null then
    raise exception 'view-as needs a signed-in superadmin' using errcode = '28000';
  end if;
  if not exists (select 1 from public.accounts where id = p_account) then
    raise exception 'no such account' using errcode = 'P0002';
  end if;
  -- one open session per admin: close the previous one
  update public.impersonation_sessions set ended_at = now()
   where admin_user_id = auth.uid() and ended_at is null;
  insert into public.impersonation_sessions (admin_user_id, account_id, reason, consent_source)
  values (auth.uid(), p_account, nullif(trim(coalesce(p_reason, '')), ''), 'internal')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_end_view_as(p_session uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.assert_superadmin();
  update public.impersonation_sessions set ended_at = now()
   where id = p_session and ended_at is null and (admin_user_id = auth.uid() or app.is_service());
end $$;

-- Plan × feature matrix edit (spec §6 "Modules & features"). Value is validated
-- against the feature kind; the audit trigger on plan_features records the change.
create or replace function public.admin_set_plan_feature(p_plan_key text, p_feature_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_plan uuid; v_feature uuid; v_kind text; t text;
begin
  perform app.assert_superadmin();
  select id into v_plan from public.plans where key = p_plan_key;
  select id, kind into v_feature, v_kind from public.features where key = p_feature_key;
  if v_plan is null or v_feature is null then
    raise exception 'unknown plan or feature (% / %)', p_plan_key, p_feature_key using errcode = 'P0002';
  end if;
  t := jsonb_typeof(p_value);
  if v_kind = 'flag' then
    if t <> 'boolean' then raise exception 'flag % needs true/false', p_feature_key using errcode = '22023'; end if;
  else
    if not (t = 'number' or (t = 'object' and p_value ? 'limit' and jsonb_typeof(p_value -> 'limit') = 'number')) then
      raise exception '% needs a number (-1 = unlimited) or {"limit": n, "period": "…"}', p_feature_key using errcode = '22023';
    end if;
  end if;
  insert into public.plan_features (plan_id, feature_id, value) values (v_plan, v_feature, p_value)
  on conflict (plan_id, feature_id) do update set value = excluded.value;
end $$;

-- Per-account grant (an override of the plan), settings, flags, owner settings.
create or replace function public.admin_set_account_entitlement(p_account uuid, p_feature_key text, p_value jsonb, p_reason text default null, p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_feature uuid; v_kind text; t text;
begin
  perform app.assert_superadmin();
  select id, kind into v_feature, v_kind from public.features where key = p_feature_key;
  if v_feature is null then
    raise exception 'unknown feature %', p_feature_key using errcode = 'P0002';
  end if;
  if p_value is null then
    delete from public.account_entitlements where account_id = p_account and feature_id = v_feature;
    return;
  end if;
  t := jsonb_typeof(p_value);
  if v_kind = 'flag' and t <> 'boolean' then
    raise exception 'flag % needs true/false', p_feature_key using errcode = '22023';
  elsif v_kind <> 'flag' and not (t = 'number' or (t = 'object' and p_value ? 'limit')) then
    raise exception '% needs a number or {"limit": n, "period": "…"}', p_feature_key using errcode = '22023';
  end if;
  insert into public.account_entitlements (account_id, feature_id, value, reason, granted_by, expires_at)
  values (p_account, v_feature, p_value, p_reason, auth.uid(), p_expires_at)
  on conflict (account_id, feature_id) do update
    set value = excluded.value, reason = excluded.reason, granted_by = excluded.granted_by, expires_at = excluded.expires_at, starts_at = now();
end $$;

create or replace function public.admin_list_settings()
returns setof jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.assert_superadmin();
  return query
    select jsonb_build_object('key', s.key, 'value', s.value, 'description', s.description, 'updated_at', s.updated_at)
      from public.system_settings s order by s.key;
end $$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb, p_description text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.assert_superadmin();
  if p_key !~ '^[a-z0-9_.]{1,80}$' then
    raise exception 'bad setting key' using errcode = '22023';
  end if;
  if p_value is null then
    delete from public.system_settings where key = p_key;
    return;
  end if;
  insert into public.system_settings (key, value, description, updated_by, updated_at)
  values (p_key, p_value, p_description, auth.uid(), now())
  on conflict (key) do update
    set value = excluded.value, description = coalesce(excluded.description, public.system_settings.description),
        updated_by = excluded.updated_by, updated_at = now();
end $$;

create or replace function public.admin_set_flag(p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.assert_superadmin();
  update public.feature_flags set enabled = p_enabled, updated_by = auth.uid(), updated_at = now() where key = p_key;
  if not found then
    raise exception 'unknown flag %', p_key using errcode = 'P0002';
  end if;
end $$;

create or replace function public.owner_setting(p_key text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when app.is_superadmin() or app.is_service()
              then (select value from public.system_settings where key = p_key)
              else null end
$$;

revoke execute on function public.admin_list_accounts(text, int) from public, anon;
revoke execute on function public.admin_account_detail(uuid) from public, anon;
revoke execute on function public.admin_start_view_as(uuid, text) from public, anon;
revoke execute on function public.admin_end_view_as(uuid) from public, anon;
revoke execute on function public.admin_set_plan_feature(text, text, jsonb) from public, anon;
revoke execute on function public.admin_set_account_entitlement(uuid, text, jsonb, text, timestamptz) from public, anon;
revoke execute on function public.admin_list_settings() from public, anon;
revoke execute on function public.admin_set_setting(text, jsonb, text) from public, anon;
revoke execute on function public.admin_set_flag(text, boolean) from public, anon;
revoke execute on function public.owner_setting(text) from public, anon;
grant execute on function public.admin_list_accounts(text, int) to authenticated, service_role;
grant execute on function public.admin_account_detail(uuid) to authenticated, service_role;
grant execute on function public.admin_start_view_as(uuid, text) to authenticated, service_role;
grant execute on function public.admin_end_view_as(uuid) to authenticated, service_role;
grant execute on function public.admin_set_plan_feature(text, text, jsonb) to authenticated, service_role;
grant execute on function public.admin_set_account_entitlement(uuid, text, jsonb, text, timestamptz) to authenticated, service_role;
grant execute on function public.admin_list_settings() to authenticated, service_role;
grant execute on function public.admin_set_setting(text, jsonb, text) to authenticated, service_role;
grant execute on function public.admin_set_flag(text, boolean) to authenticated, service_role;
grant execute on function public.owner_setting(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table public.audit_log enable row level security;
alter table public.feature_flags enable row level security;

create policy audit_superadmin_read on public.audit_log for select to authenticated using (app.is_superadmin());
create policy flags_read on public.feature_flags for select to authenticated using (true);
