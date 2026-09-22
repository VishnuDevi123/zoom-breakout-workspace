"use client";

import { useState } from "react";

/** Text with a pencil. Click to edit inline; Enter or blur saves, Escape cancels. */
export default function EditableName({
  value,
  placeholder,
  onSave,
  className,
}: {
  value: string | null;
  placeholder: string;
  onSave: (next: string | null) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function commit() {
    const next = draft.trim() === "" ? null : draft.trim();
    setEditing(false);
    if (next !== value) onSave(next);
  }

  if (editing) {
    return (
      <input
        autoFocus
        className={["bw-room-name-input", className].filter(Boolean).join(" ")}
        value={draft}
        placeholder={placeholder}
        aria-label={`Rename ${value ?? placeholder}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <span className={["bw-editable-name", className].filter(Boolean).join(" ")}>
      <span className="bw-room-name">{value ?? placeholder}</span>
      <button
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
