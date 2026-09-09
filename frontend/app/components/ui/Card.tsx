import type { HTMLAttributes } from "react";

type Tone = "default" | "sunken" | "dashed";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  /** Large radius and padding, used for page-level panels. */
  large?: boolean;
}

/** White surface with a hairline border. Radius 12px, or 16px when large. */
export default function Card({
  tone = "default",
  large = false,
  className,
  ...rest
}: CardProps) {
  const classes = [
    "bw-card",
    large ? "bw-card--lg" : "",
    tone === "default" ? "" : `bw-card--${tone}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes} {...rest} />;
}
