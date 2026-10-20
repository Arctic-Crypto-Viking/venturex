-- 030_core_feedback_build — platform core (docs/PLATFORM-CORE.md §8). Written in
-- artist-platform on 18 Oct 2026; a verbatim copy is
-- core/supabase/migrations/core_030_feedback_build.sql. It names no vertical table.
--
-- What it is: the founder's "Start the build with Claude" on Admin → Feedback.
-- The server action opens an issue in the product's GitHub repository that
-- mentions @claude (the Claude Code GitHub Action then implements it and opens
-- a pull request), and only after that succeeded calls admin_feedback_start_build
-- here: the suggestion moves to in_progress, the issue link is kept on the row,
-- and the change is audited. Nothing here calls GitHub; SQL stays offline.
--
-- What leaves the database for GitHub is decided in the action (core/src/lib/
-- feedback-build.ts): title, summary, kind, votes and the founder's note — the
-- fields every signed-in person already reads on the board. Never the author,
-- never the original text, so /privacy is unchanged.
--
-- The link is for the founder: it is not on the board view (feedback_board),
-- only in admin_feedback_list.

-- ---------------------------------------------------------------------------
-- 1. The issue link
-- ---------------------------------------------------------------------------
alter table public.feedback_items
  add column build_url text
  check (build_url is null or (build_url like 'https://%' and char_length(build_url) <= 500));
comment on column public.feedback_items.build_url is
  'Where Claude is building it (the GitHub issue). Superadmin only; not on feedback_board.';

-- ---------------------------------------------------------------------------
-- 2. Start the build (superadmin, audited)
-- ---------------------------------------------------------------------------
create or replace function public.admin_feedback_start_build(p_item uuid, p_build_url text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.feedback_items; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform app.assert_superadmin();
  if p_build_url is null or p_build_url not like 'https://%' then
    raise exception 'bad build url' using errcode = '22023';
  end if;
  -- only something on the board and still open to work can be built
  select * into b from public.feedback_items
   where id = p_item and status in ('open','approved','in_progress') for update;
  if not found then raise exception 'no such suggestion, or it is closed' using errcode = 'P0002'; end if;
  update public.feedback_items
     set status = 'in_progress', build_url = p_build_url,
         decision_note = coalesce(v_note, decision_note),
         decided_by = auth.uid(), decided_at = now()
   where id = p_item;
  perform public.log_audit('feedback_start_build', 'feedback_items', p_item::text, null,
    jsonb_build_object('status', b.status, 'build_url', b.build_url, 'decision_note', b.decision_note),
    jsonb_build_object('status', 'in_progress', 'build_url', p_build_url, 'decision_note', coalesce(v_note, b.decision_note)));
end $$;

-- ---------------------------------------------------------------------------
-- 3. The admin list carries the link
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
      'merged_into', i.merged_into, 'decision_note', i.decision_note, 'build_url', i.build_url,
      'decided_at', i.decided_at, 'published_at', i.published_at, 'created_at', i.created_at,
      'author_email', u.email,
      'awaiting_review', i.status = 'open' and i.vote_count >= v_threshold,
      'vote_threshold', v_threshold)
      from public.feedback_items i
      left join public.users u on u.id = i.created_by
     where i.status <> 'draft'
     order by (i.status = 'open' and i.vote_count >= v_threshold) desc, i.vote_count desc, i.published_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_feedback_start_build(uuid, text, text) from public, anon;
grant execute on function public.admin_feedback_start_build(uuid, text, text) to authenticated, service_role;
