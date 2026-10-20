-- 031_core_social_brand_confirmed — platform core (docs/PLATFORM-CORE.md §8). Written in
-- artist-platform on 20 Oct 2026; a verbatim copy is
-- core/supabase/migrations/core_031_social_brand_confirmed.sql. It names no vertical table.
--
-- What it is: the brand kit becomes a step of the product's guide ("set up your
-- brand kit": logo, colours, font, signature). A kit row is created the first
-- time Social needs it, pre-filled from the actor, so a row alone does not say
-- the person has looked at it. confirmed_at is set when the person saves the
-- kit on /app/social/brand; the product's readiness checklist reads it.
-- No new table, no policy change: social_brand_kits keeps its member policy (027).

alter table public.social_brand_kits
  add column if not exists confirmed_at timestamptz;
comment on column public.social_brand_kits.confirmed_at is
  'Set when the person saved the kit themselves (Brand kit page); null while it is only the pre-fill from the actor.';
