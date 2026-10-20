-- 033_social_templates_actor — platform core (docs/SOCIAL-MANAGER.md S4, S8;
-- founder decision 7: every name configures its own socials). Written in
-- artist-platform on 18 Oct 2026; a verbatim copy is
-- core/supabase/migrations/core_033_social_templates_actor.sql.
--
-- An account's own template can belong to one actor (here an artist name):
-- DjHouseman's layouts are not DjTranceman's. actor_id null = every actor of
-- the account; system rows (account_id null) never carry an actor. The compose
-- screen lists system rows, the account's actor-less rows and the current
-- actor's rows, own rows first (core/src/lib/social/db.ts loadTemplates).
-- Access does not change: RLS stays keyed on account_id (the actor is a
-- column inside the tenant's rows, as on social_brand_kits), and the guard
-- trigger still decides who may write a row.
alter table public.social_templates
  add column actor_id uuid,
  add constraint social_templates_actor_system_check check (account_id is not null or actor_id is null);
comment on column public.social_templates.actor_id is 'The actor (opaque, product-defined) this own template belongs to; null = every actor of the account. Always null on system rows.';
create index social_templates_actor_idx on public.social_templates (account_id, actor_id) where account_id is not null;
