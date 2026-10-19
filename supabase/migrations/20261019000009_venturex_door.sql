-- 009_venturex_door — B2, the door (HANDOFF §4, §5, §8 B2), 19 Oct 2026.
--
-- The product's first tables on the core: `ventures` (one per account), the
-- immutable `door_runs`, the ledger `evidence`, append-only `decisions`, and
-- `tests` with numbers that cannot change after they are set. The rules of the
-- door live twice on purpose — here in compute_verdict() and in src/lib/door.ts
-- — and a fixture of runs proves they agree (supabase/tests/door_fixture.sql,
-- generated from src/lib/door-fixture.ts). A rule change is a new
-- rules_version; old runs keep theirs.
--
-- Error messages raised here are codes (`venture.live_cap`, `door.killed_needs_fact`
-- …): the screens turn them into the person's language (src/i18n). The number a
-- code needs travels in `detail`.
--
-- Also here: the product's name in the module registry (Venturex, DECISIONS 19 Oct).

update public.modules set name = 'Venturex' where key = 'venture';

-- ---------------------------------------------------------------------------
-- 1. ventures — one row per account (§5.1)
-- ---------------------------------------------------------------------------
create table public.ventures (
  account_id        uuid primary key references public.accounts (id) on delete cascade,
  title             text not null check (length(title) between 1 and 200),   -- the idea in one line
  customer          text,                                                     -- who has this problem
  uses_today        text,                                                     -- what they use today
  ship_in_30_days   text,                                                     -- what you could ship in 30 days
  unfair_reach      text,                                                     -- your unfair way to reach them
  assets            text,                                                     -- the card: what it owns
  channel_has       text,
  channel_needs     text,
  calendar          text,
  unblocker         text,
  market            text,
  language          text,
  hours_per_week    int check (hours_per_week between 0 and 168),
  state             text not null default 'untriaged' check (state in ('untriaged','live','parked','killed')),
  state_basis       text check (state_basis in ('scored','declared')),
  state_since       date,
  state_reason      text,
  has_hours         boolean not null default false,
  stage             smallint check (stage between 1 and 8),
  stage_since       date,
  next_action       text,
  next_date         date,
  money_in_cents    bigint not null default 0,
  committed_cents   bigint not null default 0,
  committed_hours   int,
  revival_trigger   text,
  revival_number    int,
  revival_deadline  date,
  forecast_public   boolean not null default false,
  latest_run_id     uuid,                                                     -- fk added below
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index ventures_state_idx on public.ventures (state);
create trigger ventures_set_updated_at before update on public.ventures
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. evidence — the assumption ledger (§5.2)
-- ---------------------------------------------------------------------------
create table public.evidence (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts (id) on delete cascade,
  kind           text not null check (kind in ('fact','assumption','killed')),
  claim          text not null check (length(claim) between 1 and 2000),
  source         text,
  source_date    date,
  impact         smallint check (impact between 1 and 5),
  uncertainty    smallint check (uncertainty between 1 and 5),
  risk           int generated always as (impact * uncertainty) stored,
  test_id        uuid,                                                        -- fk added below
  status         text not null default 'open' check (status in ('open','promoted','killed')),
  promoted_from  uuid references public.evidence (id) on delete set null,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- a fact needs its source and date (§4.4 "money beats opinion"; the ledger rule)
  constraint evidence_fact_has_source check (kind <> 'fact' or (source is not null and source_date is not null))
);
create index evidence_account_idx on public.evidence (account_id, status, risk desc);
create trigger evidence_set_updated_at before update on public.evidence
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. door_runs — every pass through the door, immutable (§5.2)
-- ---------------------------------------------------------------------------
create table public.door_runs (
  id                        uuid primary key default gen_random_uuid(),
  account_id                uuid not null references public.accounts (id) on delete cascade,
  rules_version             int not null,
  intake                    jsonb not null default '{}'::jsonb,
  gate_1 boolean, gate_1_note text,
  gate_2 boolean, gate_2_note text,
  gate_3 boolean, gate_3_note text,
  gate_4 boolean, gate_4_note text,
  gate_5 boolean, gate_5_note text,
  killed_at_gate            smallint check (killed_at_gate between 1 and 5),
  score_demand              smallint check (score_demand between 1 and 5),
  score_time                smallint check (score_time between 1 and 5),
  score_price               smallint check (score_price between 1 and 5),
  score_edge                smallint check (score_edge between 1 and 5),
  score_margin              smallint check (score_margin between 1 and 5),
  score_demand_evidence_id  uuid references public.evidence (id) on delete set null,
  demand_capped             boolean not null default false,                   -- asked for 3+ without evidence: stored as 2
  total                     smallint generated always as (score_demand + score_time + score_price + score_edge + score_margin) stored,
  verdict                   text not null check (verdict in ('go','parked','killed')),
  fact_changed              text,                                             -- required when the previous state was killed
  run_by                    uuid references public.users (id) on delete set null,
  created_at                timestamptz not null default now(),
  -- survivors carry five scores; a gate kill carries none
  constraint door_runs_scores_complete check (
    (killed_at_gate is not null and score_demand is null and score_time is null and score_price is null and score_edge is null and score_margin is null)
    or (killed_at_gate is null and score_demand is not null and score_time is not null and score_price is not null and score_edge is not null and score_margin is not null)
  )
);
create index door_runs_account_idx on public.door_runs (account_id, created_at desc);
alter table public.ventures
  add constraint ventures_latest_run_fk foreign key (latest_run_id) references public.door_runs (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. decisions — append-only (§5.2)
-- ---------------------------------------------------------------------------
create table public.decisions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  decided_on  date not null default current_date,
  decision    text not null check (length(decision) between 1 and 4000),
  reason      text,
  replaces    text,
  decided_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index decisions_account_idx on public.decisions (account_id, decided_on desc);

-- ---------------------------------------------------------------------------
-- 5. tests — set before they run; numbers immutable after set_at (§4.4, rule 11)
-- ---------------------------------------------------------------------------
create table public.tests (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.accounts (id) on delete cascade,
  what               text not null check (length(what) between 1 and 1000),
  cost_cents         bigint not null default 0,
  currency           text not null default 'EUR',
  deadline           date not null,
  pass_number        int not null,
  fail_number        int not null,
  set_at             timestamptz not null default now(),
  started_at         timestamptz,
  result_number      int,
  result_at          timestamptz,
  outcome            text check (outcome in ('pass','fail','middle')),
  changed_one_thing  text,
  is_week_test       boolean not null default false,
  status             text not null default 'open' check (status in ('open','done')),
  created_by         uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint tests_pass_above_fail check (pass_number > fail_number)
);
create index tests_account_idx on public.tests (account_id, status, deadline);
-- one open test per venture
create unique index tests_one_open_idx on public.tests (account_id) where status = 'open';
create trigger tests_set_updated_at before update on public.tests
  for each row execute function app.set_updated_at();
alter table public.evidence
  add constraint evidence_test_fk foreign key (test_id) references public.tests (id) on delete set null;

create or replace function app.tests_guard_immutable()
returns trigger language plpgsql as $$
begin
  if app.is_service() then return new; end if;
  if (new.what, new.cost_cents, new.currency, new.deadline, new.pass_number, new.fail_number, new.set_at, new.account_id)
     is distinct from
     (old.what, old.cost_cents, old.currency, old.deadline, old.pass_number, old.fail_number, old.set_at, old.account_id) then
    raise exception 'tests.immutable' using errcode = 'P0001',
      hint = 'A test''s numbers are set before it runs and cannot change after. Record the result, or set a new test.';
  end if;
  -- a result closes the test and decides the outcome from the numbers set in advance
  if new.result_number is not null and (old.result_number is null or new.result_number <> old.result_number) then
    new.result_at := coalesce(new.result_at, now());
    new.outcome := case when new.result_number >= new.pass_number then 'pass'
                        when new.result_number <= new.fail_number then 'fail'
                        else 'middle' end;
    new.status := 'done';
  end if;
  return new;
end $$;
create trigger tests_guard_immutable before update on public.tests
  for each row execute function app.tests_guard_immutable();

-- ---------------------------------------------------------------------------
-- 6. The cap lives in the database (rule 12): saved ventures per owner from the
--    plan, LIVE at most three per owner, has_hours on one at most, and only on
--    a LIVE venture. Errors are codes the screens translate.
-- ---------------------------------------------------------------------------
create or replace function app.guard_venture_limits()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid; v_max int; v_count int; v_val jsonb;
begin
  if app.is_service() then return new; end if;
  select owner_user_id into v_owner from public.accounts where id = new.account_id;

  if tg_op = 'INSERT' then
    v_val := public.feature_value(new.account_id, 'venture.ventures_max');
    v_max := coalesce((v_val #>> '{}')::int, 3);
    if v_max <> -1 then
      select count(*) into v_count
        from public.ventures v join public.accounts a on a.id = v.account_id
       where a.owner_user_id = v_owner and v.account_id <> new.account_id;
      if v_count >= v_max then
        raise exception 'venture.saved_cap' using errcode = 'P0001', detail = v_max::text,
          hint = 'You have saved as many ventures as your plan allows.';
      end if;
    end if;
  end if;

  if new.state = 'live' and (tg_op = 'INSERT' or old.state is distinct from 'live') then
    select count(*) into v_count
      from public.ventures v join public.accounts a on a.id = v.account_id
     where a.owner_user_id = v_owner and v.state = 'live' and v.account_id <> new.account_id;
    if v_count >= 3 then
      raise exception 'venture.live_cap' using errcode = 'P0001', detail = '3',
        hint = 'Three ventures are live already. Park or kill one before this one goes live.';
    end if;
  end if;

  if new.has_hours and new.state <> 'live' then
    raise exception 'venture.hours_need_live' using errcode = 'P0001';
  end if;
  if new.has_hours and (tg_op = 'INSERT' or not old.has_hours) then
    if exists (select 1 from public.ventures v join public.accounts a on a.id = v.account_id
                where a.owner_user_id = v_owner and v.has_hours and v.account_id <> new.account_id) then
      raise exception 'venture.hours_taken' using errcode = 'P0001',
        hint = 'Only one live venture gets the hours. Move them first.';
    end if;
  end if;
  return new;
end $$;
create trigger ventures_guard_limits before insert or update of state, has_hours on public.ventures
  for each row execute function app.guard_venture_limits();

-- The state, its basis, the hours and the latest run change only through the RPCs
-- below (they set app.venture_rpc for the statement). Members may edit the rest
-- of the card directly (its descriptive fields, the next action, money).
create or replace function app.guard_venture_columns()
returns trigger language plpgsql as $$
begin
  if app.is_service() or coalesce(current_setting('app.venture_rpc', true), '') = '1' then return new; end if;
  if (new.state, new.state_basis, new.state_since, new.state_reason, new.has_hours, new.latest_run_id,
      new.stage, new.stage_since, new.revival_trigger, new.revival_number, new.revival_deadline, new.account_id)
     is distinct from
     (old.state, old.state_basis, old.state_since, old.state_reason, old.has_hours, old.latest_run_id,
      old.stage, old.stage_since, old.revival_trigger, old.revival_number, old.revival_deadline, old.account_id) then
    raise exception 'venture.use_rpc' using errcode = '42501',
      hint = 'The state, the hours, the stage and the trigger change through the door, never by hand.';
  end if;
  return new;
end $$;
create trigger ventures_guard_columns before update on public.ventures
  for each row execute function app.guard_venture_columns();

-- ---------------------------------------------------------------------------
-- 7. compute_verdict — rules version 1, pure. The same function, in the same
--    words, is computeVerdict() in src/lib/door.ts; the fixture proves it.
--    Input: {"gates":[bool…], "scores":{"demand","time","price","edge","margin"}, "demand_evidence": bool}
--    Output: {"rules_version","verdict","total","killed_at_gate","scores","demand_capped"}
-- ---------------------------------------------------------------------------
create or replace function public.compute_verdict(p_run jsonb)
returns jsonb language plpgsql immutable as $$
declare
  v_gates jsonb := coalesce(p_run -> 'gates', '[]'::jsonb);
  v_scores jsonb := coalesce(p_run -> 'scores', '{}'::jsonb);
  v_evidence boolean := coalesce((p_run ->> 'demand_evidence')::boolean, false);
  i int; g jsonb;
  d int; t int; p int; e int; m int; total int;
  capped boolean := false;
begin
  -- the gates, in order: the first No ends the run
  for i in 0..4 loop
    g := v_gates -> i;
    if g is null or jsonb_typeof(g) <> 'boolean' then
      raise exception 'door.gate_order' using errcode = 'P0001', detail = (i + 1)::text,
        hint = 'Answer every gate, in order, before the score.';
    end if;
    if not g::boolean then
      return jsonb_build_object('rules_version', 1, 'verdict', 'killed', 'total', null,
                                'killed_at_gate', i + 1, 'scores', null, 'demand_capped', false);
    end if;
  end loop;

  d := (v_scores ->> 'demand')::int; t := (v_scores ->> 'time')::int; p := (v_scores ->> 'price')::int;
  e := (v_scores ->> 'edge')::int;   m := (v_scores ->> 'margin')::int;
  if d is null or t is null or p is null or e is null or m is null
     or least(d, t, p, e, m) < 1 or greatest(d, t, p, e, m) > 5 then
    raise exception 'door.scores_incomplete' using errcode = 'P0001',
      hint = 'Each of the five dimensions needs a level from 1 to 5.';
  end if;
  -- demand is capped at 2 without behavioural evidence (competition analysis, move 2)
  if d >= 3 and not v_evidence then d := 2; capped := true; end if;
  total := d + t + p + e + m;

  return jsonb_build_object(
    'rules_version', 1,
    'verdict', case when total >= 18 then 'go' when total >= 13 then 'parked' else 'killed' end,
    'total', total,
    'killed_at_gate', null,
    'scores', jsonb_build_object('demand', d, 'time', t, 'price', p, 'edge', e, 'margin', m),
    'demand_capped', capped);
end $$;

-- ---------------------------------------------------------------------------
-- 8. set_venture_state — the only writer of ventures.state (§5.3). The cap
--    trigger fires here. A declared state counts toward the cap too.
-- ---------------------------------------------------------------------------
create or replace function public.set_venture_state(p_account uuid, p_state text, p_basis text default 'declared', p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev text := coalesce(current_setting('app.venture_rpc', true), '');
begin
  if not (app.is_member(p_account) or app.is_superadmin() or app.is_service()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_state not in ('untriaged','live','parked','killed') or p_basis not in ('scored','declared') then
    raise exception 'venture.bad_state' using errcode = '22023';
  end if;
  -- the column guard reads this flag; it is put back as it was so it never outlives the call
  perform set_config('app.venture_rpc', '1', true);
  update public.ventures
     set state = p_state,
         state_basis = p_basis,
         state_since = current_date,
         state_reason = coalesce(p_reason, state_reason),
         has_hours = case when p_state = 'live' then has_hours else false end
   where account_id = p_account;
  if not found then
    raise exception 'venture.not_found' using errcode = 'P0002';
  end if;
  perform set_config('app.venture_rpc', v_prev, true);
end $$;

-- ---------------------------------------------------------------------------
-- 9. record_door_run — validates, computes, stores, and moves the venture (§5.3).
--    p_run: {"gates":[…], "gate_notes":[…], "scores":{…}, "demand_evidence":{"claim","source","source_date"}|null,
--            "fact_changed", "test":{"what","cost_cents","currency","deadline","pass_number","fail_number"},
--            "revival":{"trigger","number","deadline"}, "card":{"assets","channel_has","channel_needs","calendar","unblocker"},
--            "intake":{…}}
-- ---------------------------------------------------------------------------
create or replace function public.record_door_run(p_account uuid, p_run jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.ventures%rowtype;
  r jsonb; v_run uuid; v_evidence uuid; v_test uuid;
  v_claim text; v_source text; v_source_date date;
  v_notes jsonb := coalesce(p_run -> 'gate_notes', '[]'::jsonb);
  v_verdict text; v_total int; v_reason text; v_scores jsonb;
  v_owner uuid; v_has_hours boolean;
  v_trigger text; v_number int; v_deadline date;
begin
  if not (app.is_member(p_account) or app.is_superadmin() or app.is_service()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v from public.ventures where account_id = p_account;
  if v.account_id is null then
    raise exception 'venture.not_found' using errcode = 'P0002';
  end if;
  -- a KILLED venture is re-scored only with a stated changed fact (rule 10)
  if v.state = 'killed' and length(trim(coalesce(p_run ->> 'fact_changed', ''))) = 0 then
    raise exception 'door.killed_needs_fact' using errcode = 'P0001',
      hint = 'A killed idea comes back only when a stated fact about the world has changed. Say which, with its source and date.';
  end if;

  -- evidence for the demand score, when given: a fact with source and date, else an assumption
  v_claim := nullif(trim(coalesce(p_run -> 'demand_evidence' ->> 'claim', '')), '');
  if v_claim is not null then
    v_source := nullif(trim(coalesce(p_run -> 'demand_evidence' ->> 'source', '')), '');
    v_source_date := (p_run -> 'demand_evidence' ->> 'source_date')::date;
    insert into public.evidence (account_id, kind, claim, source, source_date, impact, uncertainty, created_by)
    values (p_account,
            case when v_source is not null and v_source_date is not null then 'fact' else 'assumption' end,
            v_claim, v_source, v_source_date, 5,
            case when v_source is not null and v_source_date is not null then 1 else 3 end,
            auth.uid())
    returning id into v_evidence;
  end if;

  r := public.compute_verdict(p_run || jsonb_build_object('demand_evidence', v_claim is not null));
  v_verdict := r ->> 'verdict';
  v_total := (r ->> 'total')::int;
  v_scores := r -> 'scores';

  insert into public.door_runs (
    account_id, rules_version, intake,
    gate_1, gate_1_note, gate_2, gate_2_note, gate_3, gate_3_note, gate_4, gate_4_note, gate_5, gate_5_note,
    killed_at_gate, score_demand, score_time, score_price, score_edge, score_margin,
    score_demand_evidence_id, demand_capped, verdict, fact_changed, run_by)
  values (
    p_account, (r ->> 'rules_version')::int, coalesce(p_run -> 'intake', '{}'::jsonb),
    (p_run -> 'gates' ->> 0)::boolean, nullif(v_notes ->> 0, ''),
    (p_run -> 'gates' ->> 1)::boolean, nullif(v_notes ->> 1, ''),
    (p_run -> 'gates' ->> 2)::boolean, nullif(v_notes ->> 2, ''),
    (p_run -> 'gates' ->> 3)::boolean, nullif(v_notes ->> 3, ''),
    (p_run -> 'gates' ->> 4)::boolean, nullif(v_notes ->> 4, ''),
    (r ->> 'killed_at_gate')::smallint,
    (v_scores ->> 'demand')::smallint, (v_scores ->> 'time')::smallint, (v_scores ->> 'price')::smallint,
    (v_scores ->> 'edge')::smallint, (v_scores ->> 'margin')::smallint,
    v_evidence, (r ->> 'demand_capped')::boolean, v_verdict, nullif(trim(coalesce(p_run ->> 'fact_changed', '')), ''), auth.uid())
  returning id into v_run;

  perform set_config('app.venture_rpc', '1', true);   -- cleared before return: a raise rolls it back with the rest
  -- the card's descriptive fields, when the screen sent them
  update public.ventures
     set latest_run_id = v_run,
         assets        = coalesce(nullif(trim(p_run -> 'card' ->> 'assets'), ''), assets),
         channel_has   = coalesce(nullif(trim(p_run -> 'card' ->> 'channel_has'), ''), channel_has),
         channel_needs = coalesce(nullif(trim(p_run -> 'card' ->> 'channel_needs'), ''), channel_needs),
         calendar      = coalesce(nullif(trim(p_run -> 'card' ->> 'calendar'), ''), calendar),
         unblocker     = coalesce(nullif(trim(p_run -> 'card' ->> 'unblocker'), ''), unblocker)
   where account_id = p_account;

  if v_verdict = 'go' then
    -- a GO is saved with this week's test: what, deadline, pass and fail numbers (§4.2, §4.4)
    if nullif(trim(coalesce(p_run -> 'test' ->> 'what', '')), '') is null
       or (p_run -> 'test' ->> 'deadline') is null
       or (p_run -> 'test' ->> 'pass_number') is null
       or (p_run -> 'test' ->> 'fail_number') is null then
      raise exception 'door.go_needs_test' using errcode = 'P0001',
        hint = 'A GO is saved with this week''s test: what, by when, the number that passes and the number that fails.';
    end if;
    v_reason := 'Scored ' || v_total || '/25';
    perform public.set_venture_state(p_account, 'live', 'scored', v_reason);
    -- the hours: the owner's first live venture takes them
    select a.owner_user_id into v_owner from public.accounts a where a.id = p_account;
    v_has_hours := not exists (select 1 from public.ventures x join public.accounts a on a.id = x.account_id
                                where a.owner_user_id = v_owner and x.has_hours and x.account_id <> p_account);
    -- an earlier open test is superseded by the new one
    update public.tests set status = 'done', changed_one_thing = coalesce(changed_one_thing, 'superseded by a new verdict')
     where account_id = p_account and status = 'open';
    insert into public.tests (account_id, what, cost_cents, currency, deadline, pass_number, fail_number, is_week_test, created_by)
    values (p_account, trim(p_run -> 'test' ->> 'what'),
            coalesce((p_run -> 'test' ->> 'cost_cents')::bigint, 0),
            coalesce(nullif(p_run -> 'test' ->> 'currency', ''), 'EUR'),
            (p_run -> 'test' ->> 'deadline')::date,
            (p_run -> 'test' ->> 'pass_number')::int, (p_run -> 'test' ->> 'fail_number')::int,
            v_has_hours, auth.uid())
    returning id into v_test;
    update public.ventures
       set has_hours = v_has_hours,
           stage = coalesce(stage, 3),                       -- the verdict covers stages 1 and 2 (§4.3)
           stage_since = coalesce(stage_since, current_date),
           next_action = trim(p_run -> 'test' ->> 'what'),
           next_date = (p_run -> 'test' ->> 'deadline')::date,
           revival_trigger = null, revival_number = null, revival_deadline = null
     where account_id = p_account;

  elsif v_verdict = 'parked' then
    -- a PARKED verdict is saved with its revival trigger: an event, as a number with a deadline
    v_trigger := nullif(trim(coalesce(p_run -> 'revival' ->> 'trigger', '')), '');
    v_number := (p_run -> 'revival' ->> 'number')::int;
    v_deadline := (p_run -> 'revival' ->> 'deadline')::date;
    if v_trigger is null or v_number is null or v_deadline is null
       or v_trigger ~* 'when i (have|get|find) (the )?time' then
      raise exception 'door.parked_needs_trigger' using errcode = 'P0001',
        hint = 'Parked needs a revival trigger: the external event, as a number, with a date. "When I have time" is not a trigger.';
    end if;
    v_reason := 'Scored ' || v_total || '/25';
    perform public.set_venture_state(p_account, 'parked', 'scored', v_reason);
    update public.ventures
       set revival_trigger = v_trigger, revival_number = v_number, revival_deadline = v_deadline,
           next_action = v_trigger, next_date = v_deadline
     where account_id = p_account;

  else
    v_reason := case when (r ->> 'killed_at_gate') is not null
                     then 'Killed at gate ' || (r ->> 'killed_at_gate') || coalesce(': ' || nullif(v_notes ->> ((r ->> 'killed_at_gate')::int - 1), ''), '')
                     else 'Scored ' || v_total || '/25, under 13' end;
    perform public.set_venture_state(p_account, 'killed', 'scored', v_reason);
    update public.ventures
       set revival_trigger = null, revival_number = null, revival_deadline = null, next_action = null, next_date = null
     where account_id = p_account;
  end if;

  perform set_config('app.venture_rpc', '', true);
  return v_run;
end $$;

-- ---------------------------------------------------------------------------
-- 10. create_venture — the sign-up RPC (§5.3), on the pattern of Mainfloor's
--     create_account_with_identity: the account, the owner membership, the
--     venture from the five lines, the first door run, line 3 as the first
--     assumption. The new account takes the plan of the owner's latest account
--     (so the founder's plan carries over), else the sign-up default.
-- ---------------------------------------------------------------------------
create or replace function public.create_venture(p_intake jsonb, p_run jsonb, p_name text default null, p_locale text default 'en')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_account uuid; v_prev_account uuid; v_slug text; v_plan uuid; v_trial_days int; v_title text; n int := 0;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  v_title := nullif(trim(coalesce(p_intake ->> 'title', '')), '');
  if v_title is null then
    raise exception 'door.title_required' using errcode = '22023';
  end if;
  -- the first venture of a person is a sign-up; it needs sign-up to be open
  if not exists (select 1 from public.accounts where owner_user_id = v_user)
     and not public.flag_enabled('signup.open') then
    raise exception 'signup.closed' using errcode = 'P0001';
  end if;

  v_slug := left(app.slugify(v_title), 60);
  if v_slug = '' then v_slug := 'venture'; end if;
  while exists (select 1 from public.accounts where slug = v_slug || case when n = 0 then '' else '-' || n end) loop
    n := n + 1;
  end loop;
  if n > 0 then v_slug := v_slug || '-' || n; end if;

  -- the owner's newest account sets the plan of the new one; a comped subscription (the founder's
  -- accounts, Mainfloor's seed pattern) carries over too, because the effective plan is the free
  -- plan unless the account is entitled (core_003 effective_plan_id)
  select a.id, a.plan_id into v_prev_account, v_plan from public.accounts a
   where a.owner_user_id = v_user order by a.created_at desc limit 1;
  if v_plan is null then
    select id into v_plan from public.plans where is_default_for_signup limit 1;
  end if;

  insert into public.accounts (name, slug, owner_user_id, plan_id, locale)
  values (left(coalesce(nullif(trim(p_name), ''), v_title), 80), v_slug, v_user, v_plan, coalesce(p_locale, 'en'))
  returning id into v_account;

  insert into public.account_members (account_id, user_id, role, status, accepted_at)
  values (v_account, v_user, 'owner', 'active', now());

  if v_prev_account is not null and exists (
       select 1 from public.subscriptions s where s.account_id = v_prev_account and s.status = 'comped') then
    insert into public.subscriptions (account_id, plan_id, term_months, status, starts_at, provider, notes)
    values (v_account, v_plan, 12, 'comped', now(), 'manual', 'Comped like the owner''s previous account');
  end if;

  insert into public.ventures (account_id, title, customer, uses_today, ship_in_30_days, unfair_reach, market, language, hours_per_week)
  values (v_account, v_title,
          nullif(trim(p_intake ->> 'customer'), ''), nullif(trim(p_intake ->> 'uses_today'), ''),
          nullif(trim(p_intake ->> 'ship_in_30_days'), ''), nullif(trim(p_intake ->> 'unfair_reach'), ''),
          nullif(trim(p_intake ->> 'market'), ''), nullif(trim(p_intake ->> 'language'), ''),
          (p_intake ->> 'hours_per_week')::int);

  -- line 3 (what they use today) is the first entry of the ledger, as an assumption
  if nullif(trim(coalesce(p_intake ->> 'uses_today', '')), '') is not null then
    insert into public.evidence (account_id, kind, claim, impact, uncertainty, created_by)
    values (v_account, 'assumption', 'Today they use: ' || trim(p_intake ->> 'uses_today'), 4, 3, v_user);
  end if;

  v_trial_days := coalesce((select (value ->> 'trial_days')::int from public.system_settings where key = 'signup'), 0);
  if v_trial_days > 0 then
    update public.accounts set access_status = 'trialing', trial_ends_at = now() + make_interval(days => v_trial_days)
     where id = v_account;
  end if;

  perform public.record_door_run(v_account, p_run || jsonb_build_object('intake', p_intake));
  return v_account;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Row level security: members read their venture's rows; writes that
--     change a state go through the RPCs; door_runs are never written directly.
-- ---------------------------------------------------------------------------
alter table public.ventures   enable row level security;
alter table public.evidence   enable row level security;
alter table public.door_runs  enable row level security;
alter table public.decisions  enable row level security;
alter table public.tests      enable row level security;

create policy ventures_select_member on public.ventures for select to authenticated
  using (app.is_member(account_id));
create policy ventures_update_member on public.ventures for update to authenticated
  using (app.is_member(account_id)) with check (app.is_member(account_id));

create policy evidence_select_member on public.evidence for select to authenticated
  using (app.is_member(account_id));
create policy evidence_insert_member on public.evidence for insert to authenticated
  with check (app.is_member(account_id));
create policy evidence_update_member on public.evidence for update to authenticated
  using (app.is_member(account_id)) with check (app.is_member(account_id));

create policy door_runs_select_member on public.door_runs for select to authenticated
  using (app.is_member(account_id));

create policy decisions_select_member on public.decisions for select to authenticated
  using (app.is_member(account_id));
create policy decisions_insert_member on public.decisions for insert to authenticated
  with check (app.is_member(account_id));

create policy tests_select_member on public.tests for select to authenticated
  using (app.is_member(account_id));
create policy tests_insert_member on public.tests for insert to authenticated
  with check (app.is_member(account_id));
create policy tests_update_member on public.tests for update to authenticated
  using (app.is_member(account_id)) with check (app.is_member(account_id));

-- ---------------------------------------------------------------------------
-- 12. venture_card — the read model (§4.6, §5.5): members only, through RLS
-- ---------------------------------------------------------------------------
create view public.venture_card with (security_invoker = true) as
select
  v.account_id, a.name as account_name, a.slug, a.owner_user_id,
  v.title, v.customer, v.uses_today, v.ship_in_30_days, v.unfair_reach,
  v.assets, v.channel_has, v.channel_needs, v.calendar, v.unblocker,
  v.market, v.language, v.hours_per_week,
  v.state, v.state_basis, v.state_since, v.state_reason, v.has_hours,
  v.stage, v.stage_since, v.next_action, v.next_date,
  v.money_in_cents, v.committed_cents, v.committed_hours,
  v.revival_trigger, v.revival_number, v.revival_deadline, v.forecast_public,
  r.id as run_id, r.created_at as run_at, r.rules_version, r.verdict, r.total, r.killed_at_gate, r.demand_capped, r.fact_changed,
  r.gate_1, r.gate_1_note, r.gate_2, r.gate_2_note, r.gate_3, r.gate_3_note, r.gate_4, r.gate_4_note, r.gate_5, r.gate_5_note,
  r.score_demand, r.score_time, r.score_price, r.score_edge, r.score_margin,
  t.id as test_id, t.what as test_what, t.deadline as test_deadline, t.pass_number as test_pass, t.fail_number as test_fail,
  t.result_number as test_result, t.outcome as test_outcome, t.is_week_test,
  (v.state_since is not null and v.state_since < current_date - 14) as to_confirm,
  v.created_at, v.updated_at
from public.ventures v
join public.accounts a on a.id = v.account_id
left join public.door_runs r on r.id = v.latest_run_id
left join lateral (
  select * from public.tests t where t.account_id = v.account_id and t.status = 'open' order by t.set_at desc limit 1
) t on true;
revoke all on public.venture_card from public, anon;
grant select on public.venture_card to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 13. The admin console's hooks (core_007), filled from the tables
-- ---------------------------------------------------------------------------
create or replace function app.overview_extra()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ventures_live',   (select count(*) from public.ventures where state = 'live'),
    'ventures_parked', (select count(*) from public.ventures where state = 'parked'),
    'ventures_killed', (select count(*) from public.ventures where state = 'killed'),
    'verdicts_7d',     (select count(*) from public.door_runs where created_at > now() - interval '7 days'),
    'tests_due_7d',    (select count(*) from public.tests where status = 'open' and deadline <= current_date + 7)
  )
$$;

create or replace function app.admin_account_extra(p_account uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select jsonb_build_object(
      'venture', jsonb_build_object(
        'title', v.title, 'state', v.state, 'state_basis', v.state_basis, 'state_since', v.state_since,
        'score', r.total, 'verdict', r.verdict, 'stage', v.stage, 'has_hours', v.has_hours,
        'test_deadline', (select min(t.deadline) from public.tests t where t.account_id = v.account_id and t.status = 'open')),
      'venture_title', v.title)
    from public.ventures v
    left join public.door_runs r on r.id = v.latest_run_id
    where v.account_id = p_account
  ), jsonb_build_object('venture', null::jsonb, 'venture_title', null::text))
$$;
