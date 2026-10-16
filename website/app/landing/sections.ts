/** The landing page sections the header links to, in page order. "home" is the top of the page. */
export const LANDING_SECTIONS = [
  { id: "home", label: "Home" },
  { id: "demo", label: "Demo" },
  { id: "how-it-works", label: "How it works" },
  { id: "faq", label: "FAQ" },
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number]["id"];

export const REPO_URL = "https://github.com/VishnuDevi123/zoom-breakout-workspace";
