"use client";
import {useState, useEffect} from "react";
import type {LiveState} from "@/types/breakout";


export function useLiveState(parentUUID: string): { liveState: LiveState | null; isConnected: boolean } {
    const [liveState, setLiveState] = useState<LiveState | null>(null);

    // boolean to check if the connection is open
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!parentUUID) return;
        const eventSource = new EventSource(
          `/api/live/events?parentUUID=${encodeURIComponent(parentUUID)}`,
        );
        eventSource.onopen = () => {
            setIsConnected(true);
        }
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data) as LiveState;
            setLiveState(data);
        }
        eventSource.onerror = (error) => {
            // console.error("EventSource failed:", error);
            setIsConnected(false);
        }
        return () => {
            eventSource.close();
        }
    }, [parentUUID]);

    return {liveState, isConnected};

}