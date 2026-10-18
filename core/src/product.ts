import type { ReactNode } from "react";
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
