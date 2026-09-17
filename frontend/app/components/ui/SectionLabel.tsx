import type { HTMLAttributes } from "react";

/** Uppercase 9.5px tracked label that opens every rail section. */
export default function SectionLabel({
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement>) {
  const classes = ["bw-section-label", className].filter(Boolean).join(" ");

  return <span className={classes} {...rest} />;
}
