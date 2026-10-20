import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountDetail } from "./app/admin/accounts/[id]/detail";

/**
 * The product contract: everything platform core needs from the app it runs in.
 * Each product exports one `product` object from `src/product.tsx` (alias
 * `@product`); core reads it and never imports anything else from the product.
 * Keep this small: a new slot here is a change to every product.
 */
/**
 * Who the product is: the single source for its name, addresses and one-line
 * pitch. Every title, meta/OG tag, manifest, calendar feed and sign-in screen
 * reads it; nothing else spells the name. Core holds the shape, each product
 * the values (rule 7: no venture's name inside another venture).
 */
export type ProductBrand = {
  /** Product name as people see it, e.g. "Mainfloor". */
  name: string;
  /** Registered domain without scheme, e.g. "mainfloor.app". */
  domain: string;
  /** Canonical address of the signed-in app. For display and canonical tags; runtime links (sign-in, ICS) use `publicEnv.siteUrl`, the address this deployment actually runs on. */
  appUrl: string;
  /** Canonical address of the public site (landing page). Same caveat as `appUrl`. */
  siteUrl: string;
  /** One line under the name: page titles, OG. */
  tagline: string;
  /** One or two sentences for meta descriptions and the web app manifest. */
  description: string;
};

/**
 * Who posts (docs/SOCIAL-MANAGER.md S4): a connection and a brand kit belong to an
 * actor, an opaque uuid to core. In the artist platform the actor is an artist
 * name; in a product where the account itself posts, actors() returns one actor
 * per account (id = account id). Everything core shows about an actor comes from here.
 */
export type SocialActor = {
  id: string;
  name: string;
  logoUrl: string | null;
  /** Public links by provider key (instagram, soundcloud, website …), for the brand kit's handle and signature. */
  links: Record<string, string>;
  /** Free words that describe the actor (genres, topics), for the signature line and hashtag sets. */
  tags: string[];
  /** ISO-639 code of the actor's language, or null. */
  language: string | null;
};

/**
 * A place the actor is lined up to play (or played), for the post editor's Venue
 * picker: choosing one fills the template's venue, city, date and time. `date` is
 * the event's ISO day, `time` its local "HH:mm" or null. `upcoming` false = a venue
 * from before, offered for its name and city only.
 */
export type SocialGig = { id: string; title: string; venue: string; city: string | null; date: string; time: string | null; upcoming: boolean };

/**
 * Something the product already holds that a plan of posts can be made from
 * (docs/SOCIAL-MANAGER.md §2.4, §4.4): a confirmed gig first; releases and won
 * opportunities later. Core matches `kind` to a rule in `social_plan_rules`
 * (`gig.confirmed` → `gig.confirmed.v1`) and `ref` to one plan, so promoting the
 * same thing twice re-proposes instead of duplicating. `at` is the instant the
 * rule's offsets count from (the set's start, else the evening of the day) and
 * `timezone` the zone its day is read in. `slots` are the words the templates
 * take ({{title}}, {{venue}}, {{city}}, {{date}}, {{time}}, {{lineup}} …);
 * `facts` are the same things as one line each for the caption model; `photo` is
 * a picture of the product's, used where a template asks for one.
 */
export type SocialTrigger = {
  kind: string;
  ref: string;
  actorId: string;
  /** What the person sees it called (the gig's title). */
  label: string;
  at: string;
  timezone: string;
  slots: Record<string, string>;
  facts: string[];
  photo: string | null;
};

/**
 * What the caption model is told about the actor (§2.4 "captions in the artist's
 * voice"): a bio in the actor's language, the words it describes itself with, where
 * it is based, and the ISO code of that language. Core adds the actor's last ten
 * approved captions itself. Nothing here is a secret or a contact.
 */
export type SocialCaptionContext = {
  name: string;
  bio: string | null;
  language: string | null;
  tags: string[];
  baseCity: string | null;
  /** Public links by provider key, for a "link in bio" mention; the model never gets a token. */
  links: Record<string, string>;
};

export type ProductConfig = {
  /** Name, addresses and pitch (see ProductBrand). */
  brand: ProductBrand;
  /** The product's mark (header, sign-in card, Continue page). Draws from the accent token. */
  Mark: (props: { size?: number; className?: string }) => ReactNode;
  /** Where a signed-in person lands; sign-in links and "Back to app" go here. */
  homePath: string;
  /** Where a brand-new account starts (the sign-in page says "create" for it). Optional. */
  signupPath?: string;
  /** The public privacy notice; the sign-in page links to it. Optional. */
  privacyPath?: string;
  /** Cookies that belong to the signed-in person (e.g. the artist name they work as); sign-out deletes them. The look and theme stay: they belong to the browser. Optional. */
  signOutCookies?: string[];
  /** Extras on the sign-in page. Optional. */
  signIn?: {
    /** A photo beside the form, from the product's public folder: `tall` on phones (a band above the form), `wide` from 1024px (half the page). */
    image?: { tall: string; wide: string };
    /** A short label beside the name, e.g. "Beta". */
    label?: string;
  };
  /**
   * Social Manager (core module, migration 027). Optional: a product without it has no
   * /app/social. `actors` lists who can post in an account; `currentActorId` says which one
   * the person is working as right now (the artist platform reads its identity cookie);
   * `logoPath` is where the actor's logo is edited, for the brand kit's hint.
   */
  social?: {
    actors: (supabase: SupabaseClient, accountId: string) => Promise<SocialActor[]>;
    currentActorId?: () => Promise<string | null>;
    logoPath?: string;
    /** The actor's gigs for the post editor's Venue picker (see SocialGig). Without it the venue is typed. */
    gigs?: (supabase: SupabaseClient, accountId: string, actorId: string) => Promise<SocialGig[]>;
    /**
     * Phase 2 (plans from what the product holds). `triggers` lists what the account's
     * actors could promote right now (a confirmed coming gig …), each with the words the
     * templates and the caption model take; `captionContext` describes one actor for
     * the model. Without `triggers` there is no "Promote" and no plan screen.
     */
    triggers?: (supabase: SupabaseClient, accountId: string) => Promise<SocialTrigger[]>;
    captionContext?: (supabase: SupabaseClient, accountId: string, actorId: string) => Promise<SocialCaptionContext>;
    /**
     * Lets the Brand kit page ask for the logo itself (the guide's "set up your brand kit"
     * step). The browser uploads to `bucket` at `path(accountId, actorId)` (a public bucket
     * whose insert policy is scoped to the account folder, like the product's own picture
     * uploads); then `record` stores the public URL where the product keeps the actor's
     * logo of record, so the kit's logo and the product's stay one picture. Without it the
     * page only links to `logoPath`.
     */
    logoUpload?: {
      bucket: string;
      path: (accountId: string, actorId: string) => string;
      record: (supabase: SupabaseClient, accountId: string, actorId: string, url: string) => Promise<{ error?: string }>;
    };
  };
  /** Path prefixes that need a signed-in person (the proxy sends others to /login). /admin is always added. */
  privatePrefixes: string[];
  admin: {
    /** Extra admin tabs, shown after Accounts, e.g. [["/admin/queue", "Queue"]]. */
    nav?: Array<[href: string, label: string]>;
    /** Placeholder of the accounts search box. */
    searchPlaceholder?: string;
    /** Title of a row in the accounts list (default: the account name). Rows carry the hook fields too. */
    accountTitle?: (row: Record<string, unknown>) => string | null;
    /** Tiles after the core ones on the Overview, from the fields app.overview_extra() adds. */
    overviewTiles?: (overview: Record<string, unknown>) => Array<[label: string, value: string | number]>;
    /** Product section on one account's page (e.g. the artist names). May be async. */
    AccountPanel?: (props: { detail: AccountDetail }) => ReactNode | Promise<ReactNode>;
    /**
     * Storage buckets that keep an account's files under `<account id>/`. Delete account
     * empties that folder in each before it removes the login (Supabase refuses to delete
     * a user who still owns files). Default: none.
     */
    storageBuckets?: string[];
    /**
     * The short note a tester gets with an invite link (Admin → Accounts → Invite a tester),
     * in the product's words: what is stored about them, what is public, that deletion is
     * on request. Core adds one line about the link. Default: a generic note.
     */
    testerNote?: string;
    /** What "View as" shows below the read-only banner: the customer's own home, rendered read-only. */
    ViewAs: (props: {
      detail: AccountDetail;
      sessionId: string;
      searchParams: Record<string, string | string[] | undefined>;
    }) => ReactNode | Promise<ReactNode>;
  };
};
