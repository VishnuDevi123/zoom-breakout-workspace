/**
 * Eased page scroll for the header links. The browser's own `scroll-behavior: smooth`
 * does not say when it ends, and the header must hold its active link until it does.
 */

const MIN_MS = 450;
const MAX_MS = 1100;

function easeInOutCubic(progress: number): number {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
}

/** Scrolls the window to `targetY`; a wheel, touch or key press stops it where it is. Returns a cancel function. */
export function scrollWindowTo({ targetY, onDone }: { targetY: number; onDone: () => void }): () => void {
  const startY = window.scrollY;
  const maxY = document.documentElement.scrollHeight - window.innerHeight;
  const distance = Math.min(Math.max(targetY, 0), maxY) - startY;

  if (distance === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo(0, startY + distance);
    onDone();
    return () => {};
  }

  // Longer trips take a little longer, never so long that the page feels slow.
  const duration = Math.min(MAX_MS, MIN_MS + Math.abs(distance) * 0.25);
  const startTime = performance.now();
  let frame = 0;

  const stop = () => {
    cancelAnimationFrame(frame);
    for (const event of INTERRUPTS) window.removeEventListener(event, interrupt);
  };
  const interrupt = () => {
    stop();
    onDone();
  };
  const step = (now: number) => {
    const progress = Math.min((now - startTime) / duration, 1);
    window.scrollTo(0, startY + distance * easeInOutCubic(progress));
    if (progress < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    interrupt();
  };

  for (const event of INTERRUPTS) window.addEventListener(event, interrupt, { passive: true });
  frame = requestAnimationFrame(step);
  return stop;
}

const INTERRUPTS = ["wheel", "touchstart", "keydown"] as const;
