import type { CSSProperties } from "react";

/**
 * A room's colour for its participant screens: the room bar and the poll and
 * quiz card take a light tint of the room's dot, so every room looks different
 * while the text stays dark and readable on all of them.
 */

/** How far each dot is moved toward white for the bar and the card. 0 is the dot itself, 1 is white. */
const TINT = 0.85;

const WHITE = "#ffffff";
/** --bw-ink in globals.css. */
const INK = "#172033";

function channels(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** `hex` moved toward `target` by `amount` (0 to 1). */
function mix(hex: string, target: string, amount: number): string {
  const from = channels(hex);
  const to = channels(target);
  const mixed = from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** The tint pushed lighter until it reads as text on the dark ink (the Lock in button). */
function readableOnInk(tint: string): string {
  for (let amount = 0; amount <= 1; amount += 0.05) {
    const candidate = mix(tint, WHITE, amount);
    if (contrast(candidate, INK) >= 4.5) return candidate;
  }
  return WHITE;
}

/**
 * CSS variables for a room: `--bw-room` (the light tint), `--bw-room-ink` (the
 * dark text on it) and `--bw-room-strong` (the tint readable as text on an
 * ink-coloured surface, such as the Lock in button).
 */
export function roomTheme(dot: string): CSSProperties {
  const tint = mix(dot, WHITE, TINT);
  return {
    "--bw-room": tint,
    "--bw-room-ink": INK,
    "--bw-room-strong": readableOnInk(tint),
  } as CSSProperties;
}
