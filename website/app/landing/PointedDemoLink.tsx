"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** How long the ring blinks after the section comes into view. */
const POINT_MS = 4000;

/**
 * The "Try interactive demo" button. Each time it scrolls fully into view (from the header's
 * Demo link or by hand) it blinks for a few seconds, like the demo tour's pointer.
 */
export default function PointedDemoLink() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [pointed, setPointed] = useState(false);

  useEffect(() => {
    const link = linkRef.current;
    if (!link) return;
    let timer = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        setPointed(entry.isIntersecting);
        if (entry.isIntersecting) timer = window.setTimeout(() => setPointed(false), POINT_MS);
      },
      { threshold: 1 },
    );
    observer.observe(link);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={`lp-demo__cta${pointed ? " lp-demo__cta--pointed" : ""}`}>
      <Link ref={linkRef} href="/demo" className="lp-button lp-button--primary lp-demo__button">
        Try interactive demo
        <span aria-hidden="true">→</span>
      </Link>
      <span className="lp-demo__start" aria-hidden="true">
        <svg viewBox="0 0 60 40" width="52" height="34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M56 6C40 4 18 10 8 30" />
          <path d="M4 22l4 9 9-4" />
        </svg>
        Start here
      </span>
    </div>
  );
}
