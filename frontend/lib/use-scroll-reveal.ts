"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True while an element scrolls and briefly after, so its scrollbar shows only
 * then. Spread `scrollRevealProps` onto the scrolling element; CSS reads `data-scrolling`.
 */
export function useScrollReveal() {
  const [scrolling, setScrolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    "data-scrolling": scrolling ? "" : undefined,
    onScroll: () => {
      setScrolling(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setScrolling(false), 800);
    },
  };
}
