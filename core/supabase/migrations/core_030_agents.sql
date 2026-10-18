-- core_030_agents — the agents module of the platform core (18 Oct 2026).
-- Shared by every product on the core (InvestX, Mainfloor, …). Source of this
-- file: platform-core/supabase/migrations/core_030_agents.sql — copy verbatim.
--
-- Design (InvestX requirements v0.3 §1–3, §7; agent simplification plan):
--   * COLLECTORS are generic scheduled code: they fetch shared data once for the
--     whole product and write snapshots. They never hold a person's data.
--   * PERSONAL AGENTS belong to one account: whatever the person selects is that
--     agent's focus (its `config`); every run is logged with tokens and cost.
--   * QUOTA: active + paused agents ≤ feature `agents.max` (plan value + add-ons),
--     enforced by the table itself, never only by the UI.
--   * CONFIRMATION: an agent exists only after the person confirmed the setup
--     text ("Do you want to set up this agent …?"); the text version is stored.
--   * THREAD: what agents produce for a person (alerts, updates, answers,
--     tickets) is one table, keyed by a free-text key the product chooses.
--   * SOCIAL: sources, items and signals for the social data collector (§7),
--     shared (account_id null) or per account.
-- Product-specific shapes (segments, markets, tickets) live in `config` /
-- `body` jsonb, so this file names no product table.

-- ---------------------------------------------------------------------------
-- 1. Catalogue of agent definitions (product seeds it in its own migration)
-- ---------------------------------------------------------------------------
create table public.agent_definitions (
  key               text primary key,                     -- e.g. investx.collector, investx.analyst
  name              text not null,
  kind              text not null check (kind in ('collector','personal','social')),
  description       text,
  default_schedule  text,                                 -- cron, CRON_TZ allowed
  default_model     text,                                 -- e.g. claude-fable-5-1
  default_config    jsonb not null default '{}'::jsonb,
  confirmation_text text,                                 -- the setup dialog's text (personal agents)
  text_version      int not null default 1,
  is_active         boolean not null default true,
  sort_order        int not null default 100
);
alter table public.agent_definitions enable row level security;
create policy agent_definitions_read on public.agent_definitions for select to authenticated using (true);
-- writes: service role / superadmin only (migrations and the admin console)

-- ---------------------------------------------------------------------------
-- 2. Personal agents (tenant data)
-- ---------------------------------------------------------------------------
create table public.agents (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.accounts (id) on delete cascade,
  user_id            uuid not null references public.users (id) on delete cascade,
  definition_key     text not null references public.agent_definitions (key),
  name               text not null,
  status             text not null default 'active' check (status in ('active','paused','unavailable','deleted')),
  schedule           text,                                -- cron; null = on demand only
  delivery           jsonb not null default '{"push": true, "email": false}'::jsonb,
  model              text,
  config             jsonb not null default '{}'::jsonb,  -- the person's focus: segments, markets, limits …
  confirmed_at       timestamptz,
  confirmation_text  text,
  text_version       int,
  last_run_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index agents_account_idx on public.agents (account_id, status);
create trigger agents_set_updated_at before update on public.agents for each row execute function app.set_updated_at();

-- quota: counted on the table, so no client path can exceed it
create or replace function app.guard_agent_limit()
returns trigger language plpgsql as $$
declare v_max int; v_count int;
begin
  if new.status not in ('active','paused') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('active','paused') then return new; end if;
  v_max := coalesce((public.feature_value(new.account_id, 'agents.max'))::int, 1);
  if v_max = -1 then return new; end if;
  select count(*) into v_count from public.agents
   where account_id = new.account_id and status in ('active','paused') and id <> new.id;
  if v_count >= v_max then
    raise exception 'agent limit reached (% of %). Upgrade or buy an agent slot.', v_count, v_max using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger agents_guard_limit before insert or update of status on public.agents
  for each row execute function app.guard_agent_limit();

alter table public.agents enable row level security;
create policy agents_member_read   on public.agents for select to authenticated using (app.is_member(account_id) or app.is_superadmin());
create policy agents_member_write  on public.agents for insert to authenticated with check (app.is_member(account_id) and user_id = auth.uid());
create policy agents_member_update on public.agents for update to authenticated using (app.is_member(account_id)) with check (app.is_member(account_id));
create policy agents_service       on public.agents for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 3. Runs: one row per run, with tokens and cost (FR-C2)
-- ---------------------------------------------------------------------------
create table public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  definition_key  text not null references public.agent_definitions (key),
  agent_id        uuid references public.agents (id) on delete set null,   -- null = shared collector run
  account_id      uuid references public.accounts (id) on delete set null, -- null = shared
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running' check (status in ('running','succeeded','failed','skipped')),
  mode            text,                                   -- product word: brief, weekly, pre, post, shock …
  model           text,
  tokens_in       bigint not null default 0,
  tokens_out      bigint not null default 0,
  cost_usd_micro  bigint not null default 0,
  sources_used    jsonb not null default '[]'::jsonb,
  summary         text,
  error           text,
  output          jsonb not null default '{}'::jsonb      -- the run's structured result, product shape
);
create index agent_runs_agent_idx on public.agent_runs (agent_id, started_at desc);
create index agent_runs_account_idx on public.agent_runs (account_id, started_at desc);
create index agent_runs_def_idx on public.agent_runs (definition_key, started_at desc);
alter table public.agent_runs enable row level security;
create policy agent_runs_read on public.agent_runs for select to authenticated
  using (account_id is null or app.is_member(account_id) or app.is_superadmin());
create policy agent_runs_service on public.agent_runs for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 4. Thread: what agents produce for a person
-- ---------------------------------------------------------------------------
create table public.agent_items (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  agent_id     uuid references public.agents (id) on delete set null,
  run_id       uuid references public.agent_runs (id) on delete set null,
  thread_key   text not null,                             -- e.g. ticker:NVDA, geo:iran, agent:<id>
  kind         text not null check (kind in ('alert','update','answer','question','ticket','note')),
  re           uuid references public.agent_items (id) on delete set null,  -- an answer's question
  title        text,
  body         jsonb not null default '{}'::jsonb,
  author       text not null default 'agent' check (author in ('agent','user','system')),
  status       text not null default 'open' check (status in ('open','answered','closed')),
  created_at   timestamptz not null default now()
);
create index agent_items_thread_idx on public.agent_items (account_id, thread_key, created_at desc);
alter table public.agent_items enable row level security;
create policy agent_items_member_read  on public.agent_items for select to authenticated using (app.is_member(account_id) or app.is_superadmin());
create policy agent_items_member_write on public.agent_items for insert to authenticated with check (app.is_member(account_id) and author = 'user');
create policy agent_items_member_update on public.agent_items for update to authenticated using (app.is_member(account_id)) with check (app.is_member(account_id));
create policy agent_items_service on public.agent_items for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 5. Collector snapshots: shared data, written by code, kept forever (FR-C1)
-- ---------------------------------------------------------------------------
create table public.collector_snapshots (
  id              bigint generated always as identity primary key,
  definition_key  text not null references public.agent_definitions (key),
  taken_at        timestamptz not null default now(),
  payload         jsonb not null,
  source_health   jsonb not null default '{}'::jsonb      -- {"source": "ok"|"stale"|"failed", …}
);
create index collector_snapshots_idx on public.collector_snapshots (definition_key, taken_at desc);
alter table public.collector_snapshots enable row level security;
create policy collector_snapshots_read on public.collector_snapshots for select to authenticated using (true);
create policy collector_snapshots_service on public.collector_snapshots for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 6. Social data collector (§7): sources, raw items, derived signals
-- ---------------------------------------------------------------------------
create table public.social_sources (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references public.accounts (id) on delete cascade,   -- null = shared source
  platform    text not null,                             -- x, youtube, substack, reddit, …
  kind        text not null check (kind in ('account','channel','hashtag','keyword','cashtag','query')),
  handle      text not null,
  label       text,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (platform, kind, handle, account_id)
);
create table public.social_items (
  id           bigint generated always as identity primary key,
  source_id    uuid not null references public.social_sources (id) on delete cascade,
  platform     text not null,
  external_id  text not null,
  author       text,
  text         text,
  url          text,
  posted_at    timestamptz,
  metrics      jsonb not null default '{}'::jsonb,       -- likes, reposts, views …
  fetched_at   timestamptz not null default now(),
  unique (platform, external_id)
);
create index social_items_source_idx on public.social_items (source_id, posted_at desc);
create table public.social_signals (
  id          bigint generated always as identity primary key,
  account_id  uuid references public.accounts (id) on delete cascade,   -- null = shared
  entity      text not null,                             -- ticker, segment, artist, event …
  window_start timestamptz not null,
  window_end   timestamptz not null,
  volume      int not null default 0,
  sentiment   numeric(4,3),                              -- −1 … +1
  spike       boolean not null default false,
  details     jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now()
);
create index social_signals_entity_idx on public.social_signals (entity, window_end desc);
alter table public.social_sources enable row level security;
alter table public.social_items enable row level security;
alter table public.social_signals enable row level security;
create policy social_sources_read on public.social_sources for select to authenticated using (account_id is null or app.is_member(account_id) or app.is_superadmin());
create policy social_sources_write on public.social_sources for all to authenticated using (account_id is not null and app.is_member(account_id)) with check (account_id is not null and app.is_member(account_id));
create policy social_items_read on public.social_items for select to authenticated using (true);
create policy social_signals_read on public.social_signals for select to authenticated using (account_id is null or app.is_member(account_id) or app.is_superadmin());
create policy social_sources_service on public.social_sources for all to service_role using (true) with check (true);
create policy social_items_service on public.social_items for all to service_role using (true) with check (true);
create policy social_signals_service on public.social_signals for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------------
-- Set up an agent after the person confirmed the setup text (FR-A2). The
-- text and its version are stored with the agent.
create or replace function public.create_agent(p_account uuid, p_definition text, p_name text, p_config jsonb default '{}'::jsonb, p_schedule text default null, p_delivery jsonb default null, p_model text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_def public.agent_definitions; v_id uuid;
begin
  if not app.is_member(p_account) then
    raise exception 'not a member of this account' using errcode = '42501';
  end if;
  select * into v_def from public.agent_definitions where key = p_definition and is_active;
  if v_def.key is null then
    raise exception 'unknown agent definition %', p_definition using errcode = 'P0002';
  end if;
  if v_def.kind <> 'personal' then
    raise exception 'only personal agents are set up by a person' using errcode = '22023';
  end if;
  insert into public.agents (account_id, user_id, definition_key, name, schedule, delivery, model, config, confirmed_at, confirmation_text, text_version)
  values (p_account, auth.uid(), p_definition, coalesce(nullif(trim(p_name), ''), v_def.name),
          coalesce(p_schedule, v_def.default_schedule), coalesce(p_delivery, '{"push": true, "email": false}'::jsonb),
          coalesce(p_model, v_def.default_model), coalesce(v_def.default_config, '{}'::jsonb) || coalesce(p_config, '{}'::jsonb),
          now(), v_def.confirmation_text, v_def.text_version)
  returning id into v_id;
  return v_id;
end $$;

-- Pause / resume / delete (FR-A3). Deleting frees the slot.
create or replace function public.set_agent_status(p_agent uuid, p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_account uuid;
begin
  select account_id into v_account from public.agents where id = p_agent;
  if v_account is null or not app.is_member(v_account) then
    raise exception 'no such agent' using errcode = 'P0002';
  end if;
  if p_status not in ('active','paused','deleted') then
    raise exception 'bad status %', p_status using errcode = '22023';
  end if;
  update public.agents set status = p_status where id = p_agent;
end $$;

-- Quota as the UI shows it: "1 of 1 agents used".
create or replace function public.agent_quota(p_account uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'used', (select count(*) from public.agents where account_id = p_account and status in ('active','paused')),
    'max', coalesce((public.feature_value(p_account, 'agents.max'))::int, 1)
  ) where app.is_member(p_account) or app.is_superadmin() or app.is_service()
$$;

-- Admin: cost per account per month (FR-C2).
create or replace function public.admin_agent_costs(p_month date default date_trunc('month', now())::date)
returns setof jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.assert_superadmin();
  return query
    select jsonb_build_object(
      'account_id', r.account_id, 'account', a.name, 'runs', count(*),
      'tokens_in', sum(r.tokens_in), 'tokens_out', sum(r.tokens_out), 'cost_usd_micro', sum(r.cost_usd_micro))
      from public.agent_runs r left join public.accounts a on a.id = r.account_id
     where r.started_at >= p_month and r.started_at < (p_month + interval '1 month')
     group by r.account_id, a.name order by sum(r.cost_usd_micro) desc;
end $$;

revoke execute on function public.create_agent(uuid, text, text, jsonb, text, jsonb, text) from public, anon;
revoke execute on function public.set_agent_status(uuid, text) from public, anon;
revoke execute on function public.agent_quota(uuid) from public, anon;
revoke execute on function public.admin_agent_costs(date) from public, anon;
grant execute on function public.create_agent(uuid, text, text, jsonb, text, jsonb, text) to authenticated, service_role;
grant execute on function public.set_agent_status(uuid, text) to authenticated, service_role;
grant execute on function public.agent_quota(uuid) to authenticated, service_role;
grant execute on function public.admin_agent_costs(date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. The module and its one feature, so plans can carry agents.max
-- ---------------------------------------------------------------------------
insert into public.modules (key, name, description, sort_order)
values ('agents', 'Agents', 'Personal agents on shared collectors', 50)
on conflict (key) do nothing;
insert into public.features (module_id, key, name, description, kind, unit, default_value)
select m.id, 'agents.max', 'Agents', 'How many personal agents an account may keep (active + paused)', 'limit', 'absolute', '1'::jsonb
  from public.modules m where m.key = 'agents'
on conflict (key) do nothing;
