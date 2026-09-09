import type { HTMLAttributes } from "react";

type Tone = "neutral" | "outline" | "dark" | "accent" | "amber" | "teal" | "red";

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

/** Small rounded badge. Tone carries status, never decoration. */
export default function Pill({ tone = "neutral", className, ...rest }: PillProps) {
  const classes = ["bw-pill", `bw-pill--${tone}`, className].filter(Boolean).join(" ");

  return <span className={classes} {...rest} />;
}
