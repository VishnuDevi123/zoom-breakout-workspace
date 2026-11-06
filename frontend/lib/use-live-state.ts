"use client";
import {useState, useEffect} from "react";
import {apiFetch} from "@/lib/execution-api";
import type {LiveState} from "@/types/breakout";

const RETRY_FIRST_MS = 1000;
const RETRY_MAX_MS = 10_000;

/**
 * The meeting's live state, pushed over SSE. Read with fetch, not EventSource,
 * because the stream needs the app context header like every other route.
 */
export function useLiveState(parentUUID: string): { liveState: LiveState | null } {
    const [liveState, setLiveState] = useState<LiveState | null>(null);

    useEffect(() => {
        if (!parentUUID) return;
        const controller = new AbortController();
        void followLiveState(parentUUID, controller.signal, setLiveState);
        return () => controller.abort();
    }, [parentUUID]);

    return {liveState};
}

/** Keeps one stream open until aborted, reconnecting after a drop: 1 s, then 2 s, up to 10 s. */
async function followLiveState(
    parentUUID: string,
    signal: AbortSignal,
    onState: (state: LiveState) => void,
): Promise<void> {
    const url = `/api/live/events?parentUUID=${encodeURIComponent(parentUUID)}`;
    let retryMs = RETRY_FIRST_MS;
    while (!signal.aborted) {
        try {
            // apiFetch swaps an expired token for a fresh one on 401.
            const response = await apiFetch(url, {signal, headers: {Accept: "text/event-stream"}});
            if (response.ok && response.body) {
                retryMs = RETRY_FIRST_MS;
                await readEvents(response.body, onState);
            }
        } catch {
            // A dropped connection or an abort; the loop decides which.
        }
        await pause(retryMs, signal);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    }
}

/** Reads `data:` events until the stream ends. Each event is one LiveState. */
async function readEvents(body: ReadableStream<Uint8Array>, onState: (state: LiveState) => void): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
        const {value, done} = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, {stream: true});
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
            const data = event
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice("data:".length).trimStart())
                .join("\n");
            if (data) onState(JSON.parse(data) as LiveState);
        }
    }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
        }, {once: true});
    });
}
