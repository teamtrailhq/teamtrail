/** What a page tells the nav (siteNav.ts). Every value is escaped where it is written. */
export type SiteNavOptions = {
  /** Where the site's links point: '' (the default) on teamtrail.app itself, `https://teamtrail.app` elsewhere. */
  base?: string;
  /** The page's own path on the site (`/docs/cli/`), so its link and its menu read as current. */
  path?: string;
  /** A bordered Sign in button before the theme toggle (never the accent fill), and in the phone menu. */
  signIn?: { href: string };
  /** The domain the theme cookie is shared on (`teamtrail.app`); the toggle works it out from the host without it. */
  themeCookieDomain?: string;
};

/** A link to a page of the site. */
export type SiteLink = { readonly path: string; readonly label: string };
