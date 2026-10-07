"use client";

import { useEffect, useState, type ButtonHTMLAttributes } from "react";

import Spinner from "./Spinner";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

/** A spinner that vanishes the moment it appears reads as a flicker, not as feedback. */
const MIN_BUSY_MS = 400;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** True while the action this button started is still running. */
  busy?: boolean;
}

/** Pill button. While busy it keeps its width, shows a spinner and cannot be pressed again. */
export default function Button({
  variant = "primary",
  size = "md",
  busy = false,
  className,
  type = "button",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const showBusy = useHeldBusy(busy);
  const classes = [
    "bw-button",
    `bw-button--${variant}`,
    variant === "ghost" ? "" : `bw-button--${size}`,
    showBusy ? "bw-button--busy" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} disabled={disabled || showBusy} aria-busy={showBusy} {...rest}>
      {showBusy ? <Spinner /> : null}
      <span className="bw-button__label">{children}</span>
    </button>
  );
}

/** Follows `busy`, but keeps reporting true until each busy run has lasted MIN_BUSY_MS. */
function useHeldBusy(busy: boolean): boolean {
  const [wasBusy, setWasBusy] = useState(busy);
  const [run, setRun] = useState(0);
  const [finishedRun, setFinishedRun] = useState(0);

  // A new run starts when busy turns on; adjusting state while rendering avoids an extra pass.
  if (busy !== wasBusy) {
    setWasBusy(busy);
    if (busy) setRun(run + 1);
  }

  useEffect(() => {
    if (run === 0) return;
    const timer = setTimeout(() => setFinishedRun(run), MIN_BUSY_MS);
    return () => clearTimeout(timer);
  }, [run]);

  return busy || finishedRun !== run;
}
