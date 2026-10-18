-- 003_entitlements_billing — the module system, subscriptions, payments across
-- every rail, invoices, discount codes, credits, usage metering. Spec §2.6, D4, D8.
--
-- Principle: what a customer is ALLOWED (entitlements) is separate from whether
-- they have PAID (subscription + payments), and both are separate from HOW they
-- paid (the rail). subscriptions.paid_through is the only date that grants access.

-- ---------------------------------------------------------------------------
-- Registry: modules, features, plans, prices, plan × feature matrix
-- ---------------------------------------------------------------------------
create table public.modules (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  name         text not null,
  description  text,
  sort_order   int not null default 100,
  is_active    boolean not null default true,
  visibility   text not null default 'public' check (visibility in ('public','internal'))
);

create table public.features (
  id             uuid primary key default gen_random_uuid(),
  module_id      uuid not null references public.modules (id) on delete cascade,
  key            text not null unique,                  -- dotted: radar.realtime_feed
  name           text not null,
  description    text,
  kind           text not null check (kind in ('flag','quota','limit')),
  unit           text not null default 'absolute' check (unit in ('per_day','per_week','per_month','lifetime','absolute')),
  default_value  jsonb not null default 'false'::jsonb, -- flag: true/false · quota/limit: number (-1 = unlimited)
                                                        -- or {"limit": n, "period": "lifetime"} to override the unit per plan
  is_active      boolean not null default true
);
create index features_module_idx on public.features (module_id);

create table public.plans (
  id                     uuid primary key default gen_random_uuid(),
  key                    text not null unique,          -- free / founding / pro / crew
  name                   text not null,
  description            text,
  is_public              boolean not null default true,
  is_default_for_signup  boolean not null default false,
  sort_order             int not null default 100,
  created_at             timestamptz not null default now()
);
create unique index plans_one_default_idx on public.plans (is_default_for_signup) where is_default_for_signup;

alter table public.accounts
  add constraint accounts_plan_fk foreign key (plan_id) references public.plans (id);

create table public.plan_prices (
  id                  uuid primary key default gen_random_uuid(),
  plan_id             uuid not null references public.plans (id) on delete cascade,
  term_months         int not null check (term_months in (1, 12, 24, 36)),
  price_cents         int not null check (price_cents >= 0),
  currency            text not null default 'EUR',
  provider_price_ids  jsonb not null default '{}'::jsonb,   -- {"paddle": "pri_…", "lemonsqueezy": "…", "stripe": "price_…"}
  is_active           boolean not null default true,
  unique (plan_id, term_months, currency)
);

create table public.plan_features (
  plan_id     uuid not null references public.plans (id) on delete cascade,
  feature_id  uuid not null references public.features (id) on delete cascade,
  value       jsonb not null,
  primary key (plan_id, feature_id)
);

create table public.account_entitlements (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  feature_id  uuid not null references public.features (id) on delete cascade,
  value       jsonb not null,
  reason      text,
  granted_by  uuid references public.users (id),
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (account_id, feature_id)                       -- one override per feature per account
);

-- ---------------------------------------------------------------------------
-- subscriptions — the commitment. paid_through grants access.
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  account_id                uuid not null references public.accounts (id) on delete cascade,
  plan_id                   uuid not null references public.plans (id),
  plan_price_id             uuid references public.plan_prices (id),
  term_months               int not null default 1 check (term_months in (1, 12, 24, 36)),
  status                    text not null default 'active'
                            check (status in ('trialing','active','grace','past_due','cancelled','comped')),
  starts_at                 timestamptz not null default now(),
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  paid_through              date,                       -- THE access date
  grace_days                int not null default 7,
  auto_renew                boolean not null default false,
  renewal_rail              text,
  provider                  text not null default 'manual' check (provider in ('paddle','lemonsqueezy','stripe','manual')),
  provider_subscription_id  text,
  discount_code_id          uuid,                       -- fk below
  cancel_at                 timestamptz,
  cancelled_at              timestamptz,
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
-- one live subscription per account; cancelled ones stay as history
create unique index subscriptions_one_live_idx on public.subscriptions (account_id)
  where status in ('trialing','active','grace','past_due','comped');
create index subscriptions_paid_through_idx on public.subscriptions (paid_through) where status <> 'cancelled';
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- invoices + payments — every rail feeds the same ledger
-- ---------------------------------------------------------------------------
create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts (id) on delete cascade,
  subscription_id   uuid references public.subscriptions (id),
  number            text not null unique,               -- e.g. 2026-0001
  status            text not null default 'draft' check (status in ('draft','sent','paid','void','overdue')),
  amount_cents      int not null check (amount_cents >= 0),
  currency          text not null default 'EUR',
  vat_cents         int not null default 0,
  vat_note          text,
  covers_from       date,
  covers_to         date,
  due_at            timestamptz,
  issued_at         timestamptz,
  paid_at           timestamptz,
  payment_id        uuid,                                -- fk below
  pdf_url           text,
  pay_instructions  jsonb not null default '{}'::jsonb,  -- {"card_url": …, "wise": {...}, "bank": {...}, "crypto": {...}}
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index invoices_account_idx on public.invoices (account_id, status);
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function app.set_updated_at();

create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts (id) on delete cascade,
  subscription_id   uuid references public.subscriptions (id),
  invoice_id        uuid references public.invoices (id),
  rail              text not null check (rail in ('card_paddle','card_lemonsqueezy','card_stripe','stripe_link','wise','bank_transfer','vipps','crypto','manual_other')),
  status            text not null default 'pending' check (status in ('pending','confirmed','failed','refunded','chargeback')),
  amount_cents      int not null check (amount_cents >= 0),
  currency          text not null default 'EUR',
  fiat_value_cents  int,                                 -- value in account currency at receipt (crypto)
  covers_from       date,
  covers_to         date,
  external_ref      text,                                -- provider charge id · Wise/bank reference · crypto tx hash
  details           jsonb not null default '{}'::jsonb,  -- network, asset, amount_asset, sender, screenshot_url …
  recorded_by       uuid references public.users (id),   -- null = webhook; user id = manual entry
  received_at       timestamptz not null default now(),
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index payments_account_idx on public.payments (account_id, received_at desc);
create index payments_status_idx on public.payments (status) where status = 'pending';
create unique index payments_external_ref_idx on public.payments (rail, external_ref) where external_ref is not null;
create trigger payments_set_updated_at before update on public.payments
  for each row execute function app.set_updated_at();

alter table public.invoices
  add constraint invoices_payment_fk foreign key (payment_id) references public.payments (id);

-- Sequential invoice numbers per year: 2026-0001, 2026-0002 …
create or replace function app.next_invoice_number()
returns text language plpgsql as $$
declare y text := to_char(now(), 'YYYY'); n int;
begin
  select coalesce(max(split_part(number, '-', 2)::int), 0) + 1 into n
    from public.invoices where number like y || '-%';
  return y || '-' || lpad(n::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------------
-- discount codes
-- ---------------------------------------------------------------------------
create table public.discount_codes (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,
  kind               text not null check (kind in ('percent','fixed','free_months','price_override')),
  value              numeric not null,                   -- percent (0-100) · cents · months · cents
  currency           text,
  applies_to_plans   text[] not null default '{}',       -- plan keys; empty = all
  applies_to_terms   int[] not null default '{}',        -- term months; empty = all
  duration           text not null default 'once' check (duration in ('once','first_period','forever')),
  max_redemptions    int,
  redeemed_count     int not null default 0,
  per_account_limit  int not null default 1,
  valid_from         timestamptz,
  valid_until        timestamptz,
  is_active          boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now()
);
create unique index discount_codes_code_idx on public.discount_codes (lower(code));

create table public.discount_redemptions (
  id                 uuid primary key default gen_random_uuid(),
  discount_code_id   uuid not null references public.discount_codes (id) on delete cascade,
  account_id         uuid not null references public.accounts (id) on delete cascade,
  subscription_id    uuid references public.subscriptions (id),
  redeemed_at        timestamptz not null default now(),
  amount_saved_cents int not null default 0
);
create index discount_redemptions_code_idx on public.discount_redemptions (discount_code_id, account_id);

alter table public.subscriptions
  add constraint subscriptions_discount_fk foreign key (discount_code_id) references public.discount_codes (id);

-- ---------------------------------------------------------------------------
-- credits (top-ups) and usage metering
-- ---------------------------------------------------------------------------
create table public.credit_balances (
  account_id   uuid not null references public.accounts (id) on delete cascade,
  credit_type  text not null,                             -- feature key, e.g. research.runs_per_month
  balance      int not null default 0 check (balance >= 0),
  updated_at   timestamptz not null default now(),
  primary key (account_id, credit_type)
);

create table public.credit_transactions (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  credit_type  text not null,
  delta        int not null,
  reason       text not null,                             -- purchase / consume / refund / grant
  ref          text,
  created_by   uuid references public.users (id),
  created_at   timestamptz not null default now()
);
create index credit_transactions_account_idx on public.credit_transactions (account_id, created_at desc);

create table public.usage_events (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  identity_id     uuid,
  user_id         uuid,
  feature_key     text not null,
  quantity        int not null default 1,
  cost_usd_micro  bigint not null default 0,
  model           text,
  tokens_in       int,
  tokens_out      int,
  ref_type        text,
  ref_id          uuid,
  occurred_at     timestamptz not null default now()
);
create index usage_events_account_idx on public.usage_events (account_id, occurred_at desc);
create index usage_events_feature_idx on public.usage_events (feature_key, occurred_at desc);

create table public.usage_counters (
  account_id    uuid not null references public.accounts (id) on delete cascade,
  feature_key   text not null,
  period_start  date not null,
  used          int not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (account_id, feature_key, period_start)
);

-- ---------------------------------------------------------------------------
-- Access and resolution rules
-- ---------------------------------------------------------------------------

-- true while the live subscription is paid through today (+ grace) or comped,
-- and the account is not suspended.
create or replace function public.is_entitled(p_account uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from public.subscriptions s
      join public.accounts a on a.id = s.account_id
     where s.account_id = p_account
       and a.access_status <> 'suspended'
       and s.status in ('trialing','active','grace','comped')
       and (s.status = 'comped'
            or (s.paid_through is not null and s.paid_through + s.grace_days >= current_date))
  )
$$;

-- the plan whose values apply right now (paid plan if entitled, else the free plan)
create or replace function public.effective_plan_id(p_account uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select case
           when public.is_entitled(p_account)
             then coalesce((select s.plan_id from public.subscriptions s
                             where s.account_id = p_account
                               and s.status in ('trialing','active','grace','comped')
                             limit 1),
                           (select a.plan_id from public.accounts a where a.id = p_account))
           else (select p.id from public.plans p where p.key = 'free')
         end
$$;

create or replace function app.can_read_account(p_account uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_service()
      or app.is_superadmin()
      or app.is_member(p_account)
$$;

-- Resolution: account override → effective plan value → feature default.
-- Overrides are explicit admin grants and apply whether or not the account is entitled.
create or replace function public.effective_entitlements(p_account uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_plan uuid; v_out jsonb;
begin
  if not app.can_read_account(p_account) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_plan := public.effective_plan_id(p_account);
  select coalesce(jsonb_object_agg(f.key, coalesce(ae.value, pf.value, f.default_value)), '{}'::jsonb)
    into v_out
    from public.features f
    left join public.plan_features pf on pf.feature_id = f.id and pf.plan_id = v_plan
    left join public.account_entitlements ae
           on ae.account_id = p_account and ae.feature_id = f.id
          and ae.starts_at <= now() and (ae.expires_at is null or ae.expires_at > now())
   where f.is_active;
  return v_out;
end $$;

create or replace function public.feature_value(p_account uuid, p_key text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_plan uuid; v jsonb;
begin
  if not app.can_read_account(p_account) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_plan := public.effective_plan_id(p_account);
  select coalesce(ae.value, pf.value, f.default_value) into v
    from public.features f
    left join public.plan_features pf on pf.feature_id = f.id and pf.plan_id = v_plan
    left join public.account_entitlements ae
           on ae.account_id = p_account and ae.feature_id = f.id
          and ae.starts_at <= now() and (ae.expires_at is null or ae.expires_at > now())
   where f.key = p_key and f.is_active;
  -- {"limit": n, "period": "…"} → n
  if v is not null and jsonb_typeof(v) = 'object' and v ? 'limit' then
    return v -> 'limit';
  end if;
  return v;
end $$;

-- flag → its value; quota/limit → true when > 0 or unlimited (-1)
create or replace function public.has_feature(p_account uuid, p_key text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  v := public.feature_value(p_account, p_key);
  if v is null then return false; end if;
  if jsonb_typeof(v) = 'boolean' then return v::boolean; end if;
  if jsonb_typeof(v) = 'number' then return (v::text)::numeric <> 0; end if;
  return false;
end $$;

create or replace function app.quota_period_start(p_unit text)
returns date language sql stable as $$
  select case p_unit
           when 'per_day'   then current_date
           when 'per_week'  then date_trunc('week', current_date)::date
           when 'per_month' then date_trunc('month', current_date)::date
           else date '1970-01-01'                         -- lifetime / absolute
         end
$$;

-- Atomic quota check + increment + usage event. Returns
-- {"allowed": bool, "source": quota|credits|unlimited|denied|flag, "used": n, "limit": n, "period_start": d}
-- Every gated server action calls this BEFORE doing the work. Never trust the client.
create or replace function public.consume_quota(
  p_account uuid,
  p_feature_key text,
  p_quantity int default 1,
  p_identity uuid default null,
  p_ref_type text default null,
  p_ref_id uuid default null,
  p_cost_usd_micro bigint default 0,
  p_model text default null,
  p_tokens_in int default null,
  p_tokens_out int default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f public.features;
  v_raw jsonb; v_limit int; v_period text; v_start date; v_used int; v_credits int;
begin
  if not app.can_read_account(p_account) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into f from public.features where key = p_feature_key and is_active;
  if not found then
    raise exception 'unknown feature %', p_feature_key using errcode = '22023';
  end if;

  -- raw value with possible {"limit","period"} override
  select coalesce(ae.value, pf.value, f.default_value) into v_raw
    from public.features ff
    left join public.plan_features pf on pf.feature_id = ff.id and pf.plan_id = public.effective_plan_id(p_account)
    left join public.account_entitlements ae
           on ae.account_id = p_account and ae.feature_id = ff.id
          and ae.starts_at <= now() and (ae.expires_at is null or ae.expires_at > now())
   where ff.id = f.id;

  if f.kind = 'flag' then
    if coalesce(v_raw::boolean, false) then
      insert into public.usage_events (account_id, identity_id, user_id, feature_key, quantity, cost_usd_micro, model, tokens_in, tokens_out, ref_type, ref_id)
      values (p_account, p_identity, auth.uid(), p_feature_key, p_quantity, coalesce(p_cost_usd_micro, 0), p_model, p_tokens_in, p_tokens_out, p_ref_type, p_ref_id);
      return jsonb_build_object('allowed', true, 'source', 'flag');
    end if;
    return jsonb_build_object('allowed', false, 'source', 'denied', 'reason', 'feature not in plan');
  end if;

  if jsonb_typeof(v_raw) = 'object' then
    v_limit := coalesce((v_raw ->> 'limit')::int, 0);
    v_period := coalesce(v_raw ->> 'period', f.unit);
  else
    v_limit := coalesce((v_raw::text)::int, 0);
    v_period := f.unit;
  end if;
  v_start := app.quota_period_start(v_period);

  if v_limit = -1 then
    insert into public.usage_counters (account_id, feature_key, period_start, used)
    values (p_account, p_feature_key, v_start, p_quantity)
    on conflict (account_id, feature_key, period_start) do update
      set used = public.usage_counters.used + excluded.used, updated_at = now()
    returning used into v_used;
    insert into public.usage_events (account_id, identity_id, user_id, feature_key, quantity, cost_usd_micro, model, tokens_in, tokens_out, ref_type, ref_id)
    values (p_account, p_identity, auth.uid(), p_feature_key, p_quantity, coalesce(p_cost_usd_micro, 0), p_model, p_tokens_in, p_tokens_out, p_ref_type, p_ref_id);
    return jsonb_build_object('allowed', true, 'source', 'unlimited', 'used', v_used, 'limit', -1, 'period_start', v_start);
  end if;

  -- lock the counter row
  insert into public.usage_counters (account_id, feature_key, period_start, used)
  values (p_account, p_feature_key, v_start, 0)
  on conflict do nothing;
  select used into v_used from public.usage_counters
   where account_id = p_account and feature_key = p_feature_key and period_start = v_start
   for update;

  if v_used + p_quantity <= v_limit then
    update public.usage_counters set used = used + p_quantity, updated_at = now()
     where account_id = p_account and feature_key = p_feature_key and period_start = v_start
    returning used into v_used;
    insert into public.usage_events (account_id, identity_id, user_id, feature_key, quantity, cost_usd_micro, model, tokens_in, tokens_out, ref_type, ref_id)
    values (p_account, p_identity, auth.uid(), p_feature_key, p_quantity, coalesce(p_cost_usd_micro, 0), p_model, p_tokens_in, p_tokens_out, p_ref_type, p_ref_id);
    return jsonb_build_object('allowed', true, 'source', 'quota', 'used', v_used, 'limit', v_limit, 'period_start', v_start);
  end if;

  -- quota exhausted → credits
  select balance into v_credits from public.credit_balances
   where account_id = p_account and credit_type = p_feature_key for update;
  if coalesce(v_credits, 0) >= p_quantity then
    update public.credit_balances set balance = balance - p_quantity, updated_at = now()
     where account_id = p_account and credit_type = p_feature_key;
    insert into public.credit_transactions (account_id, credit_type, delta, reason, ref, created_by)
    values (p_account, p_feature_key, -p_quantity, 'consume', p_ref_type || ':' || coalesce(p_ref_id::text, ''), auth.uid());
    insert into public.usage_events (account_id, identity_id, user_id, feature_key, quantity, cost_usd_micro, model, tokens_in, tokens_out, ref_type, ref_id)
    values (p_account, p_identity, auth.uid(), p_feature_key, p_quantity, coalesce(p_cost_usd_micro, 0), p_model, p_tokens_in, p_tokens_out, p_ref_type, p_ref_id);
    return jsonb_build_object('allowed', true, 'source', 'credits', 'used', v_used, 'limit', v_limit, 'credits_left', v_credits - p_quantity, 'period_start', v_start);
  end if;

  return jsonb_build_object('allowed', false, 'source', 'denied', 'used', v_used, 'limit', v_limit, 'period_start', v_start);
end $$;

-- ---------------------------------------------------------------------------
-- Access status derivation, payment application, nightly lapse
-- ---------------------------------------------------------------------------
create or replace function app.refresh_access_status(p_account uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.subscriptions; v_status text; v_today date := current_date;
begin
  if (select access_status from public.accounts where id = p_account) = 'suspended' then
    return 'suspended';
  end if;
  select * into s from public.subscriptions
   where account_id = p_account and status in ('trialing','active','grace','past_due','comped')
   limit 1;
  if not found then
    v_status := 'active';                                -- free plan
  elsif s.status = 'comped' then
    v_status := 'comped';
  elsif s.paid_through is not null and s.paid_through >= v_today then
    v_status := case when s.status = 'trialing' then 'trialing' else 'active' end;
    if s.status in ('grace','past_due') then
      update public.subscriptions set status = 'active' where id = s.id and status <> 'active';
    end if;
  elsif s.paid_through is not null and s.paid_through + s.grace_days >= v_today then
    v_status := 'grace';
    if s.status <> 'trialing' then
      update public.subscriptions set status = 'grace' where id = s.id and status <> 'grace';
    end if;
  else
    if s.status = 'trialing' then
      update public.subscriptions set status = 'cancelled', cancelled_at = now() where id = s.id and status <> 'cancelled';
      v_status := 'active';                              -- trial ended → free plan
    else
      update public.subscriptions set status = 'past_due' where id = s.id and status <> 'past_due';
      v_status := 'past_due';
    end if;
  end if;
  update public.accounts set access_status = v_status where id = p_account and access_status is distinct from v_status;
  return v_status;
end $$;

-- A confirmed payment extends the subscription and marks its invoice paid.
create or replace function app.apply_confirmed_payment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    if new.confirmed_at is null then new.confirmed_at := now(); end if;
    if new.subscription_id is not null and new.covers_to is not null then
      update public.subscriptions
         set paid_through = greatest(coalesce(paid_through, new.covers_from, new.covers_to), new.covers_to),
             current_period_start = coalesce(new.covers_from::timestamptz, current_period_start),
             current_period_end = new.covers_to::timestamptz,
             status = case when status = 'comped' then 'comped' else 'active' end
       where id = new.subscription_id;
    end if;
    if new.invoice_id is not null then
      update public.invoices set status = 'paid', paid_at = coalesce(paid_at, now()), payment_id = new.id
       where id = new.invoice_id;
    end if;
  end if;
  return new;
end $$;
create trigger payments_apply_confirmed before insert or update on public.payments
  for each row execute function app.apply_confirmed_payment();

create or replace function app.payments_after_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.refresh_access_status(new.account_id);
  return new;
end $$;
create trigger payments_refresh_access after insert or update on public.payments
  for each row execute function app.payments_after_write();

create or replace function app.subscriptions_after_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- refresh_access_status itself updates subscriptions; do not re-enter
  if pg_trigger_depth() > 1 then return null; end if;
  perform app.refresh_access_status(coalesce(new.account_id, old.account_id));
  return null;
end $$;
create trigger subscriptions_refresh_access after insert or update or delete on public.subscriptions
  for each row execute function app.subscriptions_after_write();

-- Nightly job (pg_cron on Supabase: select cron.schedule('lapse', '15 3 * * *', $$select public.run_subscription_lapse()$$);)
create or replace function public.run_subscription_lapse()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare n int := 0; r record;
begin
  if not app.is_service() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for r in select distinct account_id from public.subscriptions
            where status in ('trialing','active','grace','past_due') loop
    perform app.refresh_access_status(r.account_id);
    n := n + 1;
  end loop;
  update public.invoices set status = 'overdue'
   where status = 'sent' and due_at is not null and due_at < now();
  return n;
end $$;

-- Manual path (admin console "record a payment", any rail). Creates the live
-- subscription if the account has none. Returns the payment id.
create or replace function public.record_manual_payment(
  p_account uuid,
  p_rail text,
  p_amount_cents int,
  p_currency text,
  p_covers_from date,
  p_covers_to date,
  p_plan_key text default null,
  p_term_months int default null,
  p_external_ref text default null,
  p_details jsonb default '{}'::jsonb,
  p_invoice_id uuid default null,
  p_fiat_value_cents int default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sub uuid; v_plan uuid; v_price uuid; v_payment uuid;
begin
  if not (app.is_service() or app.is_superadmin()) then
    raise exception 'superadmin only' using errcode = '42501';
  end if;
  select id into v_sub from public.subscriptions
   where account_id = p_account and status in ('trialing','active','grace','past_due','comped') limit 1;
  if v_sub is null then
    select id into v_plan from public.plans where key = coalesce(p_plan_key, 'pro');
    select id into v_price from public.plan_prices
     where plan_id = v_plan and term_months = coalesce(p_term_months, 1) and is_active limit 1;
    insert into public.subscriptions (account_id, plan_id, plan_price_id, term_months, status, starts_at, provider, renewal_rail)
    values (p_account, v_plan, v_price, coalesce(p_term_months, 1), 'active', now(), 'manual', p_rail)
    returning id into v_sub;
    update public.accounts set plan_id = v_plan where id = p_account;
  end if;
  insert into public.payments (account_id, subscription_id, invoice_id, rail, status, amount_cents, currency,
                               fiat_value_cents, covers_from, covers_to, external_ref, details, recorded_by, confirmed_at)
  values (p_account, v_sub, p_invoice_id, p_rail, 'confirmed', p_amount_cents, p_currency,
          p_fiat_value_cents, p_covers_from, p_covers_to, p_external_ref, coalesce(p_details, '{}'::jsonb), auth.uid(), now())
  returning id into v_payment;
  return v_payment;
end $$;

-- Checkout helper: what does a code do for this plan/term? Exposes nothing
-- about limits or redemption counts.
create or replace function public.preview_discount(p_code text, p_plan_key text, p_term_months int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare d public.discount_codes; v_price int; v_after int;
begin
  select * into d from public.discount_codes
   where lower(code) = lower(p_code) and is_active
     and (valid_from is null or valid_from <= now())
     and (valid_until is null or valid_until > now())
     and (cardinality(applies_to_plans) = 0 or p_plan_key = any (applies_to_plans))
     and (cardinality(applies_to_terms) = 0 or p_term_months = any (applies_to_terms))
     and (max_redemptions is null or redeemed_count < max_redemptions);
  if not found then
    return jsonb_build_object('valid', false);
  end if;
  select pp.price_cents into v_price from public.plan_prices pp join public.plans p on p.id = pp.plan_id
   where p.key = p_plan_key and pp.term_months = p_term_months and pp.is_active limit 1;
  v_after := case d.kind
               when 'percent'        then greatest(0, round(v_price * (1 - d.value / 100.0)))::int
               when 'fixed'          then greatest(0, v_price - d.value)::int
               when 'price_override' then d.value::int
               else v_price
             end;
  return jsonb_build_object('valid', true, 'kind', d.kind, 'value', d.value, 'duration', d.duration,
                            'price_cents', v_price, 'price_after_cents', v_after, 'currency', coalesce(d.currency, 'EUR'));
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.modules enable row level security;
alter table public.features enable row level security;
alter table public.plans enable row level security;
alter table public.plan_prices enable row level security;
alter table public.plan_features enable row level security;
alter table public.account_entitlements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.discount_codes enable row level security;
alter table public.discount_redemptions enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.usage_events enable row level security;
alter table public.usage_counters enable row level security;

-- registry: readable by everyone (pricing page), writable by service role only
create policy modules_read on public.modules for select to anon, authenticated using (is_active);
create policy features_read on public.features for select to anon, authenticated using (is_active);
create policy plans_read on public.plans for select to anon, authenticated using (is_public or app.is_superadmin());
create policy plan_prices_read on public.plan_prices for select to anon, authenticated using (is_active);
create policy plan_features_read on public.plan_features for select to anon, authenticated using (true);

-- per-account: members read their own; all writes go through the server
create policy entitlements_read on public.account_entitlements for select to authenticated using (app.is_member(account_id));
create policy subscriptions_read on public.subscriptions for select to authenticated using (app.is_member(account_id));
create policy invoices_read on public.invoices for select to authenticated using (app.is_member(account_id));
create policy payments_read on public.payments for select to authenticated using (app.is_member(account_id));
create policy redemptions_read on public.discount_redemptions for select to authenticated using (app.is_member(account_id));
create policy credit_balances_read on public.credit_balances for select to authenticated using (app.is_member(account_id));
create policy credit_transactions_read on public.credit_transactions for select to authenticated using (app.is_member(account_id));
create policy usage_events_read on public.usage_events for select to authenticated using (app.is_member(account_id));
create policy usage_counters_read on public.usage_counters for select to authenticated using (app.is_member(account_id));
-- discount_codes: no client access at all (preview_discount is the only door)
