"use client";

import type { ReactNode } from "react";

import { useScrollReveal } from "@/lib/use-scroll-reveal";

/**
 * A modal body whose scrollbar shows only while scrolling. `capped` keeps it about
 * one question tall, so results with many questions scroll instead of filling the screen.
 */
export default function ChallengeScrollBody({ capped = false, children }: { capped?: boolean; children: ReactNode }) {
  const scrollReveal = useScrollReveal();
  return (
    <div
      className={capped ? "bw-overlay__body bw-challenge-scroll bw-challenge-scroll--capped" : "bw-overlay__body bw-challenge-scroll"}
      {...scrollReveal}
    >
      {children}
    </div>
  );
}
