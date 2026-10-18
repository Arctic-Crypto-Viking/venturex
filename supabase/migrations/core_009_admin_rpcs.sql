-- core_009_admin_rpcs — the admin console's RPCs, platform core.
-- Generalised 18 Oct 2026 from artist-platform 009 §2 and 014 §2: no product table is named;
-- product keys in lists and detail come from app.admin_account_extra() (core_007).

-- ---------------------------------------------------------------------------
-- 2. Admin console RPCs
-- ---------------------------------------------------------------------------
create or replace function app.assert_superadmin()
returns void language plpgsql stable as $$
begin
  if not (app.is_service() or app.is_superadmin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;

-- Accounts list: one row per account with the columns the admin list shows.
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
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end $$;

-- Everything the account page shows, in one call. Product keys come from app.admin_account_extra().
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

revoke execute on function public.admin_list_accounts(text, int) from public, anon;
revoke execute on function public.admin_account_detail(uuid) from public, anon;
revoke execute on function public.admin_start_view_as(uuid, text) from public, anon;
revoke execute on function public.admin_end_view_as(uuid) from public, anon;
revoke execute on function public.admin_set_plan_feature(text, text, jsonb) from public, anon;
grant execute on function public.admin_list_accounts(text, int) to authenticated, service_role;
grant execute on function public.admin_account_detail(uuid) to authenticated, service_role;
grant execute on function public.admin_start_view_as(uuid, text) to authenticated, service_role;
grant execute on function public.admin_end_view_as(uuid) to authenticated, service_role;
grant execute on function public.admin_set_plan_feature(text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Additive admin RPCs (identical to investx 004 §2 and §4)
-- ---------------------------------------------------------------------------
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

revoke execute on function public.admin_set_account_entitlement(uuid, text, jsonb, text, timestamptz) from public, anon;
revoke execute on function public.admin_list_settings() from public, anon;
revoke execute on function public.admin_set_setting(text, jsonb, text) from public, anon;
revoke execute on function public.admin_set_flag(text, boolean) from public, anon;
revoke execute on function public.owner_setting(text) from public, anon;
grant execute on function public.admin_set_account_entitlement(uuid, text, jsonb, text, timestamptz) to authenticated, service_role;
grant execute on function public.admin_list_settings() to authenticated, service_role;
grant execute on function public.admin_set_setting(text, jsonb, text) to authenticated, service_role;
grant execute on function public.admin_set_flag(text, boolean) to authenticated, service_role;
grant execute on function public.owner_setting(text) to authenticated, service_role;

