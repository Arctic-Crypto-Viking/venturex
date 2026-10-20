/**
 * Social Manager (core): the shapes shared by the provider adapters, the worker
 * and the screens. docs/SOCIAL-MANAGER.md §4.3 is the contract; nothing above
 * the adapter knows which network a post went to.
 */
export type ProviderKey = "instagram" | "threads" | "facebook";
export type PostFormat = "feed_4x5" | "square" | "story_9x16" | "reel_9x16" | "reel_cover" | "carousel_page";
export type PostKind = "image" | "video";
export type PostStatus = "draft" | "approved" | "rendering" | "queued" | "publishing" | "published" | "failed" | "cancelled" | "held";
export type Health = "ok" | "expiring" | "reconnect" | "disconnected";

export type Profile = {
  externalId: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** business / creator / personal, as the provider says it. */
  accountType: string | null;
  scopes: string[];
};

/** A connected profile as the worker sees it: the row plus the token read from Vault. */
export type Connected = { id: string; externalId: string; token: string };

export type MediaItem = { url: string; kind: PostKind; width?: number; height?: number; bytes?: number };

/** A person tagged in the media (034): x and y from the top left, 0–1; a reel takes the name only. */
export type UserTag = { username: string; x?: number; y?: number };

/** What the worker hands a provider: the frozen content of one approved post. */
export type FrozenPost = {
  id: string;
  kind: PostKind;
  format: PostFormat;
  media: MediaItem[];
  caption: string;
  firstComment: string | null;
  altText: string | null;
  collaborators: string[];
  userTags: UserTag[];
};

export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";

export type ProviderLimits = {
  captionMax: number;
  hashtagsMax: number;
  mentionsMax: number;
  collaboratorsMax: number;
  userTagsMax: number;
  altTextMax: number;
  formats: PostFormat[];
  /** A story carries no caption. */
  storyCaption: boolean;
};

export type Issue = { field: "caption" | "firstComment" | "altText" | "media" | "collaborators" | "userTags" | "format"; message: string };

export type PostDraft = Pick<FrozenPost, "kind" | "format" | "media" | "caption" | "firstComment" | "altText" | "collaborators" | "userTags">;

/** Thrown by an adapter when the provider said no. `transient` = worth one retry. */
export class ProviderError extends Error {
  readonly code: number | null;
  readonly subcode: number | null;
  readonly transient: boolean;
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, opts: { code?: number | null; subcode?: number | null; transient?: boolean; status?: number; body?: unknown }) {
    super(message);
    this.name = "ProviderError";
    this.code = opts.code ?? null;
    this.subcode = opts.subcode ?? null;
    this.transient = opts.transient ?? false;
    this.status = opts.status ?? 0;
    this.body = opts.body;
  }
}

export interface SocialProvider {
  key: ProviderKey;
  /** The provider's consent dialog; `state` is our signed state (core/src/lib/social/state.ts). */
  authUrl(state: string, redirectUri: string): string;
  /** Code → short-lived → long-lived token, plus the profile. */
  exchangeCode(code: string, redirectUri: string): Promise<{ token: string; expiresAt: Date; profile: Profile }>;
  refresh(token: string): Promise<{ token: string; expiresAt: Date }>;
  /** The profile behind a token (health check, reconnect). */
  profile(token: string): Promise<Profile>;
  limits(): ProviderLimits;
  /** What approval shows the artist before the tap. The database re-checks (social_post_issues). */
  validate(post: PostDraft): Issue[];
  createContainer(acct: Connected, post: FrozenPost): Promise<{ containerId: string }>;
  containerStatus(acct: Connected, id: string): Promise<{ status: ContainerStatus; detail: string | null }>;
  publish(acct: Connected, containerId: string): Promise<{ externalId: string; permalink: string | null }>;
  comment?(acct: Connected, externalId: string, text: string): Promise<void>;
  insights?(acct: Connected, externalId: string): Promise<Record<string, number>>;
  /** How many API publishes are left in the rolling window. */
  remainingQuota(acct: Connected): Promise<number>;
}
