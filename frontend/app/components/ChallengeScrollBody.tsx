"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A modal body whose scrollbar shows only while scrolling. `capped` keeps it about
 * one question tall, so results with many questions scroll instead of filling the screen.
 */
export default function ChallengeScrollBody({ capped = false, children }: { capped?: boolean; children: ReactNode }) {
  const [scrolling, setScrolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div
      className={capped ? "bw-overlay__body bw-challenge-scroll bw-challenge-scroll--capped" : "bw-overlay__body bw-challenge-scroll"}
      data-scrolling={scrolling ? "" : undefined}
      onScroll={() => {
        setScrolling(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setScrolling(false), 800);
      }}
    >
      {children}
    </div>
  );
}
