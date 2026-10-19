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
-- account, the feedback board. B2 (19 Oct 2026): the door (section 3b): create_venture(),
-- the three verdicts, the caps, immutable test numbers, the killed re-score rule, the
-- owner's venture is invisible to the tester, anon reads nothing of it. B3 (19 Oct 2026):
-- the workspace (section 3c): stages and offers of another venture are invisible, the
-- invited person sees one venture and nothing else, the week's test moves the hours and
-- refuses a second one, a result closes with the decided outcome, the workspace is refused
-- on the free plan and allowed on the founder plan.

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
-- the founder's account is comped on the founder plan (HANDOFF §9 step 3; Mainfloor's seed does the same):
-- without a live subscription the effective plan is the free plan (core_003)
insert into public.subscriptions (account_id, plan_id, term_months, status, provider, notes)
select :'internal_account', p.id, 12, 'comped', 'manual', 'Founder account — comped' from public.plans p where p.key = 'founder'
on conflict do nothing;

insert into public.accounts (name, slug, owner_user_id, plan_id)
select 'Tester venture', 'tester-venture', :'tester_id', p.id from public.plans p where p.is_default_for_signup
on conflict (slug) do nothing;
select id as tester_account from public.accounts where slug = 'tester-venture' \gset
insert into public.account_members (account_id, user_id, role, status, accepted_at)
values (:'tester_account', :'tester_id', 'owner', 'active', now()) on conflict do nothing;

-- the owner's first venture, through the door as the founder would: a GO with the hours
select set_config('request.jwt.claims', json_build_object('sub', :'owner_id', 'role', 'authenticated')::text, false);
set role authenticated;
select public.create_venture(
  '{"title":"Owner venture 1","customer":"c","uses_today":"u","ship_in_30_days":"s","unfair_reach":"r"}'::jsonb,
  '{"gates":[true,true,true,true,true],"scores":{"demand":2,"time":5,"price":5,"edge":5,"margin":5},"test":{"what":"t","deadline":"2026-10-26","pass_number":5,"fail_number":1}}'::jsonb
) as owner_venture \gset
-- B3: the owner's venture has workspace rows too, so the tester's zero-leak scan covers them
select public.mark_stage_step(:'owner_venture', 3::smallint, 'founder', 'the pre-sale went out');
insert into public.offers (account_id, customer, problem, promise) values (:'owner_venture', 'c', 'p', 'the promise');
reset role;

select set_config('test.internal_account', :'internal_account', false);
select set_config('test.owner_venture', :'owner_venture', false);
select set_config('test.tester_account', :'tester_account', false);
select set_config('test.owner_id', :'owner_id', false);
select set_config('test.tester_id', :'tester_id', false);
select set_config('test.tester_email', lower(:'tester_email'), false);
select set_config('test.started', now()::text, false);   -- audit rows this run writes are newer

create temp table test_results (name text, ok boolean);
grant insert on test_results to anon, authenticated, service_role;

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
    execute format('select count(*) from public.%I where account_id in ($1, $2)', r.table_name)
       into n using current_setting('test.internal_account')::uuid, current_setting('test.owner_venture')::uuid;
    checked := checked + 1;
    if n > 0 then leaks := leaks || (r.table_name || '=' || n); end if;
  end loop;
  if cardinality(leaks) > 0 then
    raise exception 'RLS LEAK — tester can see the owner''s rows in: %', leaks;
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
-- 3b. The door (009, HANDOFF §8 B2): as the tester — create_venture() with a GO,
--     a gate kill and Conscious Pulse at PARKED 13; the killed re-score rule; the
--     saved cap of the free plan; a GO needs its test; immutable test numbers;
--     the state only through the door; decisions append-only; nothing of the
--     owner's venture. Then as the owner: the LIVE cap at three, one has the hours.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'tester_id', 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare
  acc1 uuid; acc2 uuid; acc3 uuid; n bigint; ok boolean; v record; t record;
  go_run constant jsonb := '{"gates":[true,true,true,true,true],"gate_notes":["ten names","etsy fees","a download","digital","yes"],
     "scores":{"demand":3,"time":4,"price":3,"edge":3,"margin":5},
     "demand_evidence":{"claim":"Maria K. asked what it would cost","source":"DM","source_date":"2026-10-12"},
     "test":{"what":"Pre-sell at 149","deadline":"2026-10-26","pass_number":5,"fail_number":1,"cost_cents":0},
     "card":{"assets":"2,100 followers","unblocker":"five pre-orders"}}'::jsonb;
begin
  -- 1. a GO: the account, the membership, the venture live with the hours, this week's test, the ledger
  acc1 := public.create_venture('{"title":"Off-Etsy kit for makers","customer":"Makers on Etsy","uses_today":"YouTube tutorials","ship_in_30_days":"The template","unfair_reach":"2,100 followers"}'::jsonb, go_run);
  select * into v from public.venture_card where account_id = acc1;
  if v.state <> 'live' or v.verdict <> 'go' or v.total <> 18 or not v.has_hours or v.stage <> 3 or v.state_basis <> 'scored' then
    raise exception 'GO venture wrong: state % verdict % total % hours % stage %', v.state, v.verdict, v.total, v.has_hours, v.stage;
  end if;
  if v.test_what is null or v.test_pass <> 5 or v.test_fail <> 1 or not v.is_week_test or v.unblocker <> 'five pre-orders' then
    raise exception 'a GO must carry this week''s test and the card''s fields';
  end if;
  select count(*) into n from public.evidence where account_id = acc1;
  if n <> 2 then raise exception 'expected 2 evidence rows (the demand evidence, line 3), got %', n; end if;
  select count(*) into n from public.door_runs where account_id = acc1;
  if n <> 1 then raise exception 'expected 1 run, got %', n; end if;
  insert into test_results values ('door: a GO saves the venture live, with the hours, the test and the ledger', true);

  -- 2. a No at gate 2: no scores, no test, KILLED with the gate on record
  acc2 := public.create_venture('{"title":"Uber for beekeepers","customer":"Beekeepers","uses_today":"nothing","ship_in_30_days":"an app","unfair_reach":"none"}'::jsonb,
          '{"gates":[true,false],"gate_notes":["","nobody pays for this"]}'::jsonb);
  select * into v from public.venture_card where account_id = acc2;
  if v.state <> 'killed' or v.killed_at_gate <> 2 or v.total is not null or v.has_hours or v.state_reason not like 'Killed at gate 2%' then
    raise exception 'gate kill wrong: % % % %', v.state, v.killed_at_gate, v.total, v.state_reason;
  end if;
  insert into test_results values ('door: a No at gate 2 kills, with the gate and the line on record', true);

  -- 3. a killed venture is re-scored only with a changed fact; a re-score is a new run
  ok := false;
  begin
    perform public.record_door_run(acc2, go_run);
  exception when others then ok := (sqlerrm = 'door.killed_needs_fact');
  end;
  insert into test_results values ('door: a killed venture refuses a re-score without a changed fact', ok);
  perform public.record_door_run(acc2, go_run || '{"fact_changed":"Three beekeepers paid a deposit on 15 Oct (invoices)"}'::jsonb);
  select * into v from public.venture_card where account_id = acc2;
  if v.state <> 'live' or v.fact_changed is null then raise exception 're-score with a changed fact should go live, got %', v.state; end if;
  if v.has_hours then raise exception 'the hours stay on the first live venture'; end if;
  select count(*) into n from public.door_runs where account_id = acc2;
  if n <> 2 then raise exception 'a re-score is a new run, got % rows', n; end if;
  insert into test_results values ('door: a re-score with a changed fact is a new run, never an edit', true);

  -- 4. Conscious Pulse (13 Oct answers) reproduces PARKED 13/25; its trigger is required and "when I have time" is refused
  ok := false;
  begin
    perform public.create_venture('{"title":"Conscious Pulse","customer":"x","uses_today":"y","ship_in_30_days":"z","unfair_reach":"w"}'::jsonb,
      '{"gates":[true,true,true,true,true],"scores":{"demand":2,"time":4,"price":3,"edge":2,"margin":2},"revival":{"trigger":"when I have time","number":5,"deadline":"2026-12-01"}}'::jsonb);
  exception when others then ok := (sqlerrm = 'door.parked_needs_trigger');
  end;
  insert into test_results values ('door: parked refuses "when I have time" as a trigger', ok);
  acc3 := public.create_venture('{"title":"Conscious Pulse","customer":"x","uses_today":"y","ship_in_30_days":"z","unfair_reach":"w"}'::jsonb,
      '{"gates":[true,true,true,true,true],"scores":{"demand":2,"time":4,"price":3,"edge":2,"margin":2},"revival":{"trigger":"15 orders from strangers on 1,000 paid clicks","number":15,"deadline":"2026-12-01"}}'::jsonb);
  select * into v from public.venture_card where account_id = acc3;
  if v.state <> 'parked' or v.total <> 13 or v.revival_number <> 15 or v.has_hours then
    raise exception 'Conscious Pulse must be PARKED 13/25 with its trigger, got % %', v.state, v.total;
  end if;
  insert into test_results values ('door: Conscious Pulse reproduces PARKED 13/25 with its trigger', true);

  -- 5. the free plan saves three ventures; a fourth is refused
  ok := false;
  begin
    perform public.create_venture('{"title":"A fourth","customer":"x","uses_today":"y","ship_in_30_days":"z","unfair_reach":"w"}'::jsonb, '{"gates":[false]}'::jsonb);
  exception when others then ok := (sqlerrm = 'venture.saved_cap');
  end;
  insert into test_results values ('door: a fourth saved venture is refused on the free plan', ok);

  -- 6. a GO is saved only with this week's test
  ok := false;
  begin
    perform public.record_door_run(acc3, '{"gates":[true,true,true,true,true],"scores":{"demand":5,"time":5,"price":5,"edge":5,"margin":5},"demand_evidence":{"claim":"paid"}}'::jsonb);
  exception when others then ok := (sqlerrm = 'door.go_needs_test');
  end;
  insert into test_results values ('door: a GO is saved only with this week''s test', ok);

  -- 7. a test's numbers are immutable after set_at; a result closes it with the outcome decided in advance
  select * into t from public.tests where account_id = acc1 and status = 'open';
  ok := false;
  begin
    update public.tests set pass_number = 1 where id = t.id;
  exception when others then ok := (sqlerrm = 'tests.immutable');
  end;
  insert into test_results values ('door: a test''s numbers cannot change after they are set', ok);
  update public.tests set result_number = 7 where id = t.id;
  select * into t from public.tests where id = t.id;
  if t.status <> 'done' or t.outcome <> 'pass' then
    raise exception 'a result of 7 against pass 5 should close the test as a pass, got % %', t.status, t.outcome;
  end if;
  insert into test_results values ('door: a result closes the test with the outcome the numbers decided', true);

  -- 8. the state is not editable by hand; the card's fields are
  ok := false;
  begin
    update public.ventures set state = 'live' where account_id = acc3;
  exception when others then ok := (sqlerrm = 'venture.use_rpc');
  end;
  insert into test_results values ('door: the state changes only through the door', ok);
  update public.ventures set unblocker = 'a kitchen partner' where account_id = acc3;
  insert into test_results values ('door: the card''s fields are the member''s to edit',
    (select unblocker = 'a kitchen partner' from public.ventures where account_id = acc3));

  -- 9. decisions are append-only: an update changes nothing (no policy)
  insert into public.decisions (account_id, decision, reason) values (acc1, 'Pre-sell before building', 'money beats opinion');
  update public.decisions set decision = 'edited' where account_id = acc1;
  select count(*) into n from public.decisions where account_id = acc1 and decision = 'edited';
  insert into test_results values ('door: decisions are append-only', n = 0);

  -- 10. the tester sees nothing of the owner's venture through the view either
  select count(*) into n from public.venture_card where account_id = current_setting('test.owner_venture')::uuid;
  insert into test_results values ('door: a member of one venture reads nothing of another', n = 0);
  -- section 7 deletes these before the tester's last account, so the login goes with it
  perform set_config('test.tester_v1', acc1::text, false);
  perform set_config('test.tester_v2', acc2::text, false);
  perform set_config('test.tester_v3', acc3::text, false);
  -- the admin hooks carry the product's keys, computed from the tables (the tester cannot call them; checked as service below)
end $$;
reset role;

-- the owner (founder plan, unlimited saved ventures): LIVE is capped at three, one of them has the hours
select set_config('request.jwt.claims', json_build_object('sub', :'owner_id', 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare i int; ok boolean; acc uuid; n bigint;
  go_run constant jsonb := '{"gates":[true,true,true,true,true],"scores":{"demand":2,"time":5,"price":5,"edge":5,"margin":5},
     "test":{"what":"t","deadline":"2026-10-26","pass_number":5,"fail_number":1}}'::jsonb;
begin
  for i in 2..3 loop
    acc := public.create_venture(jsonb_build_object('title', 'Owner venture ' || i, 'customer', 'c', 'uses_today', 'u', 'ship_in_30_days', 's', 'unfair_reach', 'r'), go_run);
  end loop;
  ok := false;
  begin
    perform public.create_venture('{"title":"Owner venture 4","customer":"c","uses_today":"u","ship_in_30_days":"s","unfair_reach":"r"}'::jsonb, go_run);
  exception when others then ok := (sqlerrm = 'venture.live_cap');
  end;
  insert into test_results values ('door: a fourth LIVE venture is refused (the cap is three)', ok);
  select count(*) into n from public.venture_card where owner_user_id = current_setting('test.owner_id')::uuid and has_hours;
  insert into test_results values ('door: exactly one live venture has the hours', n = 1);
  select count(*) into n from public.venture_card where owner_user_id = current_setting('test.owner_id')::uuid and state = 'live';
  if n <> 3 then raise exception 'the owner should have three live ventures, got %', n; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3c. The workspace (010, HANDOFF §8 B3). As the owner (founder plan): the stage
--     moves when the founder's step is recorded, premature work does not move it,
--     the week's test moves the hours and refuses a second one, a result closes
--     with the outcome the numbers decided, one invited person. As the tester
--     (free plan): the workspace is refused, the invitation opens exactly one
--     venture, a parked venture's trigger firing prompts a re-score.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'owner_id', 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare
  v1 uuid := current_setting('test.owner_venture')::uuid; v2 uuid; v3 uuid; n bigint; ok boolean; st smallint; r jsonb; t uuid; t2 uuid;
  week_test constant jsonb := '{"what":"Pre-sell to ten named makers","deadline":"2026-10-26","pass_number":5,"fail_number":1}'::jsonb;
begin
  select account_id into v2 from public.ventures where title = 'Owner venture 2';
  select account_id into v3 from public.ventures where title = 'Owner venture 3';

  -- 1. the founder's step of stage 3 was recorded in section 0: the venture stands at 4, with its history
  select stage into st from public.ventures where account_id = v1;
  if st <> 4 then raise exception 'after the founder''s step of stage 3 the venture should stand at 4, got %', st; end if;
  select count(*) into n from public.stage_history where account_id = v1;
  if n <> 2 then raise exception 'expected 2 history rows (door: →3, user: 3→4), got %', n; end if;
  if (select source from public.stage_history where account_id = v1 and to_stage = 3) <> 'door' then raise exception 'the first stage comes from the door'; end if;
  insert into test_results values ('workspace: the founder''s step moves the stage, with its history', true);

  -- 2. premature work: stage 6 done while 4 is not does not move the venture
  st := public.mark_stage_step(v1, 6::smallint, 'founder', 'a page is live');
  if st <> 4 then raise exception 'premature work must not move the stage, got %', st; end if;
  st := public.mark_stage_step(v1, 4::smallint, 'founder', 'the buyers confirmed 149');
  if st <> 5 then raise exception 'stage 4 done should land at 5, got %', st; end if;
  st := public.mark_stage_step(v1, 4::smallint, 'founder', null, false);   -- undo
  if st <> 4 then raise exception 'undoing stage 4 should land back at 4, got %', st; end if;
  insert into test_results values ('workspace: a venture stands at the earliest stage whose founder step is not done', true);

  -- 3. the state is still not editable by hand, nor the stage
  ok := false;
  begin
    update public.ventures set stage = 8 where account_id = v1;
  exception when others then ok := (sqlerrm = 'venture.use_rpc');
  end;
  insert into test_results values ('workspace: the stage changes only through mark_stage_step', ok);

  -- 4. the week's test: venture 1 has it (and the hours); venture 2 is refused, then moved on purpose
  ok := false;
  begin
    perform public.set_week_test(v2, week_test);
  exception when others then ok := (sqlerrm = 'tests.week_taken');
  end;
  insert into test_results values ('workspace: a second open week test is refused', ok);
  t := public.set_week_test(v2, week_test, v1);
  select count(*) into n from public.venture_card where owner_user_id = current_setting('test.owner_id')::uuid and has_hours;
  if n <> 1 then raise exception 'exactly one venture has the hours after the move, got %', n; end if;
  if not (select has_hours from public.ventures where account_id = v2) then raise exception 'the hours should be on venture 2 now'; end if;
  if (select has_hours from public.ventures where account_id = v1) then raise exception 'venture 1 should have lost the hours'; end if;
  -- venture 1's test stays open, no longer the week's
  select count(*) into n from public.tests where account_id = v1 and status = 'open' and not is_week_test;
  if n <> 1 then raise exception 'venture 1''s test should stay open without the week, got %', n; end if;
  insert into test_results values ('workspace: set_week_test moves the week''s test and the hours', true);
  -- the hours need a live venture: a parked one is refused (owner has none parked; a killed one is refused the same way)
  -- a second move onto the same venture is fine (nothing else holds the week)
  t2 := public.set_week_test(v2, null);
  if t2 <> t then raise exception 'set_week_test without a test should keep the open one'; end if;

  -- 5. the result closes the test with the outcome the numbers decided (pass 5, fail 1 → 3 is middle)
  r := public.record_test_result(t, 3, 'one thing: the price');
  if r ->> 'outcome' <> 'middle' or r ->> 'prompt' <> 'rescore' or (r ->> 'trigger_fired')::boolean then
    raise exception 'a result of 3 against 5/1 should be middle with a re-score prompt, got %', r;
  end if;
  if (select status from public.tests where id = t) <> 'done' then raise exception 'the test should be closed'; end if;
  if (select state from public.ventures where account_id = v2) <> 'live' then raise exception 'a result does not move the state by itself'; end if;
  ok := false;
  begin
    perform public.record_test_result(t, 9);
  exception when others then ok := (sqlerrm = 'tests.closed');
  end;
  insert into test_results values ('workspace: a result closes the test with the decided outcome; a second result is refused', ok);
  -- a pass keeps it live with no prompt
  t := public.set_week_test(v2, week_test);
  r := public.record_test_result(t, 7);
  if r ->> 'outcome' <> 'pass' or (r ->> 'prompt') is not null then raise exception 'a pass needs no prompt, got %', r; end if;

  -- 6. the offer: a founder-plan member writes the one-pager
  insert into public.offers (account_id, customer, problem, promise, price_cents) values (v2, 'makers', 'fees', 'off Etsy in 30 days', 14900);
  update public.offers set proof = 'three paid' where account_id = v2;
  if (select proof from public.offers where account_id = v2) <> 'three paid' then raise exception 'the offer should be editable by the member'; end if;
  insert into test_results values ('workspace: the one-pager is the member''s to write on the founder plan', true);

  -- 7. invite the tester into venture 3 (founder plan: up to 3 people); the owner cannot be invited
  perform public.invite_member(v3, current_setting('test.tester_id')::uuid, current_setting('test.tester_email'));
  select count(*) into n from public.account_members where account_id = v3 and status = 'invited';
  if n <> 1 then raise exception 'one invited membership expected, got %', n; end if;
  ok := false;
  begin
    perform public.invite_member(v3, current_setting('test.owner_id')::uuid, 'owner@example.test');
  exception when others then ok := (sqlerrm = 'members.is_owner');
  end;
  insert into test_results values ('workspace: an invitation is recorded as invited; the owner is not invitable', ok);
  perform set_config('test.owner_v2', v2::text, false);
  perform set_config('test.owner_v3', v3::text, false);
end $$;
reset role;

-- as the tester: the free plan has no workspace; the invitation opens one venture and nothing else
select set_config('request.jwt.claims', json_build_object('sub', :'tester_id', 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare
  acc1 uuid := current_setting('test.tester_v1')::uuid; acc3 uuid := current_setting('test.tester_v3')::uuid;
  v2 uuid := current_setting('test.owner_v2')::uuid; v3 uuid := current_setting('test.owner_v3')::uuid;
  n bigint; ok boolean; r jsonb; t uuid;
begin
  -- 1. the workspace is refused on the free plan: the stage, the offer, an invitation
  ok := false;
  begin
    perform public.mark_stage_step(acc1, 3::smallint, 'founder', 'x');
  exception when others then ok := (sqlerrm = 'workspace.off');
  end;
  insert into test_results values ('workspace: refused on the free plan (has_feature false)', ok);
  ok := false;
  begin
    insert into public.offers (account_id, customer) values (acc1, 'x');
  exception when others then ok := true;
  end;
  insert into test_results values ('workspace: the offer is refused on the free plan (policy)', ok);
  ok := false;
  begin
    perform public.invite_member(acc1, current_setting('test.owner_id')::uuid, 'owner@example.test');
  exception when others then ok := (sqlerrm = 'workspace.off');
  end;
  insert into test_results values ('workspace: no invited people on the free plan', ok);

  -- 2. invited, not yet accepted: nothing of venture 3 is visible
  select count(*) into n from public.venture_card where account_id = v3;
  if n <> 0 then raise exception 'an invitation not yet accepted must show nothing'; end if;
  n := public.accept_invites();
  if n <> 1 then raise exception 'one invitation should have been accepted, got %', n; end if;
  select count(*) into n from public.venture_card where account_id = v3;
  if n <> 1 then raise exception 'the invited person should see venture 3'; end if;
  select count(*) into n from public.venture_card where account_id = v2;
  if n <> 0 then raise exception 'RLS LEAK — the invited person sees venture 2'; end if;
  select count(*) into n from public.stage_progress where account_id in (v2, current_setting('test.owner_venture')::uuid);
  if n <> 0 then raise exception 'RLS LEAK — the invited person sees another venture''s stages'; end if;
  select count(*) into n from public.offers where account_id = v2;
  if n <> 0 then raise exception 'RLS LEAK — the invited person sees another venture''s offer'; end if;
  select count(*) into n from public.tests where account_id = v2;
  if n <> 0 then raise exception 'RLS LEAK — the invited person sees another venture''s tests'; end if;
  insert into test_results values ('workspace: an invited person sees that one venture and nothing else', true);
  -- and works in it (founder plan): the stage moves
  perform public.mark_stage_step(v3, 3::smallint, 'founder', 'as the invited person');
  if (select stage from public.ventures where account_id = v3) <> 4 then raise exception 'the invited member should work the stages'; end if;
  -- but cannot invite (members only; owners/admins invite)
  ok := false;
  begin
    perform public.invite_member(v3, current_setting('test.tester_id')::uuid, 'x@example.test');
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('workspace: a member does not invite', ok);

  -- 3. a parked venture whose trigger fired gets the re-score prompt (Conscious Pulse, trigger 15)
  insert into public.tests (account_id, what, deadline, pass_number, fail_number) values (acc3, 'paid clicks', '2026-12-01', 15, 5) returning id into t;
  r := public.record_test_result(t, 20);
  if not (r ->> 'trigger_fired')::boolean or r ->> 'prompt' <> 'rescore' then raise exception 'the trigger fired: a re-score prompt is due, got %', r; end if;
  insert into test_results values ('workspace: a parked venture whose trigger fired is prompted to re-score', true);
end $$;
reset role;

-- the owner takes the tester out again; the invited person then sees nothing of venture 3
select set_config('request.jwt.claims', json_build_object('sub', :'owner_id', 'role', 'authenticated')::text, false);
set role authenticated;
do $$
declare n bigint;
begin
  perform public.remove_member(current_setting('test.owner_v3')::uuid, current_setting('test.tester_id')::uuid);
  select count(*) into n from public.account_members where account_id = current_setting('test.owner_v3')::uuid and role <> 'owner';
  insert into test_results values ('workspace: the owner removes the invited person', n = 0);
end $$;
reset role;

-- the hooks, as the service role: the overview counts and the account's venture keys
set role service_role;
do $$
declare o jsonb; x jsonb;
begin
  o := app.overview_extra();
  if (o ->> 'ventures_live')::int <> 5 or (o ->> 'ventures_parked')::int <> 1 or (o ->> 'ventures_killed')::int <> 0 then
    raise exception 'overview_extra wrong: %', o;
  end if;
  if (o ->> 'verdicts_7d')::int < 7 then raise exception 'verdicts_7d should count every run today, got %', o ->> 'verdicts_7d'; end if;
  x := app.admin_account_extra(current_setting('test.owner_venture')::uuid);
  if x ->> 'venture_title' <> 'Owner venture 1' or x -> 'venture' ->> 'state' <> 'live' or (x -> 'venture' ->> 'score')::int <> 22 then
    raise exception 'admin_account_extra wrong: %', x;
  end if;
  insert into test_results values ('door: the admin hooks read the ventures', true);
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
  select count(*) into n from public.ventures;
  if n <> 0 then raise exception 'RLS LEAK — anon can see ventures'; end if;
  select count(*) into n from public.door_runs;
  if n <> 0 then raise exception 'RLS LEAK — anon can see door runs'; end if;
  select count(*) into n from public.tests;
  if n <> 0 then raise exception 'RLS LEAK — anon can see tests'; end if;
  ok := false;
  begin
    perform count(*) from public.venture_card;
  exception when insufficient_privilege then ok := true;
  end;
  insert into test_results values ('anon cannot read venture cards', ok);
  ok := false;
  begin
    perform public.create_venture('{"title":"x"}'::jsonb, '{"gates":[false]}'::jsonb);
  exception when others then ok := true;
  end;
  insert into test_results values ('anon cannot create a venture', ok);
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
  if n < 1 then raise exception 'account search should find the tester by e-mail (got %)', n; end if;
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

  -- the tester's three ventures go first (row by row, through the cascade), then the last account takes the login with it
  perform public.admin_delete_account(current_setting('test.tester_v1')::uuid, 'off-etsy-kit-for-makers', 'RLS suite: the tester asked');
  perform public.admin_delete_account(current_setting('test.tester_v2')::uuid, 'uber-for-beekeepers', 'RLS suite: the tester asked');
  perform public.admin_delete_account(current_setting('test.tester_v3')::uuid, 'conscious-pulse', 'RLS suite: the tester asked');
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
