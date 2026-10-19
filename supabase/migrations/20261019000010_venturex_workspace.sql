-- 010_venturex_workspace — B3, the workspace (HANDOFF §4.3, §4.4, §5.2, §5.3, §8 B3), 19 Oct 2026.
--
-- What a GO becomes after the door: the eight stages with their history, the
-- one-page offer, the week's test with the hours, results against numbers set in
-- advance, and one invited person per venture (plan-gated). Nothing here changes
-- a venture's state, stage or hours except through an RPC: the column guard of
-- 009 (app.venture_rpc) stays in force and every RPC below sets the flag only
-- for its own statements.
--
-- Plan gating is data (rule 4): `venture.workspace` (flag) and `venture.members_max`
-- (limit) exist since migration 007; has_feature()/feature_value() judge the caller
-- through app.can_read_account(), so a SECURITY DEFINER RPC still asks on behalf of
-- the real caller.
--
-- Error messages raised here are codes (`workspace.off`, `tests.week_taken` …): the
-- screens turn them into the person's language (src/i18n, workspace.errors). The
-- id or number a code needs travels in `detail`.

-- ---------------------------------------------------------------------------
-- 0. The gate the workspace tables and RPCs share
-- ---------------------------------------------------------------------------
create or replace function app.workspace_on(p_account uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_service() or app.is_superadmin() or public.has_feature(p_account, 'venture.workspace')
$$;

-- ---------------------------------------------------------------------------
-- 1. stage_progress — one row per stage a venture has touched (§5.2)
-- ---------------------------------------------------------------------------
create table public.stage_progress (
  account_id            uuid not null references public.accounts (id) on delete cascade,
  stage                 smallint not null check (stage between 1 and 8),
  entered_at            timestamptz not null default now(),
  founder_step_done_at  timestamptz,
  evidence              text check (evidence is null or length(evidence) <= 2000),
  exit_passed_at        timestamptz,
  updated_by            uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (account_id, stage)
);
create trigger stage_progress_set_updated_at before update on public.stage_progress
  for each row execute function app.set_updated_at();

-- stage_history — written by a trigger on ventures.stage, like Mainfloor's log_stage_change
create table public.stage_history (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  from_stage  smallint,
  to_stage    smallint,
  source      text not null default 'user',       -- 'door' (a verdict), 'user' (the stages screen), 'admin'
  changed_by  uuid references public.users (id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index stage_history_account_idx on public.stage_history (account_id, changed_at desc);

create or replace function app.log_venture_stage_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' and new.stage is null then return new; end if;
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.stage_history (account_id, from_stage, to_stage, source, changed_by)
    values (new.account_id,
            case when tg_op = 'UPDATE' then old.stage end,
            new.stage,
            coalesce(nullif(current_setting('app.stage_source', true), ''),
                     case when tg_op = 'INSERT' or old.stage is null then 'door' else 'user' end),
            auth.uid());
  end if;
  return new;
end $$;
create trigger ventures_log_stage_change after insert or update of stage on public.ventures
  for each row execute function app.log_venture_stage_change();

-- ---------------------------------------------------------------------------
-- 2. offers — the one-pager, one per venture, fills at stage 4 (§4.3, §5.2)
-- ---------------------------------------------------------------------------
create table public.offers (
  account_id        uuid primary key references public.accounts (id) on delete cascade,
  customer          text,
  problem           text,
  promise           text,
  deliverable       text,
  price_cents       bigint check (price_cents is null or price_cents >= 0),   -- the venture's own price, the buyers' number
  currency          text not null default 'EUR',
  anchored_against  text,
  proof             text,
  risk_reversal     text,
  objections        jsonb not null default '[]'::jsonb,                       -- [{"objection","answer"}]
  unit_cost_cents   bigint check (unit_cost_cents is null or unit_cost_cents >= 0),
  unit_margin_cents bigint,
  cac_cents         bigint check (cac_cents is null or cac_cents >= 0),
  wtp_instrument    text,                                                      -- how willingness to pay is tested: pre-sale, deposit, signature
  wtp_pass_number   int,
  wtp_deadline      date,
  wtp_result        int,
  updated_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger offers_set_updated_at before update on public.offers
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Row level security: members of the venture, and only with the workspace on
-- ---------------------------------------------------------------------------
alter table public.stage_progress enable row level security;
alter table public.stage_history  enable row level security;
alter table public.offers         enable row level security;

create policy stage_progress_select_member on public.stage_progress for select to authenticated
  using (app.is_member(account_id));
-- writes go through mark_stage_step(): the stage column of ventures moves with them

create policy stage_history_select_member on public.stage_history for select to authenticated
  using (app.is_member(account_id));
-- written by the trigger (as the owner of the function), never from the client

create policy offers_select_member on public.offers for select to authenticated
  using (app.is_member(account_id));
create policy offers_insert_member on public.offers for insert to authenticated
  with check (app.is_member(account_id) and app.workspace_on(account_id));
create policy offers_update_member on public.offers for update to authenticated
  using (app.is_member(account_id) and app.workspace_on(account_id))
  with check (app.is_member(account_id) and app.workspace_on(account_id));

-- ---------------------------------------------------------------------------
-- 4. The stage a venture stands at (§4.3): the earliest stage whose founder step
--    is not recorded as done, whatever is built later. A GO covers stages 1 and 2.
-- ---------------------------------------------------------------------------
create or replace function app.venture_stage_of(p_account uuid)
returns smallint language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(min(s), 8)::smallint
    from generate_series(1, 8) s
   where not exists (select 1 from public.stage_progress p
                      where p.account_id = p_account and p.stage = s and p.founder_step_done_at is not null)
     and not (s <= 2 and exists (select 1 from public.ventures v join public.door_runs r on r.id = v.latest_run_id
                                  where v.account_id = p_account and r.verdict = 'go'))
$$;

-- mark_stage_step(p_account, p_stage, p_step, p_evidence): records the founder's step
-- ('founder') or the exit test ('exit') of a stage, with its evidence, and moves
-- ventures.stage to where the venture now stands. Undo with p_done = false.
create or replace function public.mark_stage_step(p_account uuid, p_stage smallint, p_step text, p_evidence text default null, p_done boolean default true)
returns smallint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev text := coalesce(current_setting('app.venture_rpc', true), ''); v_stage smallint; v_old smallint;
begin
  if not (app.is_member(p_account) or app.is_superadmin() or app.is_service()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not app.workspace_on(p_account) then
    raise exception 'workspace.off' using errcode = 'P0001',
      hint = 'The workspace — stages, ledger, decisions, offer — is not part of this plan.';
  end if;
  if p_stage is null or p_stage not between 1 and 8 or p_step not in ('founder','exit') then
    raise exception 'stage.bad_step' using errcode = '22023';
  end if;
  select stage into v_old from public.ventures where account_id = p_account;
  if not found then
    raise exception 'venture.not_found' using errcode = 'P0002';
  end if;

  insert into public.stage_progress (account_id, stage, founder_step_done_at, exit_passed_at, evidence, updated_by)
  values (p_account, p_stage,
          case when p_step = 'founder' and p_done then now() end,
          case when p_step = 'exit' and p_done then now() end,
          nullif(trim(coalesce(p_evidence, '')), ''), auth.uid())
  on conflict (account_id, stage) do update
     set founder_step_done_at = case when p_step = 'founder' then (case when p_done then coalesce(public.stage_progress.founder_step_done_at, now()) end) else public.stage_progress.founder_step_done_at end,
         exit_passed_at       = case when p_step = 'exit'    then (case when p_done then coalesce(public.stage_progress.exit_passed_at, now()) end)       else public.stage_progress.exit_passed_at end,
         evidence             = coalesce(nullif(trim(coalesce(p_evidence, '')), ''), public.stage_progress.evidence),
         updated_by           = auth.uid();

  v_stage := app.venture_stage_of(p_account);
  if v_stage is distinct from v_old then
    perform set_config('app.venture_rpc', '1', true);
    perform set_config('app.stage_source', 'user', true);
    update public.ventures set stage = v_stage, stage_since = current_date where account_id = p_account;
    perform set_config('app.stage_source', '', true);
    perform set_config('app.venture_rpc', v_prev, true);
  end if;
  return v_stage;
end $$;

-- ---------------------------------------------------------------------------
-- 5. set_week_test — the week's test, and the hours, move to this venture (§4.4, §5.3)
--    p_test: {"what","cost_cents","currency","deadline","pass_number","fail_number"} or null
--    (null: the venture's open test becomes the week's test). Refuses when another
--    venture of the owner has an open week test, unless p_force names that venture:
--    then that test stays open and loses the week; nothing is closed.
-- ---------------------------------------------------------------------------
create or replace function public.set_week_test(p_account uuid, p_test jsonb default null, p_force uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev text := coalesce(current_setting('app.venture_rpc', true), '');
  v_owner uuid; v_state text; v_other uuid; v_test uuid;
begin
  if not (app.is_member(p_account) or app.is_superadmin() or app.is_service()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select a.owner_user_id, v.state into v_owner, v_state
    from public.ventures v join public.accounts a on a.id = v.account_id where v.account_id = p_account;
  if v_owner is null then
    raise exception 'venture.not_found' using errcode = 'P0002';
  end if;
  if v_state <> 'live' then
    raise exception 'venture.hours_need_live' using errcode = 'P0001',
      hint = 'Only a live venture gets the hours and the week''s test.';
  end if;

  -- one week test per owner
  select t.account_id into v_other
    from public.tests t join public.accounts a on a.id = t.account_id
   where a.owner_user_id = v_owner and t.is_week_test and t.status = 'open' and t.account_id <> p_account
   limit 1;
  if v_other is not null then
    if p_force is distinct from v_other then
      raise exception 'tests.week_taken' using errcode = 'P0001', detail = v_other::text,
        hint = 'Another venture has this week''s test. Move it here on purpose, or finish that one first.';
    end if;
    update public.tests set is_week_test = false where account_id = v_other and is_week_test and status = 'open';
  end if;

  if p_test is null or p_test = 'null'::jsonb then
    select id into v_test from public.tests where account_id = p_account and status = 'open' order by set_at desc limit 1;
    if v_test is null then
      raise exception 'tests.none_open' using errcode = 'P0001',
        hint = 'Set a test first: what, by when, the number that passes and the number that fails.';
    end if;
    update public.tests set is_week_test = true where id = v_test;
  else
    if nullif(trim(coalesce(p_test ->> 'what', '')), '') is null
       or (p_test ->> 'deadline') is null or (p_test ->> 'pass_number') is null or (p_test ->> 'fail_number') is null then
      raise exception 'door.go_needs_test' using errcode = 'P0001';
    end if;
    -- an earlier open test of this venture is superseded (one open test per venture)
    update public.tests set status = 'done', changed_one_thing = coalesce(changed_one_thing, 'superseded by the week''s test')
     where account_id = p_account and status = 'open';
    insert into public.tests (account_id, what, cost_cents, currency, deadline, pass_number, fail_number, is_week_test, started_at, created_by)
    values (p_account, trim(p_test ->> 'what'),
            coalesce((p_test ->> 'cost_cents')::bigint, 0),
            coalesce(nullif(p_test ->> 'currency', ''), 'EUR'),
            (p_test ->> 'deadline')::date,
            (p_test ->> 'pass_number')::int, (p_test ->> 'fail_number')::int,
            true, now(), auth.uid())
    returning id into v_test;
  end if;

  -- the hours follow the week's test (rule 12: one has_hours per owner)
  perform set_config('app.venture_rpc', '1', true);
  update public.ventures v set has_hours = false
    from public.accounts a
   where a.id = v.account_id and a.owner_user_id = v_owner and v.has_hours and v.account_id <> p_account;
  update public.ventures
     set has_hours = true,
         next_action = (select what from public.tests where id = v_test),
         next_date   = (select deadline from public.tests where id = v_test)
   where account_id = p_account;
  perform set_config('app.venture_rpc', v_prev, true);
  return v_test;
end $$;

-- ---------------------------------------------------------------------------
-- 6. record_test_result — the number closes the test; the outcome was decided
--    when the numbers were set (trigger tests_guard_immutable, 009). The state
--    does not move here: a PARKED venture whose trigger fired, and a LIVE one
--    whose test did not pass, get a prompt to re-score — the door asks for the
--    trigger or the reason the new state needs (rule 10; DECISIONS 19 Oct).
--    Returns {"test_id","outcome","result_number","prompt": "rescore"|null,"trigger_fired"}
-- ---------------------------------------------------------------------------
create or replace function public.record_test_result(p_test uuid, p_number int, p_changed text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.tests%rowtype; v public.ventures%rowtype; v_fired boolean := false; v_prompt text;
begin
  select * into t from public.tests where id = p_test;
  if t.id is null then
    raise exception 'tests.not_found' using errcode = 'P0002';
  end if;
  if not (app.is_member(t.account_id) or app.is_superadmin() or app.is_service()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if t.status <> 'open' then
    raise exception 'tests.closed' using errcode = 'P0001', hint = 'This test has its result already.';
  end if;
  if p_number is null then
    raise exception 'tests.number_required' using errcode = '22023';
  end if;
  update public.tests
     set result_number = p_number, changed_one_thing = nullif(trim(coalesce(p_changed, '')), '')
   where id = p_test
  returning * into t;

  select * into v from public.ventures where account_id = t.account_id;
  if v.state = 'parked' and v.revival_number is not null and p_number >= v.revival_number then
    v_fired := true;
  end if;
  v_prompt := case when v_fired then 'rescore'
                   when v.state = 'live' and t.outcome <> 'pass' then 'rescore'
                   else null end;
  return jsonb_build_object('test_id', t.id, 'outcome', t.outcome, 'result_number', t.result_number,
                            'prompt', v_prompt, 'trigger_fired', v_fired);
end $$;

-- ---------------------------------------------------------------------------
-- 7. invite_member / accept_invites — one invited person per venture, bounded by
--    the plan (§5.3). The login and the one-time link are made by the server
--    (core's createSignInLink); SQL records the membership as 'invited' and the
--    person's first visit to /app turns it 'active' (accept_invites). Until then
--    app.is_member() says no, so they see nothing.
-- ---------------------------------------------------------------------------
create or replace function public.invite_member(p_account uuid, p_user uuid, p_email text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_max int; v_count int; v_val jsonb;
begin
  if not (app.has_role(p_account, array['owner','admin']) or app.is_superadmin() or app.is_service()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not app.workspace_on(p_account) then
    raise exception 'workspace.off' using errcode = 'P0001';
  end if;
  v_val := public.feature_value(p_account, 'venture.members_max');
  v_max := coalesce((v_val #>> '{}')::int, 0);
  select count(*) into v_count from public.account_members
   where account_id = p_account and role <> 'owner' and status in ('invited','active') and user_id <> p_user;
  if v_max <> -1 and v_count >= v_max then
    raise exception 'members.cap' using errcode = 'P0001', detail = v_max::text,
      hint = 'This venture has as many invited people as the plan allows.';
  end if;
  if exists (select 1 from public.accounts where id = p_account and owner_user_id = p_user) then
    raise exception 'members.is_owner' using errcode = 'P0001';
  end if;
  insert into public.account_members (account_id, user_id, role, status, invited_email, invited_by)
  values (p_account, p_user, 'member', 'invited', lower(p_email), auth.uid())
  on conflict (account_id, user_id) do update
     set status = case when public.account_members.status = 'active' then 'active' else 'invited' end,
         invited_email = excluded.invited_email, invited_by = excluded.invited_by;
end $$;

-- the signed-in person's own invitations become active memberships; returns how many
create or replace function public.accept_invites()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  update public.account_members set status = 'active', accepted_at = now()
   where user_id = auth.uid() and status = 'invited';
  get diagnostics n = row_count;
  return n;
end $$;

-- remove_member: the owner takes a person out again (never the owner)
create or replace function public.remove_member(p_account uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (app.has_role(p_account, array['owner','admin']) or app.is_superadmin() or app.is_service()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.accounts where id = p_account and owner_user_id = p_user) then
    raise exception 'members.is_owner' using errcode = 'P0001';
  end if;
  delete from public.account_members where account_id = p_account and user_id = p_user and role <> 'owner';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Grants: the RPCs to signed-in people and the service, never to visitors
-- ---------------------------------------------------------------------------
revoke execute on function public.mark_stage_step(uuid, smallint, text, text, boolean) from public, anon;
revoke execute on function public.set_week_test(uuid, jsonb, uuid) from public, anon;
revoke execute on function public.record_test_result(uuid, int, text) from public, anon;
revoke execute on function public.invite_member(uuid, uuid, text) from public, anon;
revoke execute on function public.accept_invites() from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.mark_stage_step(uuid, smallint, text, text, boolean) to authenticated, service_role;
grant execute on function public.set_week_test(uuid, jsonb, uuid) to authenticated, service_role;
grant execute on function public.record_test_result(uuid, int, text) to authenticated, service_role;
grant execute on function public.invite_member(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.accept_invites() to authenticated, service_role;
grant execute on function public.remove_member(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. admin_list_ventures — every venture across accounts for /admin/ventures:
--    by state, stalled first (more than four weeks at one stage), with the cap
--    per owner. Superadmin only (§5.5 admin_venture_overview, as an RPC).
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_ventures()
returns setof jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.assert_superadmin();
  return query
    with owner_caps as (
      select a.owner_user_id,
             count(*) filter (where v.state = 'live') as live_count,
             count(*) as saved_count,
             bool_or(v.has_hours) as has_hours_somewhere
        from public.ventures v join public.accounts a on a.id = v.account_id
       group by a.owner_user_id
    )
    select jsonb_build_object(
      'account_id', v.account_id, 'title', v.title, 'slug', a.slug,
      'owner_email', u.email, 'owner_user_id', a.owner_user_id,
      'state', v.state, 'state_basis', v.state_basis, 'state_since', v.state_since,
      'score', r.total, 'verdict', r.verdict, 'rules_version', r.rules_version,
      'stage', v.stage, 'stage_since', v.stage_since,
      'weeks_at_stage', case when v.stage_since is null then null else floor((current_date - v.stage_since) / 7.0)::int end,
      'stalled', (v.state = 'live' and v.stage_since is not null and v.stage_since < current_date - 28),
      'has_hours', v.has_hours,
      'test_what', t.what, 'test_deadline', t.deadline, 'test_pass', t.pass_number, 'is_week_test', t.is_week_test,
      'owner_live', oc.live_count, 'owner_saved', oc.saved_count,
      'members', (select count(*) from public.account_members m where m.account_id = v.account_id and m.role <> 'owner' and m.status in ('invited','active')),
      'plan_key', p.key,
      'updated_at', v.updated_at
    )
    from public.ventures v
    join public.accounts a on a.id = v.account_id
    left join public.users u on u.id = a.owner_user_id
    left join public.door_runs r on r.id = v.latest_run_id
    left join public.plans p on p.id = public.effective_plan_id(v.account_id)
    left join owner_caps oc on oc.owner_user_id = a.owner_user_id
    left join lateral (
      select * from public.tests t where t.account_id = v.account_id and t.status = 'open' order by t.set_at desc limit 1
    ) t on true
    order by (v.state = 'live' and v.stage_since is not null and v.stage_since < current_date - 28) desc,
             case v.state when 'live' then 0 when 'parked' then 1 when 'untriaged' then 2 else 3 end,
             v.stage_since nulls last, v.updated_at desc;
end $$;
revoke execute on function public.admin_list_ventures() from public, anon;
grant execute on function public.admin_list_ventures() to authenticated, service_role;

-- the overview tile for stalled ventures joins the hook of 009
create or replace function app.overview_extra()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ventures_live',    (select count(*) from public.ventures where state = 'live'),
    'ventures_parked',  (select count(*) from public.ventures where state = 'parked'),
    'ventures_killed',  (select count(*) from public.ventures where state = 'killed'),
    'ventures_stalled', (select count(*) from public.ventures where state = 'live' and stage_since is not null and stage_since < current_date - 28),
    'verdicts_7d',      (select count(*) from public.door_runs where created_at > now() - interval '7 days'),
    'tests_due_7d',     (select count(*) from public.tests where status = 'open' and deadline <= current_date + 7)
  )
$$;
