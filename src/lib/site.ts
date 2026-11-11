/**
 * Links shared with the live Webflow site. The app runs on
 * bench.purveycpg.com, so every chrome link is absolute to the main site.
 * Keep these in step with purveycpg.com (checked 2026-11-08).
 */
export const MAIN_SITE = (process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? "https://www.purveycpg.com").replace(/\/$/, "");

export const LOGO_URL =
  "https://cdn.prod.website-files.com/69bdcd2f869a6d3500f34c17/6a02796e7781f666c26aafd2_PurveyLogo.png";

const LOGO_BASE = "https://cdn.prod.website-files.com/69bdcd2f869a6d3500f34c17/6a02796e7781f666c26aafd2_PurveyLogo";
export const LOGO_SRCSET = [500, 800, 1080, 1600, 2000, 2600, 3200]
  .map((w) => `${LOGO_BASE}-p-${w}.png ${w}w`)
  .concat(`${LOGO_URL} 6250w`)
  .join(", ");

export const siteLinks = {
  home: `${MAIN_SITE}/`,
  about: `${MAIN_SITE}/about/about-us`,
  contact: `${MAIN_SITE}/contact/contact`,
  blog: `${MAIN_SITE}/blog`,
  services: `${MAIN_SITE}/services`,
  privacy: `${MAIN_SITE}/privacy-policy`,
  clientPortal: "https://dashboard.assembly.com/",
} as const;

/** Copied verbatim from the live footer. Update when the Webflow footer changes. */
export const FOOTER_TAGLINE =
  "Supporting purveyors of emerging brands. We help CPG founders build, scale, and win at every stage.";
export const FOOTER_COPYRIGHT = "© 2026 Purvey CPG. All rights reserved.";

/** The public app URL, used for absolute links in emails and the embed. */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
