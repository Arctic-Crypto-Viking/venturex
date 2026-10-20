-- 038_core_social_plan_rules — platform core (docs/SOCIAL-MANAGER.md §2.4, §4.4,
-- §6 "Phase 2"). Written in artist-platform on 20 Oct 2026; a verbatim copy is
-- core/supabase/migrations/core_038_social_plan_rules.sql. It names no vertical
-- table: the trigger kind is a word the product chooses (`gig.confirmed` here),
-- and the plan engine (core/src/lib/social/plan.ts) reads the product's
-- `social.triggers()` hook for the facts.
--
-- 1. social_plan_rules: plan rules as data (§4.4). One row per rule key; `posts`
--    is the list of cards the rule makes from a trigger: offset from the
--    trigger's instant ("-12d", "+1d", "-6h"), template family, format, how the
--    time snaps ("slot" = the actor's posting slots, "evening" = 19:00 of that
--    day, "none" = as computed) and what the card asks the person for. Not
--    tenant data: every signed-in person reads the rules (the engine runs under
--    the member's client); only the admin console writes them, audited.
-- 2. admin_social_set_plan_rule: the audited write (superadmin only, like
--    admin_set_flag in 014).
-- 3. social_plans.trigger_at / moved_at / moved_from: the instant the plan was
--    made from, so a trigger that moves (a gig's date) can re-propose the
--    unapproved cards and flag the approved ones (§4.4 last sentence).
-- 4. Seed: gig.confirmed.v1 — announce feed at T−12d, countdown story at T−3d,
--    day-of story at T−6h, thank-you feed at T+1d.

-- ---------------------------------------------------------------------------
-- 1. The rules
-- ---------------------------------------------------------------------------
create or replace function app.social_rule_posts_ok(p jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) between 1 and 12
     and not exists (
       select 1 from jsonb_array_elements(p) e
        where jsonb_typeof(e) <> 'object'
           or not (e ->> 'offset') ~ '^[+-]\d{1,3}[hd]$'
           or coalesce(e ->> 'family', '') = ''
           or (e ->> 'format') not in ('feed_4x5','square','story_9x16')
           or coalesce(e ->> 'snap', 'none') not in ('slot','evening','none')
           or (e ? 'asks' and jsonb_typeof(e -> 'asks') <> 'array'))
$$;

create table public.social_plan_rules (
  key          text primary key check (key ~ '^[a-z0-9_.]{3,80}$'),
  trigger_kind text not null check (trigger_kind ~ '^[a-z0-9_.]{3,80}$'),
  name         text not null check (char_length(name) between 1 and 80),
  posts        jsonb not null check (app.social_rule_posts_ok(posts)),
  is_active    boolean not null default true,
  version      int not null default 1,
  updated_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.social_plan_rules is
  'Social Manager (core): plan rules as data — the cards a trigger kind makes (offset, family, format, snap, asks). Admin-edited, audited.';
create index social_plan_rules_trigger_idx on public.social_plan_rules (trigger_kind) where is_active;
create trigger social_plan_rules_set_updated_at before update on public.social_plan_rules
  for each row execute function app.set_updated_at();

alter table public.social_plan_rules enable row level security;
create policy social_plan_rules_read on public.social_plan_rules for select to authenticated using (true);
revoke all on public.social_plan_rules from public, anon, authenticated;
grant select on public.social_plan_rules to authenticated;
grant all on public.social_plan_rules to service_role;

-- ---------------------------------------------------------------------------
-- 2. The admin write
-- ---------------------------------------------------------------------------
create or replace function public.admin_social_set_plan_rule(p_key text, p_trigger_kind text, p_name text, p_posts jsonb, p_active boolean default true)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare before_row public.social_plan_rules;
begin
  perform app.assert_superadmin();
  select * into before_row from public.social_plan_rules where key = p_key;
  insert into public.social_plan_rules (key, trigger_kind, name, posts, is_active, updated_by)
  values (p_key, p_trigger_kind, p_name, p_posts, p_active, auth.uid())
  on conflict (key) do update
    set trigger_kind = excluded.trigger_kind, name = excluded.name, posts = excluded.posts, is_active = excluded.is_active,
        version = public.social_plan_rules.version + 1, updated_by = auth.uid();
  insert into public.audit_log (actor_user_id, actor_role, action, entity_type, entity_id, before, after)
  values (auth.uid(), coalesce(auth.role(), 'service_role'), 'social_rule_set', 'social_plan_rules', p_key,
          case when before_row.key is null then null else jsonb_build_object('trigger_kind', before_row.trigger_kind, 'posts', before_row.posts, 'is_active', before_row.is_active) end,
          jsonb_build_object('trigger_kind', p_trigger_kind, 'posts', p_posts, 'is_active', p_active));
end $$;
revoke execute on function public.admin_social_set_plan_rule(text, text, text, jsonb, boolean) from public, anon;
grant execute on function public.admin_social_set_plan_rule(text, text, text, jsonb, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. A plan remembers the instant it was made from
-- ---------------------------------------------------------------------------
alter table public.social_plans
  add column trigger_at timestamptz,
  add column moved_at   timestamptz,
  add column moved_from timestamptz;
comment on column public.social_plans.trigger_at is 'The trigger''s instant the offsets counted from (a gig''s set start). Null on plans without a dated trigger (Fill a month).';
comment on column public.social_plans.moved_at is 'Set when the trigger moved after approval: the approved cards are flagged on the plan screen and the product''s page; the person cancels and promotes again.';
comment on column public.social_plans.moved_from is 'The trigger_at the approved cards were made for, kept when moved_at is set.';

-- ---------------------------------------------------------------------------
-- 4. Seed: gig.confirmed.v1
-- ---------------------------------------------------------------------------
insert into public.social_plan_rules (key, trigger_kind, name, posts) values
('gig.confirmed.v1', 'gig.confirmed', 'Confirmed gig: announce, countdown, tonight, thank you', $j$[
  {"offset": "-12d", "family": "announce",  "format": "feed_4x5",   "snap": "slot",    "asks": []},
  {"offset": "-3d",  "family": "countdown", "format": "story_9x16", "snap": "evening", "asks": []},
  {"offset": "-6h",  "family": "day_of",    "format": "story_9x16", "snap": "none",    "asks": []},
  {"offset": "+1d",  "family": "thank_you", "format": "feed_4x5",   "snap": "slot",    "asks": ["photo"]}
]$j$::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 5. A plan approves as one (found by the RLS suite while building phase 2):
--    (a) a plan's own drafts did not count against each other for spacing, the
--        daily cap and duplicates (they are still drafts when checked), so two
--        feed cards 30 minutes apart passed the pre-check; a sibling draft of the
--        same plan now counts as scheduled in those three checks;
--    (b) social_approve_plan discarded a per-post refusal in its second loop
--        (approved: n counted iterations), so a plan could approve in part; it
--        now raises, which rolls the whole call back: all cards or none (S1, S2).
--    The rest of social_post_issues() is 032's, verbatim.
-- ---------------------------------------------------------------------------
create or replace function public.social_post_issues(p_post uuid, p_force boolean default false)
returns text[] language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.social_posts; c public.social_accounts; issues text[] := '{}'; n int; v_max int;
begin
  select * into p from public.social_posts where id = p_post;
  if not found or not (app.is_member(p.account_id) or app.is_service()) then
    raise exception 'no such post' using errcode = 'P0002';
  end if;
  select * into c from public.social_accounts where id = p.social_account_id;
  if not public.has_feature(p.account_id, 'social.publish') then
    issues := array_append(issues, 'Scheduling is not included in your plan: copy the text and picture and post them yourself.');
  end if;
  v_max := coalesce((public.feature_value(p.account_id, 'social.scheduled_max'))::text::int, 0);
  select count(*) into n from public.social_posts
   where account_id = p.account_id and status in ('approved','rendering','queued','publishing','held') and id <> p.id;
  if v_max <> -1 and n >= v_max then
    issues := array_append(issues, format('Your plan holds %s scheduled posts at a time.', v_max));
  end if;
  if c.id is null or c.disconnected_at is not null or c.health in ('reconnect','disconnected') then
    issues := array_append(issues, 'Reconnect the account before approving.');
  elsif c.token_expires_at is not null and c.token_expires_at < p.scheduled_for + interval '1 day' then
    issues := array_append(issues, format('Reconnect before approving: the connection ends %s, the post is on %s.',
                               to_char(c.token_expires_at, 'DD Mon'), to_char(p.scheduled_for, 'DD Mon')));
  end if;
  if p.scheduled_for < now() + interval '5 minutes' then
    issues := array_append(issues, 'Pick a time at least five minutes from now.');
  end if;
  if p.scheduled_for > now() + interval '75 days' then
    issues := array_append(issues, 'Pick a time within the next 75 days.');
  end if;
  if p.format = 'story_9x16' and p.caption <> '' then
    issues := array_append(issues, 'A story has no caption: put the words in the picture.');
  end if;
  if p.format = 'reel_9x16' and p.kind <> 'video' then
    issues := array_append(issues, 'A reel needs a video.');
  end if;
  if p.kind = 'video' and p.format not in ('reel_9x16','story_9x16') then
    issues := array_append(issues, 'A video goes out as a reel or a story.');
  end if;
  if char_length(p.caption) > 2200 then issues := array_append(issues, 'The caption is over 2,200 characters.'); end if;
  if app.social_count_hashtags(p.caption) + app.social_count_hashtags(p.first_comment) > 30 then
    issues := array_append(issues, 'More than 30 hashtags across the caption and the first comment.');
  end if;
  if app.social_count_mentions(p.caption) > 20 then issues := array_append(issues, 'More than 20 @mentions in the caption.'); end if;
  if jsonb_array_length(p.media) = 0 and p.template_id is null then
    issues := array_append(issues, 'Add a picture or pick a template.');
  end if;
  if p.kind = 'video' and jsonb_array_length(p.media) = 0 then
    issues := array_append(issues, 'Upload the video first.');
  end if;
  -- daily cap: posts on this connection in the 24 h around the slot (a sibling draft of the same plan counts)
  select count(*) into n from public.social_posts
   where social_account_id = p.social_account_id and id <> p.id
     and (status in ('approved','rendering','queued','publishing','published','held')
          or (p.plan_id is not null and plan_id = p.plan_id and status = 'draft'))
     and scheduled_for between p.scheduled_for - interval '24 hours' and p.scheduled_for + interval '24 hours';
  if c.id is not null and n >= c.daily_cap then
    issues := array_append(issues, format('That day already has %s posts on this account (your cap).', c.daily_cap));
  end if;
  -- spacing: 90 minutes between posts to one account; stories exempt; a sibling draft of the same plan counts
  if p.format <> 'story_9x16' then
    select count(*) into n from public.social_posts
     where social_account_id = p.social_account_id and id <> p.id and format <> 'story_9x16'
       and (status in ('approved','rendering','queued','publishing','published','held')
            or (p.plan_id is not null and plan_id = p.plan_id and status = 'draft'))
       and abs(extract(epoch from (scheduled_for - p.scheduled_for))) < 5400;
    if n > 0 then issues := array_append(issues, 'Another post goes to this account within 90 minutes.'); end if;
  end if;
  -- duplicate: same caption and media to the same account within 7 days (needs a second tap); a sibling draft counts
  if not p_force then
    select count(*) into n from public.social_posts
     where social_account_id = p.social_account_id and id <> p.id and caption = p.caption and media = p.media
       and (status in ('approved','rendering','queued','publishing','published','held')
            or (p.plan_id is not null and plan_id = p.plan_id and status = 'draft'))
       and abs(extract(epoch from (scheduled_for - p.scheduled_for))) < 7 * 86400;
    if n > 0 then issues := array_append(issues, 'duplicate:The same post already goes to this account this week. Approve again to send it anyway.'); end if;
  end if;
  return issues;
end $$;

create or replace function public.social_approve_plan(p_plan uuid, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare pl public.social_plans; r record; issues text[]; all_issues jsonb := '{}'::jsonb; n int := 0;
begin
  select * into pl from public.social_plans where id = p_plan for update;
  if not found or not (app.is_member(pl.account_id) or app.is_service()) then
    raise exception 'no such plan' using errcode = 'P0002';
  end if;
  if pl.status <> 'proposed' then raise exception 'This plan is already decided.' using errcode = 'P0001'; end if;
  for r in select id from public.social_posts where plan_id = p_plan and status = 'draft' order by scheduled_for loop
    issues := public.social_post_issues(r.id, p_force);
    if cardinality(issues) > 0 then all_issues := all_issues || jsonb_build_object(r.id::text, to_jsonb(issues)); end if;
  end loop;
  if all_issues <> '{}'::jsonb then return jsonb_build_object('ok', false, 'issues', all_issues); end if;
  for r in select id from public.social_posts where plan_id = p_plan and status = 'draft' order by scheduled_for loop
    issues := public.social_approve_post(r.id, true);
    if cardinality(issues) > 0 then
      -- cannot happen after the pre-check unless a row changed under us: roll the whole plan back
      raise exception 'Plan not approved: %', array_to_string(issues, ' ') using errcode = 'P0001';
    end if;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'This plan has no posts to approve.' using errcode = 'P0001'; end if;
  update public.social_plans set status = 'approved', approved_at = now(), approved_by = auth.uid() where id = p_plan;
  return jsonb_build_object('ok', true, 'approved', n);
end $$;
