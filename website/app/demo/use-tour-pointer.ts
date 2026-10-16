"use client";

import { useEffect } from "react";

import type { TourPoint } from "@/data/scenarios/types";

/** Set on the element the tour points at; demo.css draws the blinking ring. */
const ACTIVE = "data-tour-active";

/**
 * Points the tour at a button: the first of `points` on screen (`data-tour`
 * attribute) is scrolled to the centre and blinks until it is clicked or the
 * step moves on. Targets come and go as the demo runs (Generate after the
 * typing, Submit once the modal opens), so a MutationObserver re-checks.
 */
export function useTourPointer(points: TourPoint[] | undefined): void {
  const pointsKey = points?.join(" ") ?? "";

  useEffect(() => {
    if (!pointsKey) return;
    const names = pointsKey.split(" ");
    const clicked = new WeakSet<Element>();
    let current: HTMLElement | null = null;

    // Clicking it is what the step asked for: stop blinking straight away.
    function stop(event: Event) {
      if (!(event.currentTarget instanceof HTMLElement)) return;
      clicked.add(event.currentTarget);
      release();
      update();
    }

    function release() {
      current?.removeAttribute(ACTIVE);
      current?.removeEventListener("click", stop);
      current = null;
    }

    function update() {
      const target = names
        .map((name) => document.querySelector(`[data-tour="${name}"]`))
        .find((element): element is HTMLElement => element instanceof HTMLElement && !clicked.has(element));
      if (target === current) return;
      release();
      if (!target) return;
      current = target;
      target.setAttribute(ACTIVE, "");
      target.addEventListener("click", stop);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center", inline: "nearest" });
    }

    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      release();
    };
  }, [pointsKey]);
}
