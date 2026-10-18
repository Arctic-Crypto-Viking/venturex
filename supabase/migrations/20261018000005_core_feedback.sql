-- 024_core_feedback — platform core (docs/PLATFORM-CORE.md §8). Written in
-- artist-platform on 16 Oct 2026; a verbatim copy is
-- core/supabase/migrations/core_024_feedback.sql. It names no vertical table.
--
-- What it is: one feedback board per product. A signed-in person writes what is
-- on their mind; the server has it reformatted (title + summary, see
-- core/src/lib/feedback-format.ts) and offers the suggestions already on the
-- board that say the same thing, so the person adds a vote instead of a
-- duplicate. When a suggestion reaches the vote threshold (setting
-- `feedback.vote_threshold`, 10) it waits on Admin → Feedback for the founder's
-- go-ahead. Nothing is built or promised automatically.
--
-- Not tenant data: a suggestion belongs to the product, not to an account, so
-- the tables carry no account_id and every signed-in person reads the board.
-- That makes this the first data one customer sees from another, so the
-- tables stay closed and the board is a narrow read-only view (the 019
-- pattern): title, summary, kind, status, votes. What the person actually
-- wrote (`body`) and who wrote it are readable by the author and superadmins only.
--
-- Who writes what:
--   * feedback_create_draft  — service role only. The reformatted title and
--     summary come from the server, never from the browser, so a person cannot
--     post a "reformatted" text of their own making through the API.
--   * feedback_publish / feedback_discard / feedback_vote / feedback_unvote —
--     the signed-in person, on their own drafts and votes.
--   * admin_feedback_* — superadmin, each change in the audit log.
--
-- Deleting an account (020): created_by and decided_by are nullable and NO
-- ACTION, so 020 clears them when the login goes; the trigger below clears the
-- original text with the author. Votes cascade with the login.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table public.feedback_items (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'idea' check (kind in ('idea','problem','other')),
  title          text not null check (char_length(btrim(title)) between 3 and 120),
  summary        text not null check (char_length(btrim(summary)) between 1 and 1200),
  body           text check (body is null or char_length(body) <= 4000),
  status         text not null default 'draft'
                 check (status in ('draft','open','approved','in_progress','shipped','declined','merged','hidden')),
  ai_formatted   boolean not null default false,
  created_by     uuid references public.users (id),
  merged_into    uuid references public.feedback_items (id) on delete set null,
  vote_count     int not null default 0,
  decision_note  text check (decision_note is null or char_length(decision_note) <= 1000),
  decided_by     uuid references public.users (id),
  decided_at     timestamptz,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (status <> 'merged' or merged_into is not null),
  check (merged_into is distinct from id)
);
comment on table public.feedback_items is
  'Product feedback board (core). body = what the person wrote: author + superadmin only. Others read feedback_board.';
create index feedback_items_status_votes_idx on public.feedback_items (status, vote_count desc);
create index feedback_items_created_by_idx on public.feedback_items (created_by, created_at desc);

create trigger feedback_items_set_updated_at before update on public.feedback_items
  for each row execute function app.set_updated_at();

create table public.feedback_votes (
  item_id     uuid not null references public.feedback_items (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index feedback_votes_user_idx on public.feedback_votes (user_id);

-- vote_count follows the votes table (votes also go when a login is deleted)
create or replace function app.feedback_recount()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item uuid := coalesce(new.item_id, old.item_id);
begin
  update public.feedback_items
     set vote_count = (select count(*) from public.feedback_votes where item_id = v_item)
   where id = v_item;
  return null;
end $$;
create trigger feedback_votes_recount after insert or delete on public.feedback_votes
  for each row execute function app.feedback_recount();

-- the author's original text goes with the author (020 clears created_by)
create or replace function app.feedback_forget_author()
returns trigger language plpgsql as $$
begin
  if old.created_by is not null and new.created_by is null then
    new.body := null;
  end if;
  return new;
end $$;
create trigger feedback_items_forget_author before update of created_by on public.feedback_items
  for each row execute function app.feedback_forget_author();

-- ---------------------------------------------------------------------------
-- 2. Access: closed tables, own rows, superadmin
-- ---------------------------------------------------------------------------
alter table public.feedback_items enable row level security;
alter table public.feedback_votes enable row level security;

create policy feedback_items_own_read on public.feedback_items for select to authenticated
  using (created_by = auth.uid());
create policy feedback_items_admin_read on public.feedback_items for select to authenticated
  using (app.is_superadmin());
create policy feedback_votes_own_read on public.feedback_votes for select to authenticated
  using (user_id = auth.uid());
create policy feedback_votes_admin_read on public.feedback_votes for select to authenticated
  using (app.is_superadmin());

-- every write goes through the functions below
revoke all on public.feedback_items, public.feedback_votes from public, anon, authenticated;
grant select on public.feedback_items, public.feedback_votes to authenticated;
grant all on public.feedback_items, public.feedback_votes to service_role;

-- Settings: threshold for the founder's go-ahead, drafts per person per day.
insert into public.system_settings (key, value, description)
values ('feedback', '{"vote_threshold": 10, "daily_drafts": 10}',
        'Feedback board: votes before a suggestion waits for the go-ahead on Admin → Feedback; reformatted drafts per person per 24 h')
on conflict (key) do nothing;

create or replace function app.feedback_setting(p_field text, p_default int)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select (value ->> p_field)::int from public.system_settings where key = 'feedback'), p_default)
$$;

-- ---------------------------------------------------------------------------
-- 3. The board: what every signed-in person reads
-- ---------------------------------------------------------------------------
create view public.feedback_board with (security_barrier = true, security_invoker = false) as
  select i.id, i.kind, i.title, i.summary, i.status, i.vote_count, i.decision_note,
         i.published_at, i.decided_at,
         (i.created_by is not distinct from auth.uid()) as mine,
         exists (select 1 from public.feedback_votes v where v.item_id = i.id and v.user_id = auth.uid()) as voted,
         (i.status = 'open' and i.vote_count >= app.feedback_setting('vote_threshold', 10)) as awaiting_review
    from public.feedback_items i
   where i.status in ('open','approved','in_progress','shipped','declined');
comment on view public.feedback_board is
  'Feedback board (core): published suggestions, no author, no original text. Read-only; authenticated.';
revoke all on public.feedback_board from public, anon, authenticated, service_role;
grant select on public.feedback_board to authenticated, service_role;

-- threshold and today's allowance, for the form
create or replace function public.feedback_status()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_used int;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select count(*) into v_used from public.feedback_items
   where created_by = auth.uid() and created_at > now() - interval '24 hours';
  return jsonb_build_object(
    'vote_threshold', app.feedback_setting('vote_threshold', 10),
    'drafts_left', greatest(app.feedback_setting('daily_drafts', 10) - v_used, 0));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Writing: the server makes the draft, the person publishes it or votes
-- ---------------------------------------------------------------------------
create or replace function public.feedback_create_draft(
  p_user uuid, p_kind text, p_title text, p_summary text, p_body text, p_ai boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_used int;
begin
  if not app.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.users where id = p_user) then
    raise exception 'unknown user' using errcode = 'P0002';
  end if;
  select count(*) into v_used from public.feedback_items
   where created_by = p_user and created_at > now() - interval '24 hours';
  if v_used >= app.feedback_setting('daily_drafts', 10) then
    raise exception 'daily feedback limit reached' using errcode = 'P0001';
  end if;
  -- an unpublished draft older than a day is dropped, with its text
  delete from public.feedback_items
   where created_by = p_user and status = 'draft' and created_at < now() - interval '24 hours';
  insert into public.feedback_items (kind, title, summary, body, created_by, ai_formatted)
  values (coalesce(p_kind, 'idea'), btrim(p_title), btrim(p_summary), p_body, p_user, coalesce(p_ai, false))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.feedback_publish(p_item uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.feedback_items set status = 'open', published_at = now()
   where id = p_item and created_by = auth.uid() and status = 'draft';
  if not found then raise exception 'no such draft' using errcode = 'P0002'; end if;
  insert into public.feedback_votes (item_id, user_id) values (p_item, auth.uid()) on conflict do nothing;
  return p_item;
end $$;

create or replace function public.feedback_discard(p_item uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.feedback_items where id = p_item and created_by = auth.uid() and status = 'draft';
end $$;

create or replace function public.feedback_vote(p_item uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.feedback_items where id = p_item and status in ('open','approved','in_progress')) then
    raise exception 'this suggestion is not open for votes' using errcode = 'P0002';
  end if;
  insert into public.feedback_votes (item_id, user_id) values (p_item, auth.uid()) on conflict do nothing;
  select vote_count into v_count from public.feedback_items where id = p_item;
  return v_count;
end $$;

create or replace function public.feedback_unvote(p_item uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count int;
begin
  delete from public.feedback_votes where item_id = p_item and user_id = auth.uid();
  select vote_count into v_count from public.feedback_items where id = p_item;
  return coalesce(v_count, 0);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Admin → Feedback (superadmin; every change audited)
-- ---------------------------------------------------------------------------
create or replace function public.admin_feedback_list()
returns setof jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_threshold int := app.feedback_setting('vote_threshold', 10);
begin
  perform app.assert_superadmin();
  return query
    select jsonb_build_object(
      'id', i.id, 'kind', i.kind, 'title', i.title, 'summary', i.summary, 'body', i.body,
      'status', i.status, 'vote_count', i.vote_count, 'ai_formatted', i.ai_formatted,
      'merged_into', i.merged_into, 'decision_note', i.decision_note,
      'decided_at', i.decided_at, 'published_at', i.published_at, 'created_at', i.created_at,
      'author_email', u.email,
      'awaiting_review', i.status = 'open' and i.vote_count >= v_threshold,
      'vote_threshold', v_threshold)
      from public.feedback_items i
      left join public.users u on u.id = i.created_by
     where i.status <> 'draft'
     order by (i.status = 'open' and i.vote_count >= v_threshold) desc, i.vote_count desc, i.published_at desc;
end $$;

create or replace function public.admin_feedback_decide(p_item uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.feedback_items;
begin
  perform app.assert_superadmin();
  if p_status not in ('open','approved','in_progress','shipped','declined','hidden') then
    raise exception 'bad status %', p_status using errcode = '22023';
  end if;
  select * into b from public.feedback_items where id = p_item and status not in ('draft','merged') for update;
  if not found then raise exception 'no such suggestion' using errcode = 'P0002'; end if;
  update public.feedback_items
     set status = p_status, decision_note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_by = auth.uid(), decided_at = now()
   where id = p_item;
  perform public.log_audit('feedback_decide', 'feedback_items', p_item::text, null,
    jsonb_build_object('status', b.status, 'decision_note', b.decision_note, 'vote_count', b.vote_count),
    jsonb_build_object('status', p_status, 'decision_note', nullif(btrim(coalesce(p_note, '')), '')));
end $$;

create or replace function public.admin_feedback_edit(p_item uuid, p_kind text, p_title text, p_summary text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.feedback_items;
begin
  perform app.assert_superadmin();
  select * into b from public.feedback_items where id = p_item for update;
  if not found then raise exception 'no such suggestion' using errcode = 'P0002'; end if;
  update public.feedback_items set kind = p_kind, title = btrim(p_title), summary = btrim(p_summary) where id = p_item;
  perform public.log_audit('feedback_edit', 'feedback_items', p_item::text, null,
    jsonb_build_object('kind', b.kind, 'title', b.title, 'summary', b.summary),
    jsonb_build_object('kind', p_kind, 'title', btrim(p_title), 'summary', btrim(p_summary)));
end $$;

-- the duplicate's votes move to the original (a person who voted for both counts once)
create or replace function public.admin_feedback_merge(p_from uuid, p_into uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.feedback_items; v_count int;
begin
  perform app.assert_superadmin();
  if p_from = p_into then raise exception 'cannot merge a suggestion into itself' using errcode = '22023'; end if;
  select * into f from public.feedback_items where id = p_from and status not in ('draft','merged') for update;
  if not found then raise exception 'no such suggestion' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.feedback_items where id = p_into and status not in ('draft','merged','hidden')) then
    raise exception 'the target is not on the board' using errcode = 'P0002';
  end if;
  insert into public.feedback_votes (item_id, user_id, created_at)
    select p_into, v.user_id, v.created_at from public.feedback_votes v where v.item_id = p_from
    on conflict do nothing;
  delete from public.feedback_votes where item_id = p_from;
  update public.feedback_items
     set status = 'merged', merged_into = p_into, decided_by = auth.uid(), decided_at = now()
   where id = p_from;
  select vote_count into v_count from public.feedback_items where id = p_into;
  perform public.log_audit('feedback_merge', 'feedback_items', p_from::text, null,
    jsonb_build_object('status', f.status, 'vote_count', f.vote_count),
    jsonb_build_object('merged_into', p_into, 'target_vote_count', v_count));
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
revoke execute on function app.feedback_recount() from public;
revoke execute on function app.feedback_forget_author() from public;
revoke execute on function app.feedback_setting(text, int) from public;
grant execute on function app.feedback_setting(text, int) to authenticated, service_role;

revoke execute on function public.feedback_status() from public, anon;
revoke execute on function public.feedback_create_draft(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.feedback_publish(uuid) from public, anon;
revoke execute on function public.feedback_discard(uuid) from public, anon;
revoke execute on function public.feedback_vote(uuid) from public, anon;
revoke execute on function public.feedback_unvote(uuid) from public, anon;
revoke execute on function public.admin_feedback_list() from public, anon;
revoke execute on function public.admin_feedback_decide(uuid, text, text) from public, anon;
revoke execute on function public.admin_feedback_edit(uuid, text, text, text) from public, anon;
revoke execute on function public.admin_feedback_merge(uuid, uuid) from public, anon;

grant execute on function public.feedback_status() to authenticated, service_role;
grant execute on function public.feedback_create_draft(uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.feedback_publish(uuid) to authenticated, service_role;
grant execute on function public.feedback_discard(uuid) to authenticated, service_role;
grant execute on function public.feedback_vote(uuid) to authenticated, service_role;
grant execute on function public.feedback_unvote(uuid) to authenticated, service_role;
grant execute on function public.admin_feedback_list() to authenticated, service_role;
grant execute on function public.admin_feedback_decide(uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_feedback_edit(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.admin_feedback_merge(uuid, uuid) to authenticated, service_role;
