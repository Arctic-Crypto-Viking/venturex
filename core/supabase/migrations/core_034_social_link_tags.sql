-- 034_core_social_link_tags — platform core (docs/SOCIAL-MANAGER.md §3, §4.3).
-- Written in artist-platform on 20 Oct 2026; a verbatim copy is
-- core/supabase/migrations/core_034_social_link_tags.sql. Founder's ask the same
-- day: a link on a post, and tagging other people in it.
--
-- Instagram facts (IG User Media reference, checked 20 Oct 2026): no publish
-- parameter takes a link, a caption's URL is not clickable, and stickers (link,
-- poll, location) cannot be published on a story. `user_tags` is a publish
-- parameter: images need x and y (0.0–1.0), stories take them optionally (since
-- 9 Jul 2025), reels take the names only.
--
-- 1. social_posts.link: the post's link. It is not sent to Instagram; the editor
--    ends the caption with "Link in bio", and once the post is out the link is a
--    button on the actor's public page (the bio link) for 30 days, read through
--    the view below (founder's choice, 20 Oct 2026).
-- 2. social_posts.user_tags: [{username, x?, y?}], at most 20, sent as user_tags.
-- 3. Approval freezes both (the guard of 027 with two more columns).
-- 4. public_social_links: published posts' links, page columns only, read-only
--    for anon and authenticated (the 019 rule: public reads go through views).

-- ---------------------------------------------------------------------------
-- 1–2. The columns
-- ---------------------------------------------------------------------------
alter table public.social_posts
  add column link text check (link is null or (link ~ '^https?://[^\s]+$' and char_length(link) <= 500)),
  add column user_tags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(user_tags) = 'array' and jsonb_array_length(user_tags) <= 20);
comment on column public.social_posts.link is
  'Not sent to the network: shown on the actor''s public page for 30 days after publishing (public_social_links).';
comment on column public.social_posts.user_tags is
  'People tagged in the media: [{username, x?, y?}], x/y 0–1 from the top left. Sent as Instagram user_tags.';

-- ---------------------------------------------------------------------------
-- 3. Approval freezes the link and the tags too
-- ---------------------------------------------------------------------------
create or replace function app.social_post_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare worker boolean := app.is_service() or app.social_gate_open();
begin
  if tg_op = 'INSERT' then
    if not worker and new.status <> 'draft' then
      raise exception 'A post starts as a draft; approve it with social_approve_post().' using errcode = '42501';
    end if;
    if not worker and new.frozen_at is not null then new.frozen_at := null; end if;
    return new;
  end if;
  -- UPDATE
  if worker then return new; end if;
  if old.status in ('published') then
    raise exception 'A published post cannot be changed.' using errcode = '42501';
  end if;
  if old.frozen_at is not null then
    if new.caption <> old.caption or new.first_comment is distinct from old.first_comment
       or new.alt_text is distinct from old.alt_text or new.media <> old.media or new.slots <> old.slots
       or new.scheduled_for <> old.scheduled_for or new.social_account_id <> old.social_account_id
       or new.template_id is distinct from old.template_id or new.format <> old.format or new.kind <> old.kind
       or new.collaborators <> old.collaborators
       or new.link is distinct from old.link or new.user_tags <> old.user_tags then
      raise exception 'This post is approved: cancel it and make a new one to change it.' using errcode = '42501';
    end if;
  end if;
  -- a member sets only these statuses, through the functions below (which run as service)
  if new.status <> old.status then
    raise exception 'Use social_approve_post(), social_cancel_post() or social_retry_post().' using errcode = '42501';
  end if;
  if new.container_id is distinct from old.container_id or new.external_post_id is distinct from old.external_post_id
     or new.permalink is distinct from old.permalink or new.published_at is distinct from old.published_at
     or new.attempts <> old.attempts or new.frozen_at is distinct from old.frozen_at
     or new.held_reason is distinct from old.held_reason or new.error is distinct from old.error then
    raise exception 'Those fields belong to the worker.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function app.social_post_guard() from public;

-- ---------------------------------------------------------------------------
-- 4. The links a public page shows: published, with a link, the last 30 days.
--    The post itself is public on Instagram already; no account id, caption or
--    media leaves through here. The label is the picture's title or venue.
-- ---------------------------------------------------------------------------
create view public.public_social_links with (security_barrier = true, security_invoker = false) as
  select p.id, p.actor_id, p.link,
         coalesce(nullif(btrim(p.slots ->> 'title'), ''), nullif(btrim(p.slots ->> 'venue'), '')) as label,
         p.permalink, p.published_at
    from public.social_posts p
   where p.status = 'published' and p.link is not null and p.actor_id is not null
     and p.published_at > now() - interval '30 days';

comment on view public.public_social_links is
  'Social Manager (core): links of published posts for the actor''s public page ("link in bio"), 30 days. Read-only; anon + authenticated.';

revoke all on public.public_social_links from public, anon, authenticated, service_role;
grant select on public.public_social_links to anon, authenticated, service_role;
