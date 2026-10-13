"use client";

import { useRef, useState } from "react";

/**
 * Text with a pencil: the one way to rename anything in the app (workflow,
 * rounds, rooms). Enter or blur saves, Escape cancels.
 *
 * `onSave` may return an error message; the field then stays open and shows
 * it under the input. Room names use that for "required" and "already taken".
 */
export default function EditableName({
  value,
  placeholder,
  onSave,
  className,
}: {
  value: string | null;
  placeholder: string;
  /** An empty name arrives as null. Return a message to reject the name. */
  onSave: (next: string | null) => string | null | void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const classes = (base: string) => [base, className].filter(Boolean).join(" ");

  function close() {
    setEditing(false);
    setError(null);
    // Keyboard users land back on the pencil they started from.
    requestAnimationFrame(() => pencilRef.current?.focus());
  }

  function commit() {
    const next = draft.trim() === "" ? null : draft.trim();
    if (next === value) return close();
    const rejected = onSave(next);
    if (typeof rejected === "string") return setError(rejected);
    close();
  }

  if (editing) {
    return (
      <span className={classes("bw-editable-name bw-editable-name--editing")}>
        <input
          autoFocus
          className="bw-room-name-input"
          value={draft}
          placeholder={placeholder}
          aria-label={`Rename ${value ?? placeholder}`}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key !== "Escape") return;
            // Cancels the rename only, not a modal this field sits in.
            event.stopPropagation();
            close();
          }}
        />
        {error ? (
          <span className="bw-field-error" role="alert">
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className={classes("bw-editable-name")}>
      <span className="bw-room-name">{value ?? placeholder}</span>
      <button
        ref={pencilRef}
        type="button"
        className="bw-icon-button"
        aria-label={`Rename ${value ?? placeholder}`}
        title="Rename"
        onClick={() => {
          setDraft(value ?? "");
          setEditing(true);
        }}
      >
        ✎
      </button>
    </span>
  );
}
