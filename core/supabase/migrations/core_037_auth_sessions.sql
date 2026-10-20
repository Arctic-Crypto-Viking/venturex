-- 037_core_auth_sessions — platform core (docs/PLATFORM-CORE.md §8). Written in
-- artist-platform on 20 Oct 2026; a verbatim copy is
-- core/supabase/migrations/core_037_auth_sessions.sql. It names no vertical table.
--
-- What it is: "Signed-in devices" on the Account page. A person sees where they
-- are signed in (device, last active, IP address) and can end one of those
-- sign-ins. "Sign out of all other devices" needs nothing here: the server
-- action calls Supabase Auth's own logout with scope "others".
--
-- Supabase Auth (GoTrue) keeps one row per sign-in in auth.sessions; the API
-- roles have no grant on the auth schema, so these two functions are the only
-- way in, and both are keyed on auth.uid(): a person reads and ends their own
-- sessions, nobody else's — superadmins included (no admin path on purpose).
--
-- Ending a session deletes its auth.sessions row; GoTrue's foreign key takes
-- the session's refresh tokens with it, so that device cannot refresh again.
-- Its current access token stays valid until it expires (the JWT expiry,
-- one hour by default): the device is signed out at its next refresh.
--
-- The current session is the token's session_id claim. end_my_session refuses
-- it: signing out here is the Sign out button, which also clears this
-- browser's cookies.

-- ---------------------------------------------------------------------------
-- 1. The caller's own sessions, newest activity first
-- ---------------------------------------------------------------------------
create or replace function public.my_sessions()
returns table (
  id             uuid,
  created_at     timestamptz,
  last_active_at timestamptz,
  user_agent     text,
  ip             text,
  not_after      timestamptz,
  is_current     boolean
)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id,
         s.created_at,
         -- refreshed_at is a UTC timestamp without time zone in GoTrue
         greatest(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at),
         s.user_agent,
         host(s.ip),
         s.not_after,
         s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    from auth.sessions s
   where auth.uid() is not null
     and s.user_id = auth.uid()
     and (s.not_after is null or s.not_after > now())
   order by 3 desc nulls last, s.created_at desc
$$;
comment on function public.my_sessions() is
  'The caller''s own Supabase Auth sessions (device, last active, IP). Own rows only; is_current from the JWT session_id.';

-- ---------------------------------------------------------------------------
-- 2. End one of the caller's own sessions (never the current one)
-- ---------------------------------------------------------------------------
create or replace function public.end_my_session(p_session uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_session = nullif(auth.jwt() ->> 'session_id', '')::uuid then
    raise exception 'this is the current session: use Sign out' using errcode = '22023';
  end if;
  delete from auth.sessions where id = p_session and user_id = auth.uid();
  -- another person's session and one that does not exist look the same
  if not found then
    raise exception 'no such session' using errcode = 'P0002';
  end if;
end $$;
comment on function public.end_my_session(uuid) is
  'Ends one of the caller''s own sessions (its refresh tokens go with it). Refuses another person''s and the current one.';

-- ---------------------------------------------------------------------------
-- 3. Grants: signed-in people only
-- ---------------------------------------------------------------------------
revoke all on function public.my_sessions() from public, anon;
revoke all on function public.end_my_session(uuid) from public, anon;
grant execute on function public.my_sessions() to authenticated;
grant execute on function public.end_my_session(uuid) to authenticated;
