import type { ButtonHTMLAttributes } from "react";

type Variant = "dark" | "accent" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** Pill button in the four treatments used across the mockup. */
export default function Button({
  variant = "dark",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "bw-button",
    `bw-button--${variant}`,
    variant === "ghost" ? "" : `bw-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes} {...rest} />;
}
