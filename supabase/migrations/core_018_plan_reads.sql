-- 018_core_plan_reads — PLATFORM CORE (origin: artist-platform pull request #1,
-- 2 Oct 2026, migration 20261002000018_core_plan_reads.sql; taken into New Venture on
-- 18 Oct 2026 as its next number, verbatim below the header. A verbatim copy is
-- core/supabase/migrations/core_018_plan_reads.sql; every product that carries the core
-- takes it, PLATFORM-CORE.md §4 rule 1 — Mainfloor gets it when PR #1 merges, or
-- earlier as its own migration).
--
-- is_entitled() and effective_plan_id() (003) answered for ANY account id, to
-- anyone — visitors included — so whoever learned an account's id could see
-- whether it pays and on which plan. Every other entitlement reader
-- (effective_entitlements, feature_value) already asks app.can_read_account()
-- first; these two now do too. Internal callers keep working: they are the
-- account's members, the superadmin, the service role or the database itself
-- (pg_cron runs as postgres, which app.is_service() accepts).

create or replace function public.is_entitled(p_account uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.can_read_account(p_account) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return exists (
    select 1
      from public.subscriptions s
      join public.accounts a on a.id = s.account_id
     where s.account_id = p_account
       and a.access_status <> 'suspended'
       and s.status in ('trialing','active','grace','comped')
       and (s.status = 'comped'
            or (s.paid_through is not null and s.paid_through + s.grace_days >= current_date))
  );
end $$;

create or replace function public.effective_plan_id(p_account uuid)
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.can_read_account(p_account) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return case
           when public.is_entitled(p_account)
             then coalesce((select s.plan_id from public.subscriptions s
                             where s.account_id = p_account
                               and s.status in ('trialing','active','grace','comped')
                             limit 1),
                           (select a.plan_id from public.accounts a where a.id = p_account))
           else (select p.id from public.plans p where p.key = 'free')
         end;
end $$;

revoke execute on function public.is_entitled(uuid) from public, anon;
revoke execute on function public.effective_plan_id(uuid) from public, anon;
grant execute on function public.is_entitled(uuid) to authenticated, service_role;
grant execute on function public.effective_plan_id(uuid) to authenticated, service_role;
