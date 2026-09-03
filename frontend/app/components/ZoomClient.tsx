"use client";

import { useEffect, useState } from "react";

export default function ZoomClient() {
  const [meetingUUID, setMeetingUUID] = useState("");
  const [backendMessage, setBackendMessage] = useState("");

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
          meetingUUID: result.meetingUUID,
        }),
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const backendResult = await response.json();

      console.log("Backend response:", backendResult);

      setBackendMessage(backendResult.message + " " + backendResult.message2);
        }

    initZoom().catch(console.error);
  }, []);

  return (
    <div>
      <p>Meeting UUID: {meetingUUID || "Loading..."}</p>

      {backendMessage && <p>Backend: {backendMessage}</p>}
    </div>
  );
}
