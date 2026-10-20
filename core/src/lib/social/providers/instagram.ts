import "server-only";

import {
  ProviderError,
  type ContainerStatus, type FrozenPost, type Issue, type PostDraft, type ProviderLimits, type SocialProvider,
} from "../types";

/**
 * Instagram API with Instagram Login (docs/SOCIAL-MANAGER.md §3, §9): no Facebook
 * Page, Business or Creator account, graph.instagram.com. The app id and secret
 * are the "Instagram App ID" / "Instagram app secret" of the Business login
 * settings (not the Meta app's own id), server-only env INSTAGRAM_APP_ID /
 * INSTAGRAM_APP_SECRET.
 *
 * The flow (§3): POST /me/media creates a container → poll status_code →
 * POST /me/media_publish at the slot → POST /{media}/comments for the first
 * comment. Images: JPEG from a public URL. Stories: media_type=STORIES, no
 * caption. Video: media_type=REELS. Tokens: 60 days, refreshed after 24 h.
 */
const AUTHORIZE = "https://www.instagram.com/oauth/authorize";
const TOKEN = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";

/**
 * What the connect flow asks for: exactly the permissions on the Meta app
 * (18 Oct 2026: basic, content publish and manage comments, all "Ready for
 * testing"; insights come later). A connection made before the comments
 * permission existed carries only the first two in `scopes`, so the worker
 * posts the first comment only when the connection's scopes include it,
 * and says so on the post otherwise: reconnecting grants it.
 */
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_comments"] as const;
export const COMMENT_SCOPE = "instagram_business_manage_comments";

const HASHTAG = /(^|\s)#[^\s#]+/g;
const MENTION = /(^|\s)@[^\s@]+/g;
const count = (s: string | null | undefined, re: RegExp) => (s ?? "").match(re)?.length ?? 0;

function creds() {
  const id = process.env.INSTAGRAM_APP_ID;
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!id || !secret) throw new Error("INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET are not set (server only).");
  return { id, secret };
}

type MetaError = { error?: { message?: string; type?: string; code?: number; error_subcode?: number; is_transient?: boolean; error_user_msg?: string } };

/** One call to Meta; a non-2xx answer or an {error} body becomes a ProviderError. */
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store" });
  } catch (e) {
    throw new ProviderError(e instanceof Error ? e.message : "network error", { transient: true });
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  const err = (body as MetaError | null)?.error;
  if (!res.ok || err) {
    const code = err?.code ?? null;
    const transient = Boolean(err?.is_transient) || res.status >= 500 || code === 1 || code === 2 || code === 4 || code === 17 || code === 341;
    throw new ProviderError(err?.error_user_msg ?? err?.message ?? `Instagram answered ${res.status}`, {
      code, subcode: err?.error_subcode ?? null, transient, status: res.status, body,
    });
  }
  return body as T;
}

const form = (fields: Record<string, string>) => {
  const b = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) b.set(k, v);
  return b;
};

export const instagram: SocialProvider = {
  key: "instagram",

  authUrl(state, redirectUri) {
    const u = new URL(AUTHORIZE);
    u.searchParams.set("client_id", creds().id);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
    u.searchParams.set("enable_fb_login", "false");
    u.searchParams.set("force_reauth", "true");
    u.searchParams.set("state", state);
    return u.toString();
  },

  async exchangeCode(rawCode, redirectUri) {
    const { id, secret } = creds();
    const code = rawCode.replace(/#_$/, ""); // Instagram appends "#_" to the code
    const short = await call<{ access_token: string; user_id?: string | number; permissions?: string[] | string }>(TOKEN, {
      method: "POST",
      body: form({ client_id: id, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
    });
    const long = await call<{ access_token: string; expires_in: number }>(
      `${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(secret)}&access_token=${encodeURIComponent(short.access_token)}`,
    );
    const profile = await instagram.profile(long.access_token);
    const granted = Array.isArray(short.permissions) ? short.permissions : typeof short.permissions === "string" ? short.permissions.split(",") : [];
    return {
      token: long.access_token,
      expiresAt: new Date(Date.now() + (long.expires_in ?? 60 * 86400) * 1000),
      profile: { ...profile, scopes: granted.length ? granted : profile.scopes },
    };
  },

  async refresh(token) {
    const r = await call<{ access_token: string; expires_in: number }>(
      `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`,
    );
    return { token: r.access_token, expiresAt: new Date(Date.now() + (r.expires_in ?? 60 * 86400) * 1000) };
  },

  async profile(token) {
    const me = await call<{ id?: string; user_id?: string | number; username?: string; name?: string; profile_picture_url?: string; account_type?: string }>(
      `${GRAPH}/me?fields=user_id,username,name,profile_picture_url,account_type&access_token=${encodeURIComponent(token)}`,
    );
    const externalId = String(me.user_id ?? me.id ?? "");
    if (!externalId) throw new ProviderError("Instagram returned no account id", { body: me });
    return {
      externalId,
      handle: me.username ?? null,
      displayName: me.name ?? null,
      avatarUrl: me.profile_picture_url ?? null,
      accountType: me.account_type ? me.account_type.toLowerCase().replace("media_creator", "creator") : null,
      scopes: [],
    };
  },

  limits(): ProviderLimits {
    return { captionMax: 2200, hashtagsMax: 30, mentionsMax: 20, collaboratorsMax: 3, userTagsMax: 20, altTextMax: 1000, formats: ["feed_4x5", "square", "story_9x16", "reel_9x16"], storyCaption: false };
  },

  validate(post: PostDraft): Issue[] {
    const L = instagram.limits();
    const out: Issue[] = [];
    if (post.caption.length > L.captionMax) out.push({ field: "caption", message: `Over ${L.captionMax} characters.` });
    if (count(post.caption, HASHTAG) + count(post.firstComment, HASHTAG) > L.hashtagsMax) out.push({ field: "firstComment", message: `More than ${L.hashtagsMax} hashtags in total.` });
    if (count(post.caption, MENTION) > L.mentionsMax) out.push({ field: "caption", message: `More than ${L.mentionsMax} @mentions.` });
    if (post.altText && post.altText.length > L.altTextMax) out.push({ field: "altText", message: `Over ${L.altTextMax} characters.` });
    if (post.collaborators.length > L.collaboratorsMax) out.push({ field: "collaborators", message: `At most ${L.collaboratorsMax} collaborators.` });
    if (post.format === "story_9x16" && post.caption) out.push({ field: "caption", message: "A story has no caption." });
    if (post.format === "story_9x16" && post.collaborators.length) out.push({ field: "collaborators", message: "Stories take no collaborators." });
    if (post.userTags.length > L.userTagsMax) out.push({ field: "userTags", message: `At most ${L.userTagsMax} people tagged.` });
    if (!L.formats.includes(post.format)) out.push({ field: "format", message: "Not a format Instagram takes here." });
    if (post.format === "reel_9x16" && post.kind !== "video") out.push({ field: "media", message: "A reel needs a video." });
    if (post.kind === "video" && !["reel_9x16", "story_9x16"].includes(post.format)) out.push({ field: "format", message: "A video goes out as a reel or a story." });
    return out;
  },

  async createContainer(acct, post: FrozenPost) {
    // media[0] is the post itself; a reel may carry its cover as a second, image item
    const first = post.media.find((m) => m.kind === (post.kind === "video" ? "video" : "image")) ?? post.media[0];
    if (!first) throw new ProviderError("The post has no media.", {});
    const cover = post.kind === "video" ? post.media.find((m) => m.kind === "image") : undefined;
    const fields: Record<string, string> = { access_token: acct.token };
    if (post.format === "story_9x16") {
      fields.media_type = "STORIES";
      fields[post.kind === "video" ? "video_url" : "image_url"] = first.url;
    } else if (post.kind === "video") {
      fields.media_type = "REELS";
      fields.video_url = first.url;
      fields.share_to_feed = "true";
      if (cover) fields.cover_url = cover.url;
      if (post.caption) fields.caption = post.caption;
    } else {
      fields.image_url = first.url;
      if (post.caption) fields.caption = post.caption;
      if (post.altText) fields.alt_text = post.altText;
    }
    if (post.collaborators.length && post.format !== "story_9x16") fields.collaborators = JSON.stringify(post.collaborators);
    // user_tags (034): an image needs a position (the editor's tap, or a default under the middle);
    // a story takes one if it has it; a reel takes the names only
    if (post.userTags.length) {
      const image = post.kind === "image" && post.format !== "story_9x16";
      fields.user_tags = JSON.stringify(post.userTags.map((u, i) =>
        post.kind === "video" && post.format === "reel_9x16" ? { username: u.username }
          : u.x != null && u.y != null ? { username: u.username, x: u.x, y: u.y }
          : image ? { username: u.username, x: 0.5, y: Math.min(0.95, 0.6 + i * 0.07) } : { username: u.username }));
    }
    const r = await call<{ id: string }>(`${GRAPH}/me/media`, { method: "POST", body: form(fields) });
    return { containerId: r.id };
  },

  async containerStatus(acct, id) {
    const r = await call<{ status_code?: ContainerStatus; status?: string }>(
      `${GRAPH}/${encodeURIComponent(id)}?fields=status_code,status&access_token=${encodeURIComponent(acct.token)}`,
    );
    return { status: r.status_code ?? "IN_PROGRESS", detail: r.status ?? null };
  },

  async publish(acct, containerId) {
    const r = await call<{ id: string }>(`${GRAPH}/me/media_publish`, { method: "POST", body: form({ creation_id: containerId, access_token: acct.token }) });
    let permalink: string | null = null;
    try {
      const m = await call<{ permalink?: string }>(`${GRAPH}/${encodeURIComponent(r.id)}?fields=permalink&access_token=${encodeURIComponent(acct.token)}`);
      permalink = m.permalink ?? null;
    } catch { /* the post is out; the link is a nicety */ }
    return { externalId: r.id, permalink };
  },

  async comment(acct, externalId, text) {
    await call<{ id: string }>(`${GRAPH}/${encodeURIComponent(externalId)}/comments`, { method: "POST", body: form({ message: text, access_token: acct.token }) });
  },

  async insights(acct, externalId) {
    const r = await call<{ data?: Array<{ name: string; values?: Array<{ value: number }> }> }>(
      `${GRAPH}/${encodeURIComponent(externalId)}/insights?metric=reach,views,likes,comments,saved,shares,total_interactions&access_token=${encodeURIComponent(acct.token)}`,
    );
    const out: Record<string, number> = {};
    for (const m of r.data ?? []) out[m.name] = m.values?.[0]?.value ?? 0;
    return out;
  },

  async remainingQuota(acct) {
    const r = await call<{ data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }> }>(
      `${GRAPH}/me/content_publishing_limit?fields=quota_usage,config&access_token=${encodeURIComponent(acct.token)}`,
    );
    const row = r.data?.[0];
    const total = row?.config?.quota_total ?? 100;
    return Math.max(0, total - (row?.quota_usage ?? 0));
  },
};
