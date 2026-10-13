"use client";
import {useState, useEffect} from "react";
import type {LiveState} from "@/types/breakout";


/** The meeting's live state, pushed over SSE. EventSource reconnects on its own after a drop. */
export function useLiveState(parentUUID: string): { liveState: LiveState | null } {
    const [liveState, setLiveState] = useState<LiveState | null>(null);

    useEffect(() => {
        if (!parentUUID) return;
        const eventSource = new EventSource(
          `/api/live/events?parentUUID=${encodeURIComponent(parentUUID)}`,
        );
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data) as LiveState;
            setLiveState(data);
        }
        return () => {
            eventSource.close();
        }
    }, [parentUUID]);

    return {liveState};

}