import type { SdkErrorInfo } from "@/lib/host-gate";

import { Pill, SectionLabel } from "../ui";

/**
 * Fourth gate state: the client cannot drive breakout rooms.
 *
 * This is a different failure from not being a host, and the two must not share
 * a screen. The raw SDK error code is printed verbatim, because that code is
 * the only part a host can hand to an admin or search in Zoom's documentation.
 * It is never rewritten into friendlier wording.
 */
export default function UnsupportedScreen({ error }: { error: SdkErrorInfo | null }) {
  return (
    <div
      className="bw-shell"
      style={{ alignItems: "center", justifyContent: "center", display: "flex" }}
    >
      <div
        className="bw-card bw-card--lg"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 9,
          maxWidth: 380,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <SectionLabel>Cannot start</SectionLabel>
          <Pill tone="red">SDK error</Pill>
        </div>

        <span style={{ fontSize: 15, fontWeight: 600 }}>
          This Zoom client cannot manage breakout rooms
        </span>

        <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--bw-muted-2)" }}>
          Common causes are a Zoom client that is too old, or an account where
          the administrator turned breakout rooms off.
        </span>

        <div
          className="bw-card bw-card--sunken"
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <span className="bw-mono" style={{ fontSize: 11, color: "var(--bw-red-deep)" }}>
            {error?.code ?? "UNKNOWN_ERROR"}
          </span>

          <span
            style={{
              fontSize: 11,
              lineHeight: 1.45,
              color: "var(--bw-muted-2)",
              overflowWrap: "anywhere",
            }}
          >
            {error?.message ?? "The SDK returned no message."}
          </span>
        </div>
      </div>
    </div>
  );
}
