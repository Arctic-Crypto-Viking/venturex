-- 006_reference_data — New Venture's rows in the core registry (HANDOFF §5.4):
-- the module, its features, the plans and the plan × feature matrix, the flags
-- and the settings, and the hook bodies the admin console reads. No table here.
-- Plans and feature keys are data: code checks hasFeature(key), never a plan
-- name. No price is written: the sketch's EUR 149 / EUR 990 are proposals the
-- first buyers replace (HANDOFF §10 D3); plan_prices stays empty until then.

-- ---------------------------------------------------------------------------
-- Modules
-- ---------------------------------------------------------------------------
insert into public.modules (key, name, description, sort_order, visibility) values
  ('core',    'Core',        'Accounts, members, settings',                                          10, 'public'),
  ('venture', 'New Venture', 'The door (gates, score, verdict) and the workspace (stages, ledger, decisions, tests)', 20, 'public'),
  ('admin',   'Admin',       'Superadmin console',                                                  900, 'internal')
on conflict (key) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, visibility = excluded.visibility;

-- ---------------------------------------------------------------------------
-- Features (key, module, kind, unit, default) — kind flag | quota | limit,
-- unit per_day | per_week | per_month | lifetime | absolute (003)
-- ---------------------------------------------------------------------------
insert into public.features (module_id, key, name, description, kind, unit, default_value)
select m.id, f.key, f.name, f.description, f.kind, f.unit, f.default_value::jsonb
from (values
  ('venture', 'venture.ventures_max',          'Saved ventures',          'How many ventures an owner can keep; -1 = unlimited',                    'limit', 'absolute',  '3'),
  ('venture', 'venture.workspace',             'Workspace',               'The eight stages, the ledger, decisions, the offer and processes',       'flag',  'absolute',  'false'),
  ('venture', 'venture.members_max',           'Invited people',          'People who can be invited into one venture; -1 = unlimited',            'limit', 'absolute',  '0'),
  ('venture', 'venture.weekly_review',         'Monday review',           'The Monday mail: the test due, its number, stalled ventures, the cap',   'flag',  'absolute',  'false'),
  ('venture', 'venture.forecast_public',       'Public forecast log',     'The owner may make a venture''s forecast log public',                    'flag',  'absolute',  'false'),
  ('venture', 'venture.ai_verdicts_per_month', 'Researched verdicts',     'Market scans behind the scores, per month (inactive until the core AI engine exists)', 'quota', 'per_month', '0')
) as f(module_key, key, name, description, kind, unit, default_value)
join public.modules m on m.key = f.module_key
on conflict (key) do update set name = excluded.name, description = excluded.description, kind = excluded.kind, unit = excluded.unit, default_value = excluded.default_value;

-- ---------------------------------------------------------------------------
-- Plans. Only `free` is public and the default at sign-up. `develop` (the
-- workspace) and `founder` (the founder's own accounts, comped) are not shown
-- until a price is decided; their descriptions carry the sketch's proposals
-- as a note, never as a price on a screen.
-- ---------------------------------------------------------------------------
insert into public.plans (key, name, description, is_public, is_default_for_signup, sort_order) values
  ('free',    'Free',    'The door: run any idea through the gates and the score, save up to three ventures with their verdicts.', true,  true,  10),
  ('develop', 'Develop', 'The workspace behind a GO: stages, ledger, decisions, the week''s test, one invited person per venture, the Monday review, a public forecast log. Price undecided (the sketch proposed EUR 990 per 30 days; the first five buyers set it).', false, false, 20),
  ('founder', 'Founder', 'Everything, for the founder''s own ventures. Comped; never public.', false, false, 90)
on conflict (key) do update set name = excluded.name, description = excluded.description, is_public = excluded.is_public, is_default_for_signup = excluded.is_default_for_signup, sort_order = excluded.sort_order;

-- Plan × feature matrix. -1 = unlimited.
insert into public.plan_features (plan_id, feature_id, value)
select p.id, f.id, v.value::jsonb
from (values
  -- feature                          free      develop   founder
  ('venture.ventures_max',            '3',      '-1',     '-1'),
  ('venture.workspace',               'false',  'true',   'true'),
  ('venture.members_max',             '0',      '1',      '3'),
  ('venture.weekly_review',           'false',  'true',   'true'),
  ('venture.forecast_public',         'false',  'true',   'true'),
  ('venture.ai_verdicts_per_month',   '0',      '0',      '0')
) as m(feature_key, free_v, develop_v, founder_v)
cross join lateral (values ('free', m.free_v), ('develop', m.develop_v), ('founder', m.founder_v)) as v(plan_key, value)
join public.plans p on p.key = v.plan_key
join public.features f on f.key = m.feature_key
on conflict (plan_id, feature_id) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- Feature flags (kill switches) and system settings
-- ---------------------------------------------------------------------------
insert into public.feature_flags (key, enabled, description) values
  ('signup.open',            true,  'New accounts can be created'),
  ('venture.forecast_log',   false, 'The public forecast log pages (/f/…) answer. OFF until B5 passes'),
  ('venture.weekly_review',  false, 'The Monday review mail is sent. OFF until Resend is set up (HANDOFF §9 step 5)')
on conflict (key) do update set description = excluded.description;

insert into public.system_settings (key, value, description) values
  ('signup', '{"trial_days": 0}'::jsonb, 'Signup behaviour. trial_days > 0 starts a trial of the plan named in signup.trial_plan on signup; 0 = none')
on conflict (key) do update set value = excluded.value, description = excluded.description;

-- ---------------------------------------------------------------------------
-- The admin console's hooks (core_007 §2), this product's bodies. B2 fills them
-- from `ventures` and the latest door run; until then: no figures, no keys.
-- ---------------------------------------------------------------------------
create or replace function app.overview_extra()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ventures_live', 0,
    'ventures_parked', 0,
    'verdicts_7d', 0,
    'tests_due_7d', 0
  )
$$;

create or replace function app.admin_account_extra(p_account uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('venture', null::jsonb, 'venture_title', null::text)
$$;
