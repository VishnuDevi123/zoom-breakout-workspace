"use client";

import { useEffect, useState } from "react";

import type { ApiResponse, SessionRecord } from "@/types/breakout";

export default function ZoomClient() {
  const [meetingUUID, setMeetingUUID] = useState("");
  const [sessionState, setSessionState] = useState("");

  useEffect(() => {
    async function initZoom() {
      const zoomSdk = window.zoomSdk;

      if (!zoomSdk) {
        console.log("Zoom SDK not available");
        return;
      }

      await zoomSdk.config({
        version: "0.16",
        capabilities: [
          "getMeetingUUID",
          "getMeetingContext",
          "getBreakoutRoomList",
          "onBreakoutRoomChange",
        ],
      });

      const result = await zoomSdk.getMeetingUUID();

      console.log("Zoom result:", result);

      setMeetingUUID(result.meetingUUID);

      const response = await fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parentUUID: result.meetingUUID,
          declaredRole: "host",
        }),
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const backendResult: ApiResponse<SessionRecord> = await response.json();

      console.log("Backend response:", backendResult);

      if (backendResult.success) {
        setSessionState(backendResult.data.sessionState);
      }
    }

    initZoom().catch(console.error);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        className="bw-mono"
        style={{
          fontSize: 10,
          color: "var(--bw-muted-3)",
          overflowWrap: "anywhere",
        }}
      >
        {meetingUUID || "no meeting uuid yet"}
      </span>

      {sessionState && (
        <span style={{ fontSize: 11, color: "var(--bw-muted-2)" }}>
          Session {sessionState}
        </span>
      )}
    </div>
  );
}
