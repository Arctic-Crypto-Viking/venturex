import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialActor } from "@core/product";
import type { Health, MediaItem, PostFormat, PostKind, PostStatus, ProviderKey, UserTag } from "./types";

/** Social Manager (core): the rows as the screens and the worker read them. */
export type Connection = {
  id: string; account_id: string; actor_id: string | null; provider: ProviderKey; external_id: string;
  handle: string | null; display_name: string | null; avatar_url: string | null; account_type: string | null;
  scopes: string[]; token_expires_at: string | null; token_refreshed_at: string | null; health: Health;
  health_note: string | null; last_checked_at: string | null; daily_cap: number; slots: unknown;
  connected_at: string; disconnected_at: string | null;
};
export const CONNECTION_COLUMNS =
  "id, account_id, actor_id, provider, external_id, handle, display_name, avatar_url, account_type, scopes, token_expires_at, token_refreshed_at, health, health_note, last_checked_at, daily_cap, slots, connected_at, disconnected_at";

export type BrandKit = {
  id: string; account_id: string; actor_id: string | null; name: string | null; logo_url: string | null; logo_dark_url: string | null;
  primary_color: string; secondary_color: string; font_key: FontKey; signature: string | null; handle: string | null;
  hashtag_sets: Record<string, string[]>; language: string;
  /** set when the person saved the kit themselves (031); null while it is only the pre-fill */
  confirmed_at: string | null;
};
export type FontKey = "ibm_plex_sans" | "archivo" | "dm_sans" | "fraunces" | "source_sans_3" | "manrope";
export const FONT_KEYS: FontKey[] = ["ibm_plex_sans", "archivo", "dm_sans", "fraunces", "source_sans_3", "manrope"];

export type Template = {
  id: string; account_id: string | null; actor_id: string | null; key: string; name: string; family: string; platform: ProviderKey; format: PostFormat;
  layout: unknown; slots: string[]; preview_url: string | null; version: number; is_active: boolean;
};
export const TEMPLATE_LIST_COLUMNS = "id, account_id, actor_id, key, name, family, platform, format, slots, preview_url, version, is_active";

/**
 * The templates one actor may compose with (031): system rows, the account's
 * actor-less rows and this actor's own rows, the actor's first, then the
 * account's, then the system's, each by family. The layout is not loaded here.
 */
export async function loadTemplates(supabase: SupabaseClient, accountId: string, actorId: string | null): Promise<Omit<Template, "layout">[]> {
  const own = actorId ? `or(actor_id.is.null,actor_id.eq.${actorId})` : "actor_id.is.null";
  const { data } = await supabase.from("social_templates").select(TEMPLATE_LIST_COLUMNS)
    .eq("is_active", true)
    .or(`account_id.is.null,and(account_id.eq.${accountId},${own})`)
    .order("actor_id", { ascending: false, nullsFirst: false })
    .order("account_id", { ascending: false, nullsFirst: false })
    .order("family");
  return (data ?? []) as Omit<Template, "layout">[];
}

export type Post = {
  id: string; account_id: string; actor_id: string | null; plan_id: string | null; social_account_id: string; template_id: string | null;
  format: PostFormat; kind: PostKind; slots: Record<string, string>; media: MediaItem[]; caption: string; first_comment: string | null;
  alt_text: string | null; collaborators: string[]; user_tags: UserTag[]; link: string | null; scheduled_for: string; status: PostStatus; held_reason: string | null;
  container_id: string | null; container_created_at: string | null; external_post_id: string | null; permalink: string | null;
  published_at: string | null; error: string | null; attempts: number; frozen_at: string | null; created_at: string;
};
export const POST_COLUMNS =
  "id, account_id, actor_id, plan_id, social_account_id, template_id, format, kind, slots, media, caption, first_comment, alt_text, collaborators, user_tags, link, scheduled_for, status, held_reason, container_id, container_created_at, external_post_id, permalink, published_at, error, attempts, frozen_at, created_at";

/** Active connections of one actor (RLS scopes to the caller's memberships). */
export async function loadConnections(supabase: SupabaseClient, accountId: string, actorId: string | null): Promise<Connection[]> {
  let q = supabase.from("social_connections").select(CONNECTION_COLUMNS).eq("account_id", accountId).is("disconnected_at", null).order("connected_at");
  q = actorId ? q.eq("actor_id", actorId) : q.is("actor_id", null);
  const { data } = await q;
  return (data ?? []) as Connection[];
}

/** The actor's brand kit, made from the product's actor the first time (S8, founder decision 4: colour from the logo). */
export async function ensureBrandKit(supabase: SupabaseClient, accountId: string, actor: SocialActor, pickColour: (logoUrl: string) => Promise<string | null>): Promise<BrandKit> {
  const existing = await supabase.from("social_brand_kits").select("*").eq("account_id", accountId).eq("actor_id", actor.id).maybeSingle();
  if (existing.data) return existing.data as BrandKit;
  const handle = handleFromLinks(actor.links);
  const primary = (actor.logoUrl && (await pickColour(actor.logoUrl).catch(() => null))) ?? "#111111";
  const row = {
    account_id: accountId,
    actor_id: actor.id,
    name: actor.name,
    logo_url: actor.logoUrl,
    primary_color: primary,
    secondary_color: readableOn(primary),
    font_key: "dm_sans",
    signature: [actor.name, actor.tags.slice(0, 3).join(" / ")].filter(Boolean).join(" · ").slice(0, 120),
    handle,
    hashtag_sets: { default: actor.tags.slice(0, 8).map((t) => `#${t.replace(/[^a-z0-9]/gi, "").toLowerCase()}`).filter((t) => t.length > 1) },
    language: actor.language && /^[a-z]{2,3}$/.test(actor.language) ? actor.language : "en",
  };
  const { data, error } = await supabase.from("social_brand_kits").insert(row).select("*").single();
  if (error) {
    // a second request made it first
    const again = await supabase.from("social_brand_kits").select("*").eq("account_id", accountId).eq("actor_id", actor.id).maybeSingle();
    if (again.data) return again.data as BrandKit;
    throw new Error(error.message);
  }
  return data as BrandKit;
}

export function handleFromLinks(links: Record<string, string>): string | null {
  const ig = links.instagram;
  if (!ig) return null;
  const m = ig.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  return m ? `@${m[1]}` : ig.startsWith("@") ? ig : null;
}

/** Black or white, whichever reads on the colour (WCAG relative luminance). */
export function readableOn(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "#ffffff";
  const lin = (c: string) => { const v = parseInt(c, 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  return L > 0.4 ? "#111111" : "#ffffff";
}

export const FORMAT_SIZE: Record<PostFormat, { width: number; height: number }> = {
  feed_4x5: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  story_9x16: { width: 1080, height: 1920 },
  reel_9x16: { width: 1080, height: 1920 },
  reel_cover: { width: 1080, height: 1920 },
  carousel_page: { width: 1080, height: 1350 },
};
