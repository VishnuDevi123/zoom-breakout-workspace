"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";

import { LANDING_SECTIONS, REPO_URL, type LandingSectionId } from "./sections";
import { scrollWindowTo } from "./smooth-scroll";

/** A section counts as current once its top passes this share of the window height. */
const READING_LINE = 0.35;
/** Space kept between the header's bottom edge and a section it scrolled to. */
const GAP_BELOW_HEADER = 16;

function isSectionId(id: string): id is LandingSectionId {
  return LANDING_SECTIONS.some((section) => section.id === id);
}

function sectionInView(): LandingSectionId {
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  if (atBottom) return LANDING_SECTIONS[LANDING_SECTIONS.length - 1].id;

  let current: LandingSectionId = LANDING_SECTIONS[0].id;
  for (const { id } of LANDING_SECTIONS) {
    const top = document.getElementById(id)?.getBoundingClientRect().top;
    if (top !== undefined && top <= window.innerHeight * READING_LINE) current = id;
  }
  return current;
}

/** Floating pill bar: brand, section links with a sliding active pill, GitHub link. */
export default function SiteHeader() {
  const [active, setActive] = useState<LandingSectionId>("home");
  const headerRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const linkRefs = useRef(new Map<LandingSectionId, HTMLAnchorElement>());
  // While a link click scrolls the page, its section stays active so the pill does not
  // slide through every section on the way.
  const scrollingTo = useRef<LandingSectionId | null>(null);
  const cancelScroll = useRef<() => void>(() => {});

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (scrollingTo.current === null) setActive(sectionInView());
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      cancelScroll.current();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useLayoutEffect(() => {
    const placePill = () => {
      const link = linkRefs.current.get(active);
      const pill = pillRef.current;
      if (!link || !pill) return;
      pill.style.setProperty("--lp-pill-x", `${link.offsetLeft}px`);
      pill.style.setProperty("--lp-pill-w", `${link.offsetWidth}px`);
      // The first placement jumps; later ones slide.
      requestAnimationFrame(() => pill.classList.add("lp-nav__pill--placed"));
    };
    placePill();
    // Link widths change when the web font arrives and when the window resizes.
    void document.fonts.ready.then(placePill);
    window.addEventListener("resize", placePill);
    return () => window.removeEventListener("resize", placePill);
  }, [active]);

  const goTo = useEffectEvent((id: LandingSectionId) => {
    const section = document.getElementById(id);
    const headerBottom = headerRef.current?.getBoundingClientRect().bottom ?? 0;
    if (!section) return;

    cancelScroll.current();
    scrollingTo.current = id;
    setActive(id);
    history.replaceState(null, "", id === "home" ? location.pathname : `#${id}`);

    const targetY =
      id === "home" ? 0 : section.getBoundingClientRect().top + window.scrollY - headerBottom - GAP_BELOW_HEADER;
    cancelScroll.current = scrollWindowTo({
      targetY,
      onDone: () => {
        scrollingTo.current = null;
        setActive(sectionInView());
        // Keyboard users continue from the section they jumped to, as with a plain anchor.
        section.focus({ preventScroll: true });
      },
    });
  });

  // Every in-page section link (header, hero buttons, footer) scrolls the same eased way.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href^='#']");
      const id = link?.getAttribute("href")?.slice(1) ?? "";
      if (!isSectionId(id) || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      goTo(id);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <header ref={headerRef} className="lp-header">
      <a href="#home" className="lp-header__brand">
        <span className="lp-header__mark" aria-hidden="true">
          B
        </span>
        <span className="lp-header__name">Zoom Breakout Workspace</span>
      </a>
      <nav className="lp-nav" aria-label="Page sections">
        <span ref={pillRef} className="lp-nav__pill" aria-hidden="true" />
        {LANDING_SECTIONS.map(({ id, label }) => (
          <a
            key={id}
            ref={(link) => {
              if (link) linkRefs.current.set(id, link);
              else linkRefs.current.delete(id);
            }}
            href={`#${id}`}
            className="lp-nav__link"
            aria-current={active === id ? "location" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <span className="lp-header__divider" aria-hidden="true" />
      <a href={REPO_URL} className="lp-header__github" target="_blank" rel="noreferrer" aria-label="Source code on GitHub">
        <GitHubMark />
      </a>
    </header>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="24" height="24" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
