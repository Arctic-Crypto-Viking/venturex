-- 001_tenancy — accounts, users, members, impersonation, RLS helpers
-- Spec: docs/schema-wizard-entitlements-spec.md §1, §2.1
--
-- Conventions: snake_case, plural tables, uuid PKs, created_at/updated_at.
-- Every tenant table carries account_id and is protected by RLS keyed on
-- account membership (app.is_member). Superadmin never bypasses RLS from the
-- client: admin routes run as the service role behind app.is_superadmin().

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- A dependency-free transliteration for slugs (no unaccent extension needed).
create or replace function app.unaccent_lite(p text)
returns text language sql immutable as $$
  select translate(p,
    'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿÑñÇçÆæŒœßŠšŽž',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuYyyNnCcAaOosSsZz')
$$;

create or replace function app.slugify(p text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(app.unaccent_lite(p)), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function app.jsonb_text_array(p jsonb)
returns text[] language sql immutable as $$
  select case when p is null or jsonb_typeof(p) <> 'array' then null
         else array(select jsonb_array_elements_text(p)) end
$$;

-- ---------------------------------------------------------------------------
-- system_settings — key/value config read by server code and SQL helpers
-- (cooldowns, warm-up schedule, trial days, checklist templates …)
-- ---------------------------------------------------------------------------
create table public.system_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
alter table public.system_settings enable row level security;
-- no client access; helpers read it as security definer

-- ---------------------------------------------------------------------------
-- users — mirrors auth.users. Created by trigger on signup.
-- ---------------------------------------------------------------------------
create table public.users (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  display_name   text,
  avatar_url     text,
  is_superadmin  boolean not null default false,
  locale         text not null default 'en',
  timezone       text not null default 'Europe/Oslo',
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index users_email_lower_idx on public.users (lower(email));
create trigger users_set_updated_at before update on public.users
  for each row execute function app.set_updated_at();

-- is_superadmin can only be changed from SQL (migration / SQL editor), never by
-- an API role — including the service role.
create or replace function app.guard_superadmin_flag()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.is_superadmin is distinct from old.is_superadmin
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'users.is_superadmin may only be changed by migration or direct SQL';
  end if;
  if tg_op = 'UPDATE' and new.email is distinct from old.email
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'users.email is managed by auth';
  end if;
  return new;
end $$;
create trigger users_guard_superadmin before update on public.users
  for each row execute function app.guard_superadmin_flag();

-- Mirror new auth users into public.users
create or replace function app.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- accounts — the tenant
-- ---------------------------------------------------------------------------
create table public.accounts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text not null unique,
  owner_user_id  uuid not null references public.users (id),
  plan_id        uuid,                       -- fk added in 003
  access_status  text not null default 'active'
                 check (access_status in ('trialing','active','grace','past_due','cancelled','comped','suspended')),
  trial_ends_at  timestamptz,
  country        text,                       -- ISO-2
  currency       text not null default 'EUR',
  locale         text not null default 'en',
  is_internal    boolean not null default false,
  wizard_state   jsonb not null default '{}'::jsonb,
  admin_notes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index accounts_owner_idx on public.accounts (owner_user_id);
create trigger accounts_set_updated_at before update on public.accounts
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- account_members — who can open which account
-- ---------------------------------------------------------------------------
create table public.account_members (
  account_id     uuid not null references public.accounts (id) on delete cascade,
  user_id        uuid not null references public.users (id) on delete cascade,
  role           text not null default 'member' check (role in ('owner','admin','member','collaborator')),
  status         text not null default 'active' check (status in ('invited','active','suspended')),
  invited_email  text,
  invited_by     uuid references public.users (id),
  accepted_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index account_members_user_idx on public.account_members (user_id, status);
create trigger account_members_set_updated_at before update on public.account_members
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- impersonation_sessions — superadmin "view as"
-- ---------------------------------------------------------------------------
create table public.impersonation_sessions (
  id              uuid primary key default gen_random_uuid(),
  admin_user_id   uuid not null references public.users (id),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  reason          text,
  consent_source  text not null default 'internal' check (consent_source in ('owner_approval','internal','support_ticket')),
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);
create index impersonation_sessions_account_idx on public.impersonation_sessions (account_id, started_at desc);

-- ---------------------------------------------------------------------------
-- RLS helpers (security definer so they can read membership under RLS)
-- ---------------------------------------------------------------------------
create or replace function app.current_user_id()
returns uuid language sql stable as $$
  select auth.uid()
$$;

create or replace function app.is_superadmin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select u.is_superadmin from public.users u where u.id = auth.uid()), false)
$$;

-- True for the service role (API service key), pg_cron jobs and SQL run as the
-- database owner (migrations, SQL editor). Inside SECURITY DEFINER functions
-- current_user is the owner, so callers are judged by their JWT role claim and
-- by SET ROLE, never by current_user.
create or replace function app.is_service()
returns boolean language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role'
      or (auth.role() is null
          and coalesce(nullif(current_setting('role', true), ''), 'none') not in ('anon','authenticated')
          and session_user in ('postgres','supabase_admin'))
$$;

create or replace function app.is_member(p_account uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = p_account and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

create or replace function app.has_role(p_account uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = p_account and m.user_id = auth.uid() and m.status = 'active'
      and m.role = any (p_roles)
  )
$$;

create or replace function app.my_account_ids()
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $$
  select m.account_id from public.account_members m
  where m.user_id = auth.uid() and m.status = 'active'
$$;

grant execute on all functions in schema app to authenticated, service_role;
alter default privileges in schema app grant execute on functions to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.impersonation_sessions enable row level security;

-- users: see yourself and the members of your accounts; edit only yourself
create policy users_select_self on public.users for select to authenticated
  using (id = auth.uid()
         or id in (select m.user_id from public.account_members m
                   where m.account_id in (select app.my_account_ids())));
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- accounts: members read; owners/admins update; creation only through
-- public.create_account_with_identity (D3), deletion only by service role
create policy accounts_select_member on public.accounts for select to authenticated
  using (app.is_member(id));
create policy accounts_update_owner on public.accounts for update to authenticated
  using (app.has_role(id, array['owner','admin']))
  with check (app.has_role(id, array['owner','admin']));

-- account_members: members read; owners/admins manage
create policy members_select on public.account_members for select to authenticated
  using (app.is_member(account_id));
create policy members_insert on public.account_members for insert to authenticated
  with check (app.has_role(account_id, array['owner','admin']));
create policy members_update on public.account_members for update to authenticated
  using (app.has_role(account_id, array['owner','admin']))
  with check (app.has_role(account_id, array['owner','admin']));
create policy members_delete on public.account_members for delete to authenticated
  using (app.has_role(account_id, array['owner','admin']) or user_id = auth.uid());

-- impersonation_sessions: the account owner can see who viewed their account
create policy impersonation_select_owner on public.impersonation_sessions for select to authenticated
  using (app.has_role(account_id, array['owner']));

-- Protect the tenant-defining columns from member edits
create or replace function app.guard_account_columns()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    if new.is_internal is distinct from old.is_internal
       or new.access_status is distinct from old.access_status
       or new.plan_id is distinct from old.plan_id
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.admin_notes is distinct from old.admin_notes
       or new.owner_user_id is distinct from old.owner_user_id then
      raise exception 'account status, plan and ownership are managed by the server';
    end if;
  end if;
  return new;
end $$;
create trigger accounts_guard_columns before update on public.accounts
  for each row execute function app.guard_account_columns();
