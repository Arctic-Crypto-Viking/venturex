-- 027_core_social — platform core (docs/SOCIAL-MANAGER.md §4.2, §4.6, §5).
-- Written in artist-platform on 18 Oct 2026; a verbatim copy is
-- core/supabase/migrations/core_027_social.sql. It names no vertical table:
-- the "actor" (in Mainfloor: an artist name) is an opaque uuid here, and the
-- product supplies its label and logo through the `social` slot of the product
-- contract (core/src/product.ts).
--
-- What it is: Social Manager, phase 1 — connected social accounts (Instagram
-- first), brand kits, templates as data, a queue of posts, the worker's claims,
-- a log of every call to the provider, and insight snapshots.
--
-- Rules that this file enforces in the database, not in the UI (S9, §4.6):
--   * RLS on every table with account_id, keyed on app.is_member().
--   * The provider token never reaches a client: it lives in Supabase Vault,
--     social_accounts carries only its id (token_ref), and `authenticated` has
--     no column grant on it. Members read the view social_connections. Only the
--     service role (the worker, the OAuth callback) reads a token, through
--     social_token(); only the service role stores one.
--   * Approval freezes a post: from `approved` on, a member can change nothing
--     but cancel it or retry a failed one. Statuses from `rendering` onward are
--     the worker's (service role).
--   * Approval checks the entitlement (social.publish, social.scheduled_max),
--     the connection's health and token lifetime, caption limits, the daily
--     cap, the 90-minute spacing and duplicates — in SQL.
--   * The kill switch feature_flags.social.publishing is seeded OFF.
--
-- Vault: Supabase ships the extension on every project (schema `vault`). On a
-- plain Postgres (the RLS suite) the local shim provides the same functions.

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists supabase_vault;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Connected accounts
-- ---------------------------------------------------------------------------
create table public.social_accounts (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete cascade,
  actor_id         uuid,                                   -- opaque to core (Mainfloor: artist_identities.id)
  provider         text not null check (provider in ('instagram','threads','facebook')),
  external_id      text not null,                          -- the provider's id of the connected profile
  handle           text,
  display_name     text,
  avatar_url       text,
  account_type     text,                                   -- business / creator / personal (as the provider says)
  scopes           text[] not null default '{}',
  token_ref        uuid,                                   -- vault.secrets.id; never granted to authenticated
  token_expires_at timestamptz,
  token_refreshed_at timestamptz,
  health           text not null default 'ok' check (health in ('ok','expiring','reconnect','disconnected')),
  health_note      text,
  last_checked_at  timestamptz,
  daily_cap        int not null default 10 check (daily_cap between 1 and 50),
  slots            jsonb not null default '[]'::jsonb,     -- posting rhythm, e.g. [{"dow":2,"time":"19:00"}]
  connected_by     uuid references public.users (id) on delete set null,
  connected_at     timestamptz not null default now(),
  disconnected_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (provider, external_id)
);
comment on table public.social_accounts is
  'Social Manager (core): one connected profile per row. token_ref points into Vault; members read social_connections.';
create index social_accounts_account_idx on public.social_accounts (account_id, actor_id);
create index social_accounts_token_idx on public.social_accounts (token_expires_at) where disconnected_at is null;
create trigger social_accounts_set_updated_at before update on public.social_accounts
  for each row execute function app.set_updated_at();

-- the secret goes with the row (account deletion, 020, cascades here)
create or replace function app.social_forget_token()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.token_ref is not null then
    delete from vault.secrets where id = old.token_ref;
  end if;
  return old;
end $$;
create trigger social_accounts_forget_token after delete on public.social_accounts
  for each row execute function app.social_forget_token();

-- what members read: everything but the token reference
create view public.social_connections with (security_invoker = true) as
  select id, account_id, actor_id, provider, external_id, handle, display_name, avatar_url, account_type, scopes,
         token_expires_at, token_refreshed_at, health, health_note, last_checked_at, daily_cap, slots,
         connected_by, connected_at, disconnected_at, created_at, updated_at
    from public.social_accounts;
comment on view public.social_connections is
  'Social Manager (core): connected profiles without the token reference. RLS of social_accounts applies (security_invoker).';

-- ---------------------------------------------------------------------------
-- 2. Brand kits, templates, plans, posts, log, insights
-- ---------------------------------------------------------------------------
create table public.social_brand_kits (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete cascade,
  actor_id         uuid,
  name             text,
  logo_url         text,
  logo_dark_url    text,
  primary_color    text not null default '#111111' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color  text not null default '#ffffff' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  font_key         text not null default 'dm_sans'
                   check (font_key in ('ibm_plex_sans','archivo','dm_sans','fraunces','source_sans_3','manrope')),
  signature        text check (signature is null or char_length(signature) <= 120),
  handle           text,
  hashtag_sets     jsonb not null default '{}'::jsonb,     -- {"default": ["#..."], "gig": [...]}
  language         text not null default 'en' check (language ~ '^[a-z]{2,3}$'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.social_brand_kits is 'Social Manager (core): one brand kit per actor (logo, colours, font, signature, hashtags).';
create unique index social_brand_kits_actor_idx
  on public.social_brand_kits (account_id, coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid));
create trigger social_brand_kits_set_updated_at before update on public.social_brand_kits
  for each row execute function app.set_updated_at();

create table public.social_templates (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references public.accounts (id) on delete cascade,   -- null = system template
  key         text not null,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  family      text not null check (family in ('announce','countdown','day_of','thank_you','release','mix','plain')),
  platform    text not null default 'instagram' check (platform in ('instagram','threads','facebook')),
  format      text not null check (format in ('feed_4x5','square','story_9x16','reel_cover','carousel_page')),
  layout      jsonb not null,                               -- the Satori tree with {{slot}} placeholders
  slots       text[] not null default '{}',                 -- the slots the layout asks for, in order
  preview_url text,
  copy_of     uuid references public.social_templates (id) on delete set null,
  version     int not null default 1,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.social_templates is 'Social Manager (core): layouts as data. account_id null = system template (admin console); an account''s own rows are copies.';
create unique index social_templates_key_idx
  on public.social_templates (coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
create trigger social_templates_set_updated_at before update on public.social_templates
  for each row execute function app.set_updated_at();

-- own templates are an entitlement (social.templates_custom); system rows are the admin's
create or replace function app.social_template_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if app.is_service() or app.is_superadmin() then return new; end if;
  if new.account_id is null then
    raise exception 'system templates are edited in the admin console' using errcode = '42501';
  end if;
  if not public.has_feature(new.account_id, 'social.templates_custom') then
    raise exception 'Own templates are not included in your plan.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger social_templates_guard before insert or update on public.social_templates
  for each row execute function app.social_template_guard();

create table public.social_plans (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  actor_id      uuid,
  trigger_kind  text not null,                              -- gig.confirmed, release.scheduled, manual …
  trigger_ref   uuid,
  rule_key      text,
  status        text not null default 'proposed' check (status in ('proposed','approved','done','cancelled')),
  approved_at   timestamptz,
  approved_by   uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.social_plans is 'Social Manager (core): a generated set of posts from one trigger (phase 2 fills these).';
create index social_plans_account_idx on public.social_plans (account_id, actor_id, status);
create trigger social_plans_set_updated_at before update on public.social_plans
  for each row execute function app.set_updated_at();

create table public.social_posts (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references public.accounts (id) on delete cascade,
  actor_id             uuid,
  plan_id              uuid references public.social_plans (id) on delete set null,
  social_account_id    uuid not null references public.social_accounts (id) on delete cascade,
  template_id          uuid references public.social_templates (id) on delete set null,
  format               text not null check (format in ('feed_4x5','square','story_9x16','reel_cover','carousel_page')),
  kind                 text not null default 'image' check (kind in ('image','video')),
  slots                jsonb not null default '{}'::jsonb,  -- the values rendered into the template
  media                jsonb not null default '[]'::jsonb,  -- [{url, kind, width, height, bytes}]
  caption              text not null default '' check (char_length(caption) <= 2200),
  first_comment        text check (first_comment is null or char_length(first_comment) <= 2200),
  alt_text             text check (alt_text is null or char_length(alt_text) <= 1000),
  collaborators        text[] not null default '{}' check (cardinality(collaborators) <= 3),
  scheduled_for        timestamptz not null,
  status               text not null default 'draft'
                       check (status in ('draft','approved','rendering','queued','publishing','published','failed','cancelled','held')),
  held_reason          text,
  container_id         text,
  container_created_at timestamptz,
  external_post_id     text,
  permalink            text,
  published_at         timestamptz,
  error                text,
  attempts             int not null default 0,
  frozen_at            timestamptz,
  created_by           uuid references public.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table public.social_posts is
  'Social Manager (core): the queue, one row per post. Frozen at approval; statuses from rendering on are set by the worker.';
create index social_posts_queue_idx on public.social_posts (status, scheduled_for);
create index social_posts_account_idx on public.social_posts (account_id, actor_id, scheduled_for desc);
create index social_posts_connection_idx on public.social_posts (social_account_id, scheduled_for desc);
create trigger social_posts_set_updated_at before update on public.social_posts
  for each row execute function app.set_updated_at();

-- The functions below (approve, cancel, retry, connect, disconnect) write the
-- statuses on a member's behalf; they open this transaction-local gate around
-- their own writes so the guard lets them through, and close it again.
create or replace function app.social_gate(p_open boolean)
returns void language sql as $$
  select set_config('app.social_gate', case when p_open then '1' else '' end, true)
$$;
create or replace function app.social_gate_open()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.social_gate', true), '') = '1'
$$;

-- Approval freezes content; the worker owns the publishing statuses (§4.6).
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
       or new.collaborators <> old.collaborators then
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
create trigger social_posts_guard before insert or update on public.social_posts
  for each row execute function app.social_post_guard();

create table public.social_publish_log (
  id          bigint generated always as identity primary key,
  account_id  uuid not null references public.accounts (id) on delete cascade,
  post_id     uuid references public.social_posts (id) on delete cascade,
  social_account_id uuid references public.social_accounts (id) on delete cascade,
  step        text not null check (step in ('connect','render','container','poll','publish','comment','insights','refresh','health')),
  request     jsonb,                                       -- never the token
  response    jsonb,
  ok          boolean not null,
  at          timestamptz not null default now()
);
comment on table public.social_publish_log is 'Social Manager (core): every call to a provider, for support and the admin failure list. Never holds a token.';
create index social_publish_log_post_idx on public.social_publish_log (post_id, at desc);
create index social_publish_log_account_idx on public.social_publish_log (account_id, at desc);

create table public.social_insights (
  id                bigint generated always as identity primary key,
  account_id        uuid not null references public.accounts (id) on delete cascade,
  post_id           uuid references public.social_posts (id) on delete cascade,
  social_account_id uuid references public.social_accounts (id) on delete cascade,
  captured_at       timestamptz not null default now(),
  metrics           jsonb not null default '{}'::jsonb,
  check (post_id is not null or social_account_id is not null)
);
comment on table public.social_insights is 'Social Manager (core): metric snapshots per post (48 h, 7 d) and per account (weekly). Phase 3 fills them.';
create index social_insights_post_idx on public.social_insights (post_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- 3. Access
-- ---------------------------------------------------------------------------
alter table public.social_accounts    enable row level security;
alter table public.social_brand_kits  enable row level security;
alter table public.social_templates   enable row level security;
alter table public.social_plans       enable row level security;
alter table public.social_posts       enable row level security;
alter table public.social_publish_log enable row level security;
alter table public.social_insights    enable row level security;

-- connections: members read (minus the token, by column grant) and adjust cap + rhythm; connect/disconnect are functions
create policy social_accounts_member_read on public.social_accounts for select to authenticated using (app.is_member(account_id));
create policy social_accounts_member_update on public.social_accounts for update to authenticated
  using (app.is_member(account_id)) with check (app.is_member(account_id));
revoke all on public.social_accounts from public, anon, authenticated;
grant select (id, account_id, actor_id, provider, external_id, handle, display_name, avatar_url, account_type, scopes,
              token_expires_at, token_refreshed_at, health, health_note, last_checked_at, daily_cap, slots,
              connected_by, connected_at, disconnected_at, created_at, updated_at) on public.social_accounts to authenticated;
grant update (daily_cap, slots) on public.social_accounts to authenticated;
grant all on public.social_accounts to service_role;
revoke all on public.social_connections from public, anon, authenticated, service_role;
grant select on public.social_connections to authenticated, service_role;

create policy social_brand_kits_member on public.social_brand_kits for all to authenticated
  using (app.is_member(account_id)) with check (app.is_member(account_id));

create policy social_templates_read on public.social_templates for select to authenticated
  using (account_id is null or app.is_member(account_id));
create policy social_templates_member_write on public.social_templates for insert to authenticated
  with check (account_id is not null and app.is_member(account_id));
create policy social_templates_member_update on public.social_templates for update to authenticated
  using (account_id is not null and app.is_member(account_id)) with check (account_id is not null and app.is_member(account_id));
create policy social_templates_member_delete on public.social_templates for delete to authenticated
  using (account_id is not null and app.is_member(account_id));

create policy social_plans_member on public.social_plans for all to authenticated
  using (app.is_member(account_id)) with check (app.is_member(account_id));

create policy social_posts_member on public.social_posts for all to authenticated
  using (app.is_member(account_id)) with check (app.is_member(account_id));

create policy social_publish_log_member_read on public.social_publish_log for select to authenticated using (app.is_member(account_id));
revoke all on public.social_publish_log from public, anon, authenticated;
grant select on public.social_publish_log to authenticated;
grant all on public.social_publish_log to service_role;

create policy social_insights_member_read on public.social_insights for select to authenticated using (app.is_member(account_id));
revoke all on public.social_insights from public, anon, authenticated;
grant select on public.social_insights to authenticated;
grant all on public.social_insights to service_role;

-- ---------------------------------------------------------------------------
-- 4. Storage: the public bucket `social` (same policies as `epk`, 010).
--    Path <account id>/<post id>/<n>.jpg; Meta fetches by URL, so it is public.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social', 'social', true, 52428800, array['image/jpeg','video/mp4','video/quicktime'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "social public read" on storage.objects;
create policy "social public read" on storage.objects for select
  to anon, authenticated using (bucket_id = 'social');
drop policy if exists "social member insert" on storage.objects;
create policy "social member insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'social' and app.is_member(app.path_account(name)));
drop policy if exists "social member update" on storage.objects;
create policy "social member update" on storage.objects for update
  to authenticated using (bucket_id = 'social' and app.is_member(app.path_account(name)))
  with check (bucket_id = 'social' and app.is_member(app.path_account(name)));
drop policy if exists "social member delete" on storage.objects;
create policy "social member delete" on storage.objects for delete
  to authenticated using (bucket_id = 'social' and app.is_member(app.path_account(name)));

-- ---------------------------------------------------------------------------
-- 5. Tokens: Vault in, Vault out — service role only
-- ---------------------------------------------------------------------------
-- Connect (the OAuth callback, after it verified the signed state and the
-- member's account): upsert the profile, store the token. One provider profile
-- is connected under one actor of one account across the product.
create or replace function public.social_connect(
  p_account uuid, p_actor uuid, p_user uuid, p_provider text, p_external_id text,
  p_handle text, p_display_name text, p_avatar_url text, p_account_type text, p_scopes text[],
  p_token text, p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.social_accounts; v_id uuid; v_ref uuid; v_max int;
begin
  if not app.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.account_members m where m.account_id = p_account and m.user_id = p_user and m.status = 'active') then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  select * into v from public.social_accounts where provider = p_provider and external_id = p_external_id for update;
  if found and v.account_id <> p_account then
    if v.disconnected_at is null then
      raise exception 'This %s account is already connected elsewhere.', initcap(p_provider) using errcode = 'P0001';
    end if;
    delete from public.social_accounts where id = v.id;   -- the old, disconnected connection goes (its token with it)
    v := null;
  end if;
  if v.id is null then
    -- the plan's limit on connected accounts (social.accounts_max; -1 = unlimited)
    v_max := coalesce((public.feature_value(p_account, 'social.accounts_max'))::text::int, 0);
    if v_max <> -1 and (select count(*) from public.social_accounts where account_id = p_account and disconnected_at is null) >= v_max then
      raise exception 'Your plan allows % connected %.', v_max, case when v_max = 1 then 'account' else 'accounts' end using errcode = 'P0001';
    end if;
    v_ref := vault.create_secret(p_token, 'social_' || gen_random_uuid()::text, 'Social Manager token');
    insert into public.social_accounts (account_id, actor_id, provider, external_id, handle, display_name, avatar_url, account_type,
                                        scopes, token_ref, token_expires_at, token_refreshed_at, health, connected_by)
    values (p_account, p_actor, p_provider, p_external_id, p_handle, p_display_name, p_avatar_url, p_account_type,
            coalesce(p_scopes, '{}'), v_ref, p_expires_at, now(), 'ok', p_user)
    returning id into v_id;
  else
    if v.token_ref is null then
      v_ref := vault.create_secret(p_token, 'social_' || gen_random_uuid()::text, 'Social Manager token');
    else
      v_ref := v.token_ref;
      perform vault.update_secret(v_ref, p_token);
    end if;
    update public.social_accounts
       set actor_id = p_actor, handle = p_handle, display_name = p_display_name, avatar_url = p_avatar_url,
           account_type = p_account_type, scopes = coalesce(p_scopes, '{}'), token_ref = v_ref,
           token_expires_at = p_expires_at, token_refreshed_at = now(), health = 'ok', health_note = null,
           last_checked_at = now(), connected_by = p_user, connected_at = now(), disconnected_at = null
     where id = v.id;
    v_id := v.id;
    -- posts that waited for this connection may go again
  perform app.social_gate(true);
    update public.social_posts set status = 'queued', held_reason = null
     where social_account_id = v_id and status = 'held' and held_reason = 'disconnected';
  perform app.social_gate(false);
  end if;
  insert into public.audit_log (actor_user_id, actor_role, account_id, action, entity_type, entity_id, after)
  values (p_user, 'authenticated', p_account, 'social_connect', 'social_accounts', v_id::text,
          jsonb_build_object('provider', p_provider, 'handle', p_handle));
  return v_id;
end $$;

-- The token itself: the worker and the OAuth code only.
create or replace function public.social_token(p_social_account uuid)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_ref uuid; v_secret text;
begin
  if not app.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  select token_ref into v_ref from public.social_accounts where id = p_social_account and disconnected_at is null;
  if v_ref is null then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_ref;
  return v_secret;
end $$;

-- After a refresh: the new token and its expiry.
create or replace function public.social_store_token(p_social_account uuid, p_token text, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ref uuid;
begin
  if not app.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  select token_ref into v_ref from public.social_accounts where id = p_social_account for update;
  if v_ref is null then
    v_ref := vault.create_secret(p_token, 'social_' || gen_random_uuid()::text, 'Social Manager token');
  else
    perform vault.update_secret(v_ref, p_token);
  end if;
  update public.social_accounts
     set token_ref = v_ref, token_expires_at = p_expires_at, token_refreshed_at = now(),
         health = 'ok', health_note = null, last_checked_at = now()
   where id = p_social_account;
end $$;

-- The member disconnects: the token goes, waiting posts hold, audited.
create or replace function public.social_disconnect(p_social_account uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.social_accounts;
begin
  select * into v from public.social_accounts where id = p_social_account for update;
  if not found or not (app.is_member(v.account_id) or app.is_service()) then
    raise exception 'no such connection' using errcode = 'P0002';
  end if;
  if v.token_ref is not null then delete from vault.secrets where id = v.token_ref; end if;
  update public.social_accounts
     set token_ref = null, token_expires_at = null, health = 'disconnected', disconnected_at = now()
   where id = v.id;
  perform app.social_gate(true);
  update public.social_posts set status = 'held', held_reason = 'disconnected'
   where social_account_id = v.id and status in ('approved','rendering','queued','publishing') and external_post_id is null;
  perform app.social_gate(false);
  insert into public.audit_log (actor_user_id, actor_role, account_id, action, entity_type, entity_id, before)
  values (auth.uid(), coalesce(auth.role(), 'service_role'), v.account_id, 'social_disconnect', 'social_accounts', v.id::text,
          jsonb_build_object('provider', v.provider, 'handle', v.handle));
end $$;

-- ---------------------------------------------------------------------------
-- 6. Approval: the guard rails of §4.6, in one place
-- ---------------------------------------------------------------------------
create or replace function app.social_count_hashtags(p text) returns int language sql immutable as $$
  select coalesce(array_length(regexp_split_to_array(coalesce(p, ''), '\s+'), 1), 0)
       - coalesce(array_length(array_remove(regexp_split_to_array(coalesce(p, ''), '\s+'), null), 1), 0)
       + (select count(*) from regexp_matches(coalesce(p, ''), '(^|\s)#[^\s#]+', 'g'))::int
$$;
create or replace function app.social_count_mentions(p text) returns int language sql immutable as $$
  select (select count(*) from regexp_matches(coalesce(p, ''), '(^|\s)@[^\s@]+', 'g'))::int
$$;

-- Everything approval checks, as a list of problems (empty = fine). Also used by
-- the UI to show them before the tap. p_force skips the duplicate warning.
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
  -- daily cap: posts on this connection in the 24 h around the slot
  select count(*) into n from public.social_posts
   where social_account_id = p.social_account_id and id <> p.id
     and status in ('approved','rendering','queued','publishing','published','held')
     and scheduled_for between p.scheduled_for - interval '24 hours' and p.scheduled_for + interval '24 hours';
  if c.id is not null and n >= c.daily_cap then
    issues := array_append(issues, format('That day already has %s posts on this account (your cap).', c.daily_cap));
  end if;
  -- spacing: 90 minutes between posts to one account; stories exempt
  if p.format <> 'story_9x16' then
    select count(*) into n from public.social_posts
     where social_account_id = p.social_account_id and id <> p.id and format <> 'story_9x16'
       and status in ('approved','rendering','queued','publishing','published','held')
       and abs(extract(epoch from (scheduled_for - p.scheduled_for))) < 5400;
    if n > 0 then issues := array_append(issues, 'Another post goes to this account within 90 minutes.'); end if;
  end if;
  -- duplicate: same caption and media to the same account within 7 days (needs a second tap)
  if not p_force then
    select count(*) into n from public.social_posts
     where social_account_id = p.social_account_id and id <> p.id and caption = p.caption and media = p.media
       and status in ('approved','rendering','queued','publishing','published','held')
       and abs(extract(epoch from (scheduled_for - p.scheduled_for))) < 7 * 86400;
    if n > 0 then issues := array_append(issues, 'duplicate:The same post already goes to this account this week. Approve again to send it anyway.'); end if;
  end if;
  return issues;
end $$;

create or replace function public.social_approve_post(p_post uuid, p_force boolean default false)
returns text[] language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.social_posts; issues text[];
begin
  select * into p from public.social_posts where id = p_post for update;
  if not found or not (app.is_member(p.account_id) or app.is_service()) then
    raise exception 'no such post' using errcode = 'P0002';
  end if;
  if p.status not in ('draft') then
    raise exception 'Only a draft can be approved.' using errcode = 'P0001';
  end if;
  issues := public.social_post_issues(p_post, p_force);
  if cardinality(issues) > 0 then return issues; end if;
  perform app.social_gate(true);
  update public.social_posts set status = 'approved', frozen_at = now(), error = null, held_reason = null where id = p_post;
  perform app.social_gate(false);
  insert into public.audit_log (actor_user_id, actor_role, account_id, action, entity_type, entity_id, after)
  values (auth.uid(), coalesce(auth.role(), 'service_role'), p.account_id, 'social_approve', 'social_posts', p.id::text,
          jsonb_build_object('scheduled_for', p.scheduled_for, 'format', p.format));
  return '{}';
end $$;

-- A plan: every post must pass, or none is approved (S1, S2).
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
  for r in select id from public.social_posts where plan_id = p_plan and status = 'draft' loop
    perform public.social_approve_post(r.id, true);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'This plan has no posts to approve.' using errcode = 'P0001'; end if;
  update public.social_plans set status = 'approved', approved_at = now(), approved_by = auth.uid() where id = p_plan;
  return jsonb_build_object('ok', true, 'approved', n);
end $$;

create or replace function public.social_cancel_post(p_post uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.social_posts;
begin
  select * into p from public.social_posts where id = p_post for update;
  if not found or not (app.is_member(p.account_id) or app.is_service()) then
    raise exception 'no such post' using errcode = 'P0002';
  end if;
  if p.status = 'published' or p.external_post_id is not null then
    raise exception 'This post is already published.' using errcode = 'P0001';
  end if;
  perform app.social_gate(true);
  update public.social_posts set status = 'cancelled', held_reason = null where id = p_post;
  perform app.social_gate(false);
  insert into public.audit_log (actor_user_id, actor_role, account_id, action, entity_type, entity_id, before)
  values (auth.uid(), coalesce(auth.role(), 'service_role'), p.account_id, 'social_cancel', 'social_posts', p.id::text,
          jsonb_build_object('status', p.status, 'scheduled_for', p.scheduled_for));
end $$;

-- Retry a failed or held post: back to approved with what it had; the worker
-- picks it up at the next minute (a past slot publishes at once).
create or replace function public.social_retry_post(p_post uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.social_posts;
begin
  select * into p from public.social_posts where id = p_post for update;
  if not found or not (app.is_member(p.account_id) or app.is_service()) then
    raise exception 'no such post' using errcode = 'P0002';
  end if;
  if p.status not in ('failed','held') then raise exception 'Only a failed or held post can be retried.' using errcode = 'P0001'; end if;
  if p.held_reason = 'disconnected' and exists (select 1 from public.social_accounts where id = p.social_account_id and disconnected_at is not null) then
    raise exception 'Reconnect the account first.' using errcode = 'P0001';
  end if;
  perform app.social_gate(true);
  update public.social_posts
     set status = 'approved', error = null, held_reason = null, container_id = null, container_created_at = null
   where id = p_post;
  perform app.social_gate(false);
end $$;

-- ---------------------------------------------------------------------------
-- 7. The worker's claims (service role; `for update skip locked` so a second
--    cron call finds nothing — the digest's pattern)
-- ---------------------------------------------------------------------------
-- Approved posts due within 24 h, with no media yet: → rendering, for the renderer.
create or replace function public.social_claim_render(p_limit int default 20)
returns setof public.social_posts language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    with due as (
      select id from public.social_posts
       where status = 'approved' and scheduled_for < now() + interval '24 hours'
       order by scheduled_for
       limit p_limit
       for update skip locked)
    update public.social_posts p
       set status = case when jsonb_array_length(p.media) > 0 then 'queued' else 'rendering' end
      from due where p.id = due.id
    returning p.*;
end $$;

-- Queued posts due within 15 minutes: → publishing, for the container step.
create or replace function public.social_claim_due(p_now timestamptz default now(), p_limit int default 20)
returns setof public.social_posts language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    with due as (
      select id from public.social_posts
       where status = 'queued' and scheduled_for < p_now + interval '15 minutes'
       order by scheduled_for
       limit p_limit
       for update skip locked)
    update public.social_posts p
       set status = 'publishing', attempts = p.attempts + 1
      from due where p.id = due.id
    returning p.*;
end $$;

create or replace function public.social_hold(p_post uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.social_posts set status = 'held', held_reason = p_reason
   where id = p_post and status in ('approved','rendering','queued','publishing') and external_post_id is null;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Admin → Social (superadmin): connections and health, failures, templates
-- ---------------------------------------------------------------------------
create or replace function public.admin_social_overview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.assert_superadmin();
  return jsonb_build_object(
    'publishing', public.flag_enabled('social.publishing'),
    'connections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'account_id', s.account_id, 'account_name', a.name, 'provider', s.provider, 'handle', s.handle,
        'account_type', s.account_type, 'health', s.health, 'health_note', s.health_note,
        'token_expires_at', s.token_expires_at, 'last_checked_at', s.last_checked_at, 'connected_at', s.connected_at,
        'disconnected_at', s.disconnected_at, 'daily_cap', s.daily_cap,
        'queued', (select count(*) from public.social_posts p where p.social_account_id = s.id and p.status in ('approved','rendering','queued','publishing','held')),
        'published', (select count(*) from public.social_posts p where p.social_account_id = s.id and p.status = 'published'))
        order by s.disconnected_at is not null, s.health <> 'ok' desc, s.connected_at desc)
        from public.social_accounts s join public.accounts a on a.id = s.account_id), '[]'::jsonb),
    'failed', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'account_id', p.account_id, 'account_name', a.name, 'handle', s.handle, 'provider', s.provider,
        'format', p.format, 'scheduled_for', p.scheduled_for, 'status', p.status, 'held_reason', p.held_reason,
        'error', p.error, 'attempts', p.attempts, 'updated_at', p.updated_at)
        order by p.updated_at desc)
        from public.social_posts p
        join public.accounts a on a.id = p.account_id
        join public.social_accounts s on s.id = p.social_account_id
       where p.status in ('failed','held') and p.updated_at > now() - interval '30 days'), '[]'::jsonb),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'key', t.key, 'name', t.name, 'family', t.family, 'platform', t.platform,
                                          'format', t.format, 'slots', t.slots, 'version', t.version, 'is_active', t.is_active,
                                          'used', (select count(*) from public.social_posts p where p.template_id = t.id))
                       order by t.family, t.format)
        from public.social_templates t where t.account_id is null), '[]'::jsonb),
    'counts', jsonb_build_object(
      'queued', (select count(*) from public.social_posts where status in ('approved','rendering','queued','publishing')),
      'held', (select count(*) from public.social_posts where status = 'held'),
      'failed', (select count(*) from public.social_posts where status = 'failed'),
      'published_7d', (select count(*) from public.social_posts where status = 'published' and published_at > now() - interval '7 days')),
    'generated_at', now());
end $$;

-- ---------------------------------------------------------------------------
-- 9. Reference data: module, features, plan values (§5), the kill switch
-- ---------------------------------------------------------------------------
insert into public.modules (key, name, description, sort_order, visibility) values
  ('social', 'Social Manager', 'Connected Instagram accounts, brand kit, rendered templates, scheduled posts', 80, 'public')
on conflict (key) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, visibility = excluded.visibility;
-- the promotion assistant's row makes way (its quota stays for any account that has it)
update public.modules set visibility = 'internal', sort_order = 85 where key = 'promo';

insert into public.features (module_id, key, name, description, kind, unit, default_value)
select m.id, f.key, f.name, f.description, f.kind, f.unit, f.default_value::jsonb
from (values
  ('social.publish',          'Scheduled publishing',   'Approved posts are published by the worker; off = drafts to copy', 'flag',  'absolute', 'false'),
  ('social.accounts_max',     'Connected accounts',     'Social accounts connected per account; -1 = unlimited',             'limit', 'absolute', '1'),
  ('social.scheduled_max',    'Posts waiting',          'Approved posts waiting at once; -1 = unlimited',                   'limit', 'absolute', '0'),
  ('social.templates_custom', 'Own templates',          'Copy and edit the system templates',                               'flag',  'absolute', 'false'),
  ('social.insights',         'Post insights',          'Reach, likes, saves and shares on each post',                      'flag',  'absolute', 'false')
) as f(key, name, description, kind, unit, default_value)
join public.modules m on m.key = 'social'
on conflict (key) do update set name = excluded.name, description = excluded.description, kind = excluded.kind, unit = excluded.unit, default_value = excluded.default_value;

insert into public.plan_features (plan_id, feature_id, value)
select p.id, f.id, v.value::jsonb
from (values
  -- feature                   free      founding  pro       crew
  ('social.publish',           'false',  'true',   'true',   'true'),
  ('social.accounts_max',      '1',      '3',      '3',      '12'),
  ('social.scheduled_max',     '0',      '60',     '60',     '300'),
  ('social.templates_custom',  'false',  'true',   'true',   'true'),
  ('social.insights',          'false',  'true',   'true',   'true')
) as m(feature_key, free_v, founding_v, pro_v, crew_v)
cross join lateral (values ('free', m.free_v), ('founding', m.founding_v), ('pro', m.pro_v), ('crew', m.crew_v)) as v(plan_key, value)
join public.plans p on p.key = v.plan_key
join public.features f on f.key = m.feature_key
on conflict (plan_id, feature_id) do update set value = excluded.value;

insert into public.feature_flags (key, enabled, description) values
  ('social.publishing', false, 'Social Manager worker publishes. OFF = posts render and hold; nothing reaches Meta')
on conflict (key) do update set description = excluded.description;

-- ---------------------------------------------------------------------------
-- 10. System templates (S8: templates are data). Satori trees; {{slot}} in a
--     string is a value, {{brand.*}} comes from the brand kit. Sizes: feed 4:5
--     1080×1350, story 9:16 1080×1920. Fonts: the brand kit's font_key.
-- ---------------------------------------------------------------------------
-- The guard trigger below trusts app.is_service() for the seed, but `supabase db push`
-- on the hosted project did not pass it (18 Oct 2026: "system templates are edited in
-- the admin console", SQLSTATE 42501, statement 100). The migration is the one place
-- system rows are written outside the admin console, so it switches the guard off for
-- the seed and back on right after. Nothing else in this file writes system rows.
alter table public.social_templates disable trigger social_templates_guard;
insert into public.social_templates (account_id, key, name, family, platform, format, slots, layout) values
(null, 'announce_feed', 'Announce', 'announce', 'instagram', 'feed_4x5', array['title','venue','date','photo'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","width":"1080px","height":"1350px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","position":"relative"},"children":[
   {"type":"img","props":{"src":"{{photo}}","style":{"position":"absolute","top":"0","left":"0","width":"1080px","height":"1350px","objectFit":"cover"}}},
   {"type":"div","props":{"style":{"position":"absolute","top":"0","left":"0","width":"1080px","height":"1350px","backgroundImage":"linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 45%, rgba(0,0,0,0.78) 100%)"}}},
   {"type":"img","props":{"src":"{{brand.logo}}","style":{"position":"absolute","top":"64px","left":"64px","width":"160px","height":"160px","objectFit":"contain"}}},
   {"type":"div","props":{"style":{"position":"absolute","left":"64px","right":"64px","bottom":"80px","display":"flex","flexDirection":"column","gap":"18px"},"children":[
     {"type":"div","props":{"style":{"fontSize":"34px","letterSpacing":"6px","textTransform":"uppercase","opacity":0.9},"children":"{{date}}"}},
     {"type":"div","props":{"style":{"fontSize":"92px","fontWeight":700,"lineHeight":1.02},"children":"{{title}}"}},
     {"type":"div","props":{"style":{"fontSize":"40px","opacity":0.92},"children":"{{venue}}"}},
     {"type":"div","props":{"style":{"marginTop":"24px","fontSize":"28px","opacity":0.8},"children":"{{brand.signature}}"}}
   ]}}
 ]}}$j$::jsonb),
(null, 'countdown_story', 'Countdown', 'countdown', 'instagram', 'story_9x16', array['number','title','date'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center","width":"1080px","height":"1920px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","position":"relative"},"children":[
   {"type":"img","props":{"src":"{{brand.logo}}","style":{"position":"absolute","top":"160px","width":"220px","height":"220px","objectFit":"contain"}}},
   {"type":"div","props":{"style":{"fontSize":"44px","letterSpacing":"8px","textTransform":"uppercase","opacity":0.85},"children":"in"}},
   {"type":"div","props":{"style":{"fontSize":"420px","fontWeight":700,"lineHeight":1},"children":"{{number}}"}},
   {"type":"div","props":{"style":{"fontSize":"44px","letterSpacing":"8px","textTransform":"uppercase","opacity":0.85},"children":"days"}},
   {"type":"div","props":{"style":{"position":"absolute","bottom":"260px","left":"80px","right":"80px","display":"flex","flexDirection":"column","alignItems":"center","gap":"16px","textAlign":"center"},"children":[
     {"type":"div","props":{"style":{"fontSize":"64px","fontWeight":700,"lineHeight":1.1},"children":"{{title}}"}},
     {"type":"div","props":{"style":{"fontSize":"36px","opacity":0.85},"children":"{{date}}"}}
   ]}}
 ]}}$j$::jsonb),
(null, 'day_of_story', 'Tonight', 'day_of', 'instagram', 'story_9x16', array['venue','time','city'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","justifyContent":"flex-end","width":"1080px","height":"1920px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","position":"relative","padding":"96px"},"children":[
   {"type":"img","props":{"src":"{{brand.logo}}","style":{"position":"absolute","top":"140px","left":"96px","width":"200px","height":"200px","objectFit":"contain"}}},
   {"type":"div","props":{"style":{"fontSize":"180px","fontWeight":700,"lineHeight":0.95,"textTransform":"uppercase"},"children":"Tonight"}},
   {"type":"div","props":{"style":{"marginTop":"40px","fontSize":"64px","fontWeight":700},"children":"{{venue}}"}},
   {"type":"div","props":{"style":{"marginTop":"12px","fontSize":"44px","opacity":0.9},"children":"{{city}}"}},
   {"type":"div","props":{"style":{"marginTop":"48px","fontSize":"96px","fontWeight":700},"children":"{{time}}"}},
   {"type":"div","props":{"style":{"marginTop":"120px","fontSize":"30px","opacity":0.75},"children":"{{brand.signature}}"}}
 ]}}$j$::jsonb),
(null, 'thank_you_feed', 'Thank you', 'thank_you', 'instagram', 'feed_4x5', array['city','photo'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","width":"1080px","height":"1350px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","position":"relative"},"children":[
   {"type":"img","props":{"src":"{{photo}}","style":{"position":"absolute","top":"0","left":"0","width":"1080px","height":"1350px","objectFit":"cover"}}},
   {"type":"div","props":{"style":{"position":"absolute","top":"0","left":"0","width":"1080px","height":"1350px","backgroundImage":"linear-gradient(180deg, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.75) 100%)"}}},
   {"type":"div","props":{"style":{"position":"absolute","left":"64px","right":"64px","bottom":"88px","display":"flex","flexDirection":"column","gap":"14px"},"children":[
     {"type":"div","props":{"style":{"fontSize":"48px","opacity":0.9},"children":"Thank you"}},
     {"type":"div","props":{"style":{"fontSize":"120px","fontWeight":700,"lineHeight":1},"children":"{{city}}"}},
     {"type":"div","props":{"style":{"marginTop":"28px","display":"flex","alignItems":"center","gap":"20px"},"children":[
       {"type":"img","props":{"src":"{{brand.logo}}","style":{"width":"96px","height":"96px","objectFit":"contain"}}},
       {"type":"div","props":{"style":{"fontSize":"30px","opacity":0.85},"children":"{{brand.signature}}"}}
     ]}}
   ]}}
 ]}}$j$::jsonb),
(null, 'mix_feed', 'New mix', 'mix', 'instagram', 'feed_4x5', array['title','subtitle','photo'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","alignItems":"center","width":"1080px","height":"1350px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","padding":"80px"},"children":[
   {"type":"div","props":{"style":{"display":"flex","width":"100%","alignItems":"center","justifyContent":"space-between"},"children":[
     {"type":"div","props":{"style":{"fontSize":"34px","letterSpacing":"6px","textTransform":"uppercase","opacity":0.85},"children":"New mix"}},
     {"type":"img","props":{"src":"{{brand.logo}}","style":{"width":"110px","height":"110px","objectFit":"contain"}}}
   ]}},
   {"type":"img","props":{"src":"{{photo}}","style":{"marginTop":"56px","width":"920px","height":"760px","objectFit":"cover","borderRadius":"24px"}}},
   {"type":"div","props":{"style":{"marginTop":"56px","width":"100%","fontSize":"76px","fontWeight":700,"lineHeight":1.05},"children":"{{title}}"}},
   {"type":"div","props":{"style":{"marginTop":"16px","width":"100%","fontSize":"36px","opacity":0.85},"children":"{{subtitle}}"}}
 ]}}$j$::jsonb),
(null, 'plain_feed', 'Plain', 'plain', 'instagram', 'feed_4x5', array['text'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","justifyContent":"space-between","width":"1080px","height":"1350px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","padding":"96px"},"children":[
   {"type":"img","props":{"src":"{{brand.logo}}","style":{"width":"180px","height":"180px","objectFit":"contain"}}},
   {"type":"div","props":{"style":{"fontSize":"88px","fontWeight":700,"lineHeight":1.08},"children":"{{text}}"}},
   {"type":"div","props":{"style":{"fontSize":"30px","opacity":0.8},"children":"{{brand.signature}}"}}
 ]}}$j$::jsonb),
(null, 'plain_story', 'Plain (story)', 'plain', 'instagram', 'story_9x16', array['text'],
 $j${"type":"div","props":{"style":{"display":"flex","flexDirection":"column","justifyContent":"space-between","width":"1080px","height":"1920px","backgroundColor":"{{brand.primary}}","color":"{{brand.secondary}}","fontFamily":"{{brand.font}}","padding":"120px 96px 260px 96px"},"children":[
   {"type":"img","props":{"src":"{{brand.logo}}","style":{"width":"200px","height":"200px","objectFit":"contain"}}},
   {"type":"div","props":{"style":{"fontSize":"96px","fontWeight":700,"lineHeight":1.08},"children":"{{text}}"}},
   {"type":"div","props":{"style":{"fontSize":"32px","opacity":0.8},"children":"{{brand.signature}}"}}
 ]}}$j$::jsonb)
on conflict do nothing;
alter table public.social_templates enable trigger social_templates_guard;

-- ---------------------------------------------------------------------------
-- 11. Grants
-- ---------------------------------------------------------------------------
revoke execute on function app.social_forget_token() from public;
revoke execute on function app.social_template_guard() from public;
revoke execute on function app.social_post_guard() from public;
revoke execute on function app.social_gate(boolean) from public;
revoke execute on function app.social_gate_open() from public;
grant execute on function app.social_gate_open() to authenticated, service_role;
revoke execute on function app.social_count_hashtags(text) from public;
revoke execute on function app.social_count_mentions(text) from public;
grant execute on function app.social_count_hashtags(text), app.social_count_mentions(text) to authenticated, service_role;

revoke execute on function public.social_connect(uuid, uuid, uuid, text, text, text, text, text, text, text[], text, timestamptz) from public, anon, authenticated;
revoke execute on function public.social_token(uuid) from public, anon, authenticated;
revoke execute on function public.social_store_token(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.social_claim_render(int) from public, anon, authenticated;
revoke execute on function public.social_claim_due(timestamptz, int) from public, anon, authenticated;
revoke execute on function public.social_hold(uuid, text) from public, anon, authenticated;
grant execute on function public.social_connect(uuid, uuid, uuid, text, text, text, text, text, text, text[], text, timestamptz) to service_role;
grant execute on function public.social_token(uuid) to service_role;
grant execute on function public.social_store_token(uuid, text, timestamptz) to service_role;
grant execute on function public.social_claim_render(int) to service_role;
grant execute on function public.social_claim_due(timestamptz, int) to service_role;
grant execute on function public.social_hold(uuid, text) to service_role;

revoke execute on function public.social_disconnect(uuid) from public, anon;
revoke execute on function public.social_post_issues(uuid, boolean) from public, anon;
revoke execute on function public.social_approve_post(uuid, boolean) from public, anon;
revoke execute on function public.social_approve_plan(uuid, boolean) from public, anon;
revoke execute on function public.social_cancel_post(uuid) from public, anon;
revoke execute on function public.social_retry_post(uuid) from public, anon;
revoke execute on function public.admin_social_overview() from public, anon;
grant execute on function public.social_disconnect(uuid) to authenticated, service_role;
grant execute on function public.social_post_issues(uuid, boolean) to authenticated, service_role;
grant execute on function public.social_approve_post(uuid, boolean) to authenticated, service_role;
grant execute on function public.social_approve_plan(uuid, boolean) to authenticated, service_role;
grant execute on function public.social_cancel_post(uuid) to authenticated, service_role;
grant execute on function public.social_retry_post(uuid) to authenticated, service_role;
grant execute on function public.admin_social_overview() to authenticated, service_role;
