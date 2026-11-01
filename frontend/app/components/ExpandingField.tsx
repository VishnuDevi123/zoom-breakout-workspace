"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A text field that wraps and grows downwards to show all of its text. By
 * default it shows one line (fading out at the edge when the text is longer)
 * while it is not being edited; `collapseOnBlur={false}` keeps the full text
 * shown. Both heights are explicit, so the change animates. Enter finishes editing.
 */
export default function ExpandingField({
  className,
  value,
  placeholder,
  ariaLabel,
  maxLength,
  autoFocus,
  collapseOnBlur = true,
  onChange,
  onCommit,
}: {
  className: string;
  value: string;
  placeholder: string;
  ariaLabel?: string;
  maxLength?: number;
  autoFocus?: boolean;
  collapseOnBlur?: boolean;
  onChange: (value: string) => void;
  /** Leaving the field: the point worth saving. */
  onCommit?: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const open = focused || !collapseOnBlur;

  // Open: the full text's height (it grows as you type). Closed: the one-line height from CSS.
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    if (!open) {
      element.style.height = "";
      element.scrollLeft = 0;
      return;
    }
    // Always open, it may also shrink: measure from no set height (CSS keeps these unanimated).
    if (!collapseOnBlur) element.style.height = "";
    const border = element.offsetHeight - element.clientHeight;
    element.style.height = `${element.scrollHeight + border}px`;
  }, [open, value, collapseOnBlur]);

  return (
    <textarea
      ref={field}
      className={`${className} bw-expanding`}
      data-open={open || undefined}
      rows={1}
      // Closed it stays on one line; open it wraps.
      wrap={open ? "soft" : "off"}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      maxLength={maxLength}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        onCommit?.();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
