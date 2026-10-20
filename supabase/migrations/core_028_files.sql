-- 028_core_files — platform core (docs/FILES.md).
-- Written in artist-platform on 18 Oct 2026; a verbatim copy is
-- core/supabase/migrations/core_028_files.sql. It names no vertical table: the
-- "actor" is the same opaque uuid Social Manager uses (027), and nothing here
-- knows what a product calls it.
--
-- What it is: the Library — one place per account for the photos and videos a
-- product works from (Social Manager first: a month of posts needs material).
-- Three kinds of source: `upload` (the account's own folder in the private
-- bucket `library`), `dropbox` (chosen folders, synced by cursor), and
-- `google_drive` (files the person picks in Google's Picker; the non-restricted
-- scope reaches nothing else, see docs/FILES.md F3). The files themselves stay
-- where they are until a post uses one; the Library holds metadata, a cached
-- thumbnail and how often each file was used.
--
-- Rules enforced here, not in the UI:
--   * RLS on every table with account_id, keyed on app.is_member().
--   * Provider tokens live in Supabase Vault; file_sources carries only their ids
--     and `authenticated` has no column grant on them. Members read the view
--     file_connections; only the service role (the worker, the OAuth callback)
--     reads a token, through files_tokens().
--   * A member inserts items only into the account's `upload` source; items of a
--     synced source are the worker's. The plan's files.items_max is checked on
--     every insert, whoever writes.
--   * Nothing is public: the bucket is private, thumbnails are read with signed
--     URLs; only what a post uses is copied into the public `social` bucket, at
--     the moment it is used.

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists supabase_vault;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Sources: where files come from
-- ---------------------------------------------------------------------------
create table public.file_sources (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references public.accounts (id) on delete cascade,
  actor_id            uuid,                                   -- null = shared by every actor of the account
  provider            text not null check (provider in ('upload','dropbox','google_drive')),
  external_id         text,                                   -- the provider's account id; null for upload
  label               text,                                   -- what the person sees: e-mail or name at the provider
  scopes              text[] not null default '{}',
  token_ref           uuid,                                   -- vault.secrets.id of the access token
  refresh_ref         uuid,                                   -- vault.secrets.id of the refresh token
  token_expires_at    timestamptz,
  health              text not null default 'ok' check (health in ('ok','expiring','reconnect','disconnected')),
  health_note         text,
  cursor              text,                                   -- the provider's change cursor (json for several roots)
  folders             jsonb not null default '[]'::jsonb,     -- chosen folders [{id, name, path}] (dropbox)
  sync_every_minutes  int not null default 30 check (sync_every_minutes between 5 and 1440),
  last_synced_at      timestamptz,
  sync_requested_at   timestamptz,
  syncing_at          timestamptz,                            -- the worker's claim
  last_error          text,
  connected_by        uuid references public.users (id) on delete set null,
  connected_at        timestamptz not null default now(),
  disconnected_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.file_sources is 'Library (core): where an account''s files come from — its own uploads, Dropbox folders, files picked from Google Drive. Tokens in Vault.';
create index file_sources_account_idx on public.file_sources (account_id, provider) where disconnected_at is null;
create unique index file_sources_upload_idx on public.file_sources (account_id) where provider = 'upload';
create unique index file_sources_live_idx on public.file_sources (account_id, provider, external_id) where disconnected_at is null and provider <> 'upload';
create trigger file_sources_set_updated_at before update on public.file_sources
  for each row execute function app.set_updated_at();

-- the secrets go with the row (account deletion, 020, cascades here)
create or replace function app.files_forget_tokens()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.token_ref is not null then delete from vault.secrets where id = old.token_ref; end if;
  if old.refresh_ref is not null then delete from vault.secrets where id = old.refresh_ref; end if;
  return old;
end $$;
create trigger file_sources_forget_tokens after delete on public.file_sources
  for each row execute function app.files_forget_tokens();

-- what members read: everything but the token references and the cursor
create view public.file_connections with (security_invoker = true) as
  select id, account_id, actor_id, provider, external_id, label, scopes, token_expires_at, health, health_note,
         folders, sync_every_minutes, last_synced_at, sync_requested_at, syncing_at, last_error,
         connected_by, connected_at, disconnected_at, created_at, updated_at
    from public.file_sources;
comment on view public.file_connections is 'Library (core): sources without the token references. RLS of file_sources applies (security_invoker).';

-- ---------------------------------------------------------------------------
-- 2. Folders and items
-- ---------------------------------------------------------------------------
create table public.file_folders (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  source_id    uuid not null references public.file_sources (id) on delete cascade,
  external_id  text not null,                                 -- the provider's folder id; for upload: a slug
  parent_id    uuid references public.file_folders (id) on delete set null,
  name         text not null check (char_length(name) between 1 and 200),
  path         text not null default '',                     -- "Photos/2026/Ibiza", for display and grouping
  item_count   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (source_id, external_id)
);
comment on table public.file_folders is 'Library (core): folders mirrored from a source, or made by the person under the upload source.';
create index file_folders_account_idx on public.file_folders (account_id, source_id);
create trigger file_folders_set_updated_at before update on public.file_folders
  for each row execute function app.set_updated_at();

create table public.file_items (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  actor_id     uuid,                                          -- null = shared
  source_id    uuid not null references public.file_sources (id) on delete cascade,
  folder_id    uuid references public.file_folders (id) on delete set null,
  external_id  text not null,                                 -- provider file id; for upload: the object path in `library`
  name         text not null check (char_length(name) between 1 and 300),
  path         text,                                          -- provider path (lower-cased for dropbox), for removals
  kind         text not null check (kind in ('image','video','other')),
  mime         text,
  bytes        bigint,
  width        int,                                           -- best known: the original's, else the thumbnail's
  height       int,
  duration_s   numeric,
  taken_at     timestamptz,
  modified_at  timestamptz,
  rev          text,
  thumb_path   text,                                          -- <account>/thumbs/<item>.jpg in `library`
  thumb_tries  int not null default 0,
  status       text not null default 'active' check (status in ('active','hidden','missing')),
  tags         text[] not null default '{}' check (cardinality(tags) <= 30),
  note         text check (note is null or char_length(note) <= 500),
  times_used   int not null default 0,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (source_id, external_id)
);
comment on table public.file_items is 'Library (core): one row per photo or video the account can use. Metadata and a thumbnail; the file stays at its source until used.';
create index file_items_browse_idx on public.file_items (account_id, status, kind, taken_at desc nulls last, created_at desc);
create index file_items_folder_idx on public.file_items (folder_id);
create index file_items_thumb_idx on public.file_items (status) where thumb_path is null and status = 'active';
create trigger file_items_set_updated_at before update on public.file_items
  for each row execute function app.set_updated_at();

-- A member writes only under the upload source and only the person's fields;
-- everyone, the worker included, stays under the plan's files.items_max.
create or replace function app.file_item_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_src public.file_sources; v_max int; n int;
begin
  if tg_op = 'INSERT' then
    select * into v_src from public.file_sources where id = new.source_id;
    if v_src.id is null or v_src.account_id <> new.account_id then
      raise exception 'The source does not belong to this account.' using errcode = 'P0001';
    end if;
    if not app.is_service() and v_src.provider <> 'upload' then
      raise exception 'Files of a synced source are added by the sync, not by hand.' using errcode = '42501';
    end if;
    v_max := coalesce((public.feature_value(new.account_id, 'files.items_max'))::text::int, 0);
    if v_max <> -1 then
      select count(*) into n from public.file_items where account_id = new.account_id and status <> 'missing';
      if n >= v_max then
        raise exception 'Your plan holds % files in the Library.', v_max using errcode = 'P0001';
      end if;
    end if;
    if new.thumb_path is not null and not app.is_service() then new.thumb_path := null; end if;
    return new;
  end if;
  -- UPDATE: a member changes the person's fields only (column grants limit the rest); status never to missing by hand
  -- (files_disconnect opens the gate for its own write, like the Social functions do with app.social_gate)
  if not (app.is_service() or coalesce(current_setting('app.files_gate', true), '') = '1') and new.status = 'missing' and old.status <> 'missing' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger file_items_guard before insert or update on public.file_items
  for each row execute function app.file_item_guard();

create or replace function app.file_folder_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_src public.file_sources;
begin
  if app.is_service() then return coalesce(new, old); end if;
  select * into v_src from public.file_sources where id = coalesce(new.source_id, old.source_id);
  if v_src.id is null or v_src.account_id <> coalesce(new.account_id, old.account_id) then
    raise exception 'The source does not belong to this account.' using errcode = 'P0001';
  end if;
  if v_src.provider <> 'upload' then
    raise exception 'Folders of a synced source follow the source.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger file_folders_guard before insert or update or delete on public.file_folders
  for each row execute function app.file_folder_guard();

-- Where a file went: a post, a page … (purpose + a reference the product understands)
create table public.file_uses (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  item_id     uuid not null references public.file_items (id) on delete cascade,
  purpose     text not null check (char_length(purpose) between 1 and 60),
  ref         uuid,
  used_by     uuid references public.users (id) on delete set null,
  used_at     timestamptz not null default now()
);
comment on table public.file_uses is 'Library (core): every time a file was picked for something (a social post …), so the planner prefers what has not been used.';
create index file_uses_item_idx on public.file_uses (item_id, used_at desc);
create index file_uses_account_idx on public.file_uses (account_id, used_at desc);

-- ---------------------------------------------------------------------------
-- 3. RLS and grants
-- ---------------------------------------------------------------------------
alter table public.file_sources enable row level security;
alter table public.file_folders enable row level security;
alter table public.file_items   enable row level security;
alter table public.file_uses    enable row level security;

create policy file_sources_member_read on public.file_sources for select to authenticated using (app.is_member(account_id));
create policy file_sources_member_update on public.file_sources for update to authenticated
  using (app.is_member(account_id)) with check (app.is_member(account_id));
-- insert: only through files_connect() (service) and files_upload_source(); delete: never by a member (disconnect keeps the row)
revoke all on public.file_sources from public, anon, authenticated;
grant select (id, account_id, actor_id, provider, external_id, label, scopes, token_expires_at, health, health_note,
              folders, sync_every_minutes, last_synced_at, sync_requested_at, syncing_at, last_error,
              connected_by, connected_at, disconnected_at, created_at, updated_at) on public.file_sources to authenticated;
grant update (actor_id, folders, sync_every_minutes, sync_requested_at) on public.file_sources to authenticated;
grant all on public.file_sources to service_role;
revoke all on public.file_connections from public, anon, authenticated;
grant select on public.file_connections to authenticated;
grant select on public.file_connections to service_role;

create policy file_folders_member on public.file_folders for all to authenticated
  using (app.is_member(account_id)) with check (app.is_member(account_id));
revoke all on public.file_folders from public, anon, authenticated;
grant select, insert, update, delete on public.file_folders to authenticated;
grant all on public.file_folders to service_role;

create policy file_items_member on public.file_items for all to authenticated
  using (app.is_member(account_id)) with check (app.is_member(account_id));
revoke all on public.file_items from public, anon, authenticated;
grant select, delete on public.file_items to authenticated;
grant insert (account_id, actor_id, source_id, folder_id, external_id, name, path, kind, mime, bytes, width, height,
              duration_s, taken_at, modified_at, tags, note) on public.file_items to authenticated;
grant update (actor_id, folder_id, status, tags, note) on public.file_items to authenticated;
grant all on public.file_items to service_role;

create policy file_uses_member_read on public.file_uses for select to authenticated using (app.is_member(account_id));
revoke all on public.file_uses from public, anon, authenticated;
grant select on public.file_uses to authenticated;
grant all on public.file_uses to service_role;

-- ---------------------------------------------------------------------------
-- 4. Storage: the PRIVATE bucket `library`.
--    <account id>/files/<item id>.<ext>   the account's own uploads (originals)
--    <account id>/thumbs/<item id>.jpg    cached thumbnails (written by the worker)
--    Members read their folder (signed URLs); nobody else does.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library', 'library', false, 314572800,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "library member read" on storage.objects;
create policy "library member read" on storage.objects for select
  to authenticated using (bucket_id = 'library' and app.is_member(app.path_account(name)));
drop policy if exists "library member insert" on storage.objects;
create policy "library member insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'library' and app.is_member(app.path_account(name)));
drop policy if exists "library member update" on storage.objects;
create policy "library member update" on storage.objects for update
  to authenticated using (bucket_id = 'library' and app.is_member(app.path_account(name)))
  with check (bucket_id = 'library' and app.is_member(app.path_account(name)));
drop policy if exists "library member delete" on storage.objects;
create policy "library member delete" on storage.objects for delete
  to authenticated using (bucket_id = 'library' and app.is_member(app.path_account(name)));

-- ---------------------------------------------------------------------------
-- 5. Connect, tokens, disconnect — Vault in, Vault out
-- ---------------------------------------------------------------------------
-- The OAuth callback (service role, after it verified the signed state and the
-- member's account): insert or renew the source, store both tokens.
create or replace function public.files_connect(
  p_account uuid, p_actor uuid, p_user uuid, p_provider text, p_external_id text, p_label text, p_scopes text[],
  p_token text, p_refresh text, p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.file_sources; v_id uuid; v_tok uuid; v_ref uuid; v_max int;
begin
  if not app.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_provider = 'upload' then raise exception 'upload is not a connected source' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.account_members m where m.account_id = p_account and m.user_id = p_user and m.status = 'active') then
    raise exception 'not a member of that account' using errcode = '42501';
  end if;
  select * into v from public.file_sources
   where account_id = p_account and provider = p_provider and external_id = p_external_id
   order by (disconnected_at is null) desc, connected_at desc limit 1 for update;
  if v.id is null or v.disconnected_at is not null then
    v_max := coalesce((public.feature_value(p_account, 'files.sources_max'))::text::int, 0);
    if v_max <> -1 and (select count(*) from public.file_sources where account_id = p_account and provider <> 'upload' and disconnected_at is null) >= v_max then
      raise exception 'Your plan allows % connected %.', v_max, case when v_max = 1 then 'source' else 'sources' end using errcode = 'P0001';
    end if;
  end if;
  if v.id is null then
    v_tok := vault.create_secret(p_token, 'files_' || gen_random_uuid()::text, 'Library access token');
    v_ref := case when p_refresh is null then null else vault.create_secret(p_refresh, 'files_' || gen_random_uuid()::text, 'Library refresh token') end;
    insert into public.file_sources (account_id, actor_id, provider, external_id, label, scopes, token_ref, refresh_ref, token_expires_at, health, connected_by)
    values (p_account, p_actor, p_provider, p_external_id, p_label, coalesce(p_scopes, '{}'), v_tok, v_ref, p_expires_at, 'ok', p_user)
    returning id into v_id;
  else
    if v.token_ref is null then v_tok := vault.create_secret(p_token, 'files_' || gen_random_uuid()::text, 'Library access token');
    else v_tok := v.token_ref; perform vault.update_secret(v_tok, p_token); end if;
    if p_refresh is not null then
      if v.refresh_ref is null then v_ref := vault.create_secret(p_refresh, 'files_' || gen_random_uuid()::text, 'Library refresh token');
      else v_ref := v.refresh_ref; perform vault.update_secret(v_ref, p_refresh); end if;
    else
      v_ref := v.refresh_ref;
    end if;
    update public.file_sources
       set actor_id = p_actor, label = p_label, scopes = coalesce(p_scopes, '{}'), token_ref = v_tok, refresh_ref = v_ref,
           token_expires_at = p_expires_at, health = 'ok', health_note = null, last_error = null, cursor = null,
           connected_by = p_user, connected_at = now(), disconnected_at = null, sync_requested_at = now()
     where id = v.id;
    v_id := v.id;
    update public.file_items set status = 'active' where source_id = v_id and status = 'missing';
  end if;
  insert into public.audit_log (actor_user_id, actor_role, account_id, action, entity_type, entity_id, after)
  values (p_user, 'authenticated', p_account, 'files_connect', 'file_sources', v_id::text,
          jsonb_build_object('provider', p_provider, 'label', p_label));
  return v_id;
end $$;

-- Both tokens: the worker and the OAuth code only.
create or replace function public.files_tokens(p_source uuid)
returns table (token text, refresh text) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v public.file_sources;
begin
  if not app.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into v from public.file_sources where id = p_source and disconnected_at is null;
  if v.id is null then return; end if;
  return query
    select (select decrypted_secret from vault.decrypted_secrets where id = v.token_ref),
           (select decrypted_secret from vault.decrypted_secrets where id = v.refresh_ref);
end $$;

-- After a refresh: the new access token and its expiry.
create or replace function public.files_store_token(p_source uuid, p_token text, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ref uuid;
begin
  if not app.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  select token_ref into v_ref from public.file_sources where id = p_source for update;
  if v_ref is null then
    v_ref := vault.create_secret(p_token, 'files_' || gen_random_uuid()::text, 'Library access token');
  else
    perform vault.update_secret(v_ref, p_token);
  end if;
  update public.file_sources
     set token_ref = v_ref, token_expires_at = p_expires_at, health = 'ok', health_note = null
   where id = p_source;
end $$;

-- The member disconnects: both secrets go, the items wait as `missing`, audited.
create or replace function public.files_disconnect(p_source uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.file_sources;
begin
  select * into v from public.file_sources where id = p_source for update;
  if v.id is null or not (app.is_member(v.account_id) or app.is_service()) then
    raise exception 'no such source' using errcode = 'P0002';
  end if;
  if v.provider = 'upload' then raise exception 'Your own uploads cannot be disconnected.' using errcode = 'P0001'; end if;
  if v.token_ref is not null then delete from vault.secrets where id = v.token_ref; end if;
  if v.refresh_ref is not null then delete from vault.secrets where id = v.refresh_ref; end if;
  update public.file_sources
     set token_ref = null, refresh_ref = null, token_expires_at = null, cursor = null, syncing_at = null,
         health = 'disconnected', health_note = null, disconnected_at = now()
   where id = p_source;
  perform set_config('app.files_gate', '1', true);
  update public.file_items set status = 'missing' where source_id = p_source and status <> 'missing';
  perform set_config('app.files_gate', '', true);
  insert into public.audit_log (actor_user_id, actor_role, account_id, action, entity_type, entity_id, before)
  values (auth.uid(), case when app.is_service() then 'service_role' else 'authenticated' end, v.account_id,
          'files_disconnect', 'file_sources', v.id::text, jsonb_build_object('provider', v.provider, 'label', v.label));
end $$;

-- The account's own upload source, made the first time it is needed (member).
create or replace function public.files_upload_source(p_account uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not (app.is_member(p_account) or app.is_service()) then raise exception 'not allowed' using errcode = '42501'; end if;
  select id into v_id from public.file_sources where account_id = p_account and provider = 'upload';
  if v_id is null then
    insert into public.file_sources (account_id, provider, label, health, connected_by)
    values (p_account, 'upload', null, 'ok', auth.uid())
    on conflict do nothing
    returning id into v_id;
    if v_id is null then select id into v_id from public.file_sources where account_id = p_account and provider = 'upload'; end if;
  end if;
  return v_id;
end $$;

-- A file was picked for something: counted, so the planner prefers the unused.
create or replace function public.files_mark_used(p_item uuid, p_purpose text, p_ref uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.file_items;
begin
  select * into v from public.file_items where id = p_item;
  if v.id is null or not (app.is_member(v.account_id) or app.is_service()) then
    raise exception 'no such file' using errcode = 'P0002';
  end if;
  insert into public.file_uses (account_id, item_id, purpose, ref, used_by) values (v.account_id, v.id, p_purpose, p_ref, auth.uid());
  update public.file_items set times_used = times_used + 1, last_used_at = now() where id = v.id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. The worker's claim: sources due for a sync (service only; the claim is the lock)
-- ---------------------------------------------------------------------------
create or replace function public.files_claim_sync(p_limit int default 5)
returns setof public.file_sources language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    with due as (
      select id from public.file_sources s
       where s.provider <> 'upload' and s.disconnected_at is null and s.health in ('ok','expiring')
         and (s.syncing_at is null or s.syncing_at < now() - interval '10 minutes')
         and (s.last_synced_at is null
              or s.last_synced_at < now() - make_interval(mins => s.sync_every_minutes)
              or (s.sync_requested_at is not null and s.sync_requested_at > s.last_synced_at))
       order by coalesce(s.sync_requested_at, s.last_synced_at, s.connected_at)
       limit p_limit
       for update skip locked)
    update public.file_sources s set syncing_at = now()
      from due where s.id = due.id
    returning s.*;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Entitlements (data). Module `files`; one more feature on `social`.
-- ---------------------------------------------------------------------------
insert into public.modules (key, name, description, sort_order, visibility) values
  ('files', 'Library', 'Photos and videos to work from: your own uploads, Dropbox folders, files picked from Google Drive', 82, 'public')
on conflict (key) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, visibility = excluded.visibility;

insert into public.features (module_id, key, name, description, kind, unit, default_value)
select m.id, f.key, f.name, f.description, f.kind, f.unit, f.default_value::jsonb
from (values
  ('files.sources_max', 'Connected sources', 'Dropbox or Google Drive connections per account; -1 = unlimited', 'limit', 'absolute', '1'),
  ('files.items_max',   'Files in the Library', 'Photos and videos the Library holds at once; -1 = unlimited', 'limit', 'absolute', '300')
) as f(key, name, description, kind, unit, default_value)
join public.modules m on m.key = 'files'
on conflict (key) do update set name = excluded.name, description = excluded.description, kind = excluded.kind, unit = excluded.unit, default_value = excluded.default_value;

insert into public.features (module_id, key, name, description, kind, unit, default_value)
select m.id, 'social.autoplan_max', 'Posts per planned month', 'Drafts "Fill a month" makes at once from the Library; -1 = unlimited', 'limit', 'absolute', '4'::jsonb
from public.modules m where m.key = 'social'
on conflict (key) do update set name = excluded.name, description = excluded.description, kind = excluded.kind, unit = excluded.unit, default_value = excluded.default_value;

insert into public.plan_features (plan_id, feature_id, value)
select p.id, f.id, v.value::jsonb
from (values
  -- feature                 free    founding  pro     crew
  ('files.sources_max',      '1',    '3',      '3',    '10'),
  ('files.items_max',        '300',  '5000',   '5000', '50000'),
  ('social.autoplan_max',    '4',    '31',     '31',   '93')
) as m(feature_key, free_v, founding_v, pro_v, crew_v)
cross join lateral (values ('free', m.free_v), ('founding', m.founding_v), ('pro', m.pro_v), ('crew', m.crew_v)) as v(plan_key, value)
join public.plans p on p.key = v.plan_key
join public.features f on f.key = m.feature_key
on conflict (plan_id, feature_id) do update set value = excluded.value;
