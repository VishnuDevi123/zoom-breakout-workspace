import Link from "next/link";

import { REPO_URL } from "./sections";

const LINKEDIN_URL = "https://www.linkedin.com/in/vishnuvardhana-reddy-devi-reddy/";
const GITHUB_PROFILE_URL = "https://github.com/VishnuDevi123";

/** Page links first, then the author's own; external ones open in a new tab. */
const FOOTER_LINKS = [
  { label: "Try the demo", href: "/demo", external: false },
  { label: "How it works", href: "#how-it-works", external: false },
  { label: "Source code", href: REPO_URL, external: true },
  { label: "LinkedIn", href: LINKEDIN_URL, external: true },
  { label: "GitHub", href: GITHUB_PROFILE_URL, external: true },
];

/** Dark band at the bottom: who made it and where to go next. */
export default function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer__inner">
        <div className="lp-footer__about">
          <span className="lp-footer__brand">
            <span
              className="lp-header__mark lp-footer__mark"
              aria-hidden="true"
            >
              B
            </span>
            <span className="lp-footer__name">Zoom Breakout Workspace</span>
          </span>
          <p className="lp-footer__project">
            An ASU Next Lab and Zoom fellowship project.
          </p>
          <p className="lp-footer__credit">
            Built by Vishnu Vardhana Reddy Devi Reddy
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="lp-footer__links">
            {FOOTER_LINKS.map(({ label, href, external }) => (
              <li key={label}>
                {href.startsWith("/") ? (
                  <Link href={href} className="lp-footer__link">
                    {label}
                  </Link>
                ) : (
                  <a
                    href={href}
                    className="lp-footer__link"
                    {...(external
                      ? { target: "_blank", rel: "noreferrer" }
                      : {})}
                  >
                    {label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
