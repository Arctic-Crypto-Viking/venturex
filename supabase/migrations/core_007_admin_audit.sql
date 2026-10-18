-- core_007_admin_audit — audit log, feature flags (kill switches), internal overview.
-- Platform core, generalised 18 Oct 2026 from artist-platform 007: no product table is named;
-- vertical figures come from app.overview_extra(), which a product redefines.

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

-- accounts: audit status/plan/internal changes only
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
-- Internal overview (§7) — read by GET /api/internal/overview (service role,
-- superadmin-scoped). The internal account is excluded from every figure.
-- ---------------------------------------------------------------------------
-- Product hooks: core reads them, the product may redefine them in a later migration.
create or replace function app.overview_extra()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select '{}'::jsonb
$$;
create or replace function app.admin_account_extra(p_account uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select '{}'::jsonb
$$;

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
-- RLS
-- ---------------------------------------------------------------------------
alter table public.audit_log enable row level security;
alter table public.feature_flags enable row level security;

create policy audit_superadmin_read on public.audit_log for select to authenticated using (app.is_superadmin());
create policy flags_read on public.feature_flags for select to authenticated using (true);
