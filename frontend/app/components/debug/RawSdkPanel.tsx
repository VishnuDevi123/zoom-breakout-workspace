"use client";

import { useRawSdkRead } from "@/lib/debug/raw-sdk-read";

/**
 * Temporary debug panel showing the Zoom SDK payload.
 *
 * It reads the payload from the module store rather than from props, so no
 * component between the SDK call and this panel has to know it exists. Render
 * it anywhere; remove it, `lib/debug/raw-sdk-read.ts`, and the record calls in
 * `lib/use-room-snapshot.ts` once the SDK shapes are settled.
 */
export default function RawSdkPanel() {
  const rawRead = useRawSdkRead();

  if (!rawRead) return null;

  return (
    <details style={{ fontSize: 10.5 }}>
      <summary style={{ cursor: "pointer", color: "var(--bw-muted-2)" }}>
        Raw SDK payload
      </summary>

      <pre
        className="bw-mono"
        style={{
          marginTop: 6,
          maxHeight: 260,
          overflow: "auto",
          fontSize: 9.5,
          lineHeight: 1.4,
          background: "var(--bw-surface-sunken)",
          border: "1px solid var(--bw-border-faint)",
          borderRadius: 8,
          padding: 8,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {rawRead}
      </pre>
    </details>
  );
}
