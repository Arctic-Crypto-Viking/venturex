-- 039_core_user_email_sync — platform core (docs/PLATFORM-CORE.md §8). Written in
-- artist-platform on 20 Oct 2026; a verbatim copy is
-- core/supabase/migrations/core_039_user_email_sync.sql. It names no vertical table.
--
-- What it is: public.users.email follows a login's e-mail when it changes.
-- 001 copies the address only when a login is created (on_auth_user_created), so
-- an address changed in Supabase Auth (the dashboard, the admin API, a person's
-- own confirmed change) left the old one in public.users: the app showed it, and
-- the founder-login checks (Invite a tester, admin_delete_account) compared
-- against it. Found on 20 Oct 2026, when the founder login moved to a new address
-- and public.users had to be updated by hand.
--
-- Supabase Auth writes auth.users as supabase_auth_admin. The guard on
-- public.users (001) lets only postgres, supabase_admin and service_role change
-- an e-mail, so the function is SECURITY DEFINER: it runs as its owner. It copies
-- the e-mail and nothing else; is_superadmin stays a database fact.
--
-- A login without an e-mail (phone sign-in, not used today) keeps the last one.
-- If public.users already holds the new address for another person, the unique
-- index refuses and Supabase Auth's change fails with it: two people never share
-- an address here, and the stale row has to be looked at first.

create or replace function app.handle_auth_user_email_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.users set email = new.email where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is not null and new.email is distinct from old.email)
  execute function app.handle_auth_user_email_change();

-- a trigger function is never called directly
revoke all on function app.handle_auth_user_email_change() from public;
