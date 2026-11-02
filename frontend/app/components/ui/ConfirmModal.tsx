"use client";

import { useState } from "react";

import Button from "./Button";
import Modal from "./Modal";

/**
 * Small yes/no before a step that matters, closed by Cancel, ✕, Escape or a click
 * on the dimmed area. `onConfirm` reports its own errors; the modal closes after it.
 */
export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmVariant = "danger",
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  /** Red for destructive steps (the default); primary for ones like launching. */
  confirmVariant?: "danger" | "primary";
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm(close: () => void) {
    setBusy(true);
    await onConfirm();
    setBusy(false);
    close();
  }

  return (
    <Modal label={title} size="sm" locked={busy} onClose={onClose}>
      {(close) => (
        <>
          <div className="bw-overlay__body">
            <div className="bw-confirm-head">
              <span className="bw-modal-title">{title}</span>
              <button type="button" className="bw-back-button" aria-label="Close" title="Close" disabled={busy} onClick={close}>
                ✕
              </button>
            </div>
            <p className="bw-confirm-message">{message}</p>
          </div>
          <footer className="bw-overlay__footer">
            <Button variant="secondary" size="sm" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button variant={confirmVariant} size="sm" busy={busy} onClick={() => void confirm(close)}>
              {confirmLabel}
            </Button>
          </footer>
        </>
      )}
    </Modal>
  );
}
