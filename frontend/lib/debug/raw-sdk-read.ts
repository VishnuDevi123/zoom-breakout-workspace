"use client";

import { useSyncExternalStore } from "react";

/**
 * Temporary diagnostic channel for raw Zoom SDK payloads.
 *
 * The Zoom client gives an embedded app no reachable console, and the SDK
 * payloads have repeatedly differed from their documented shape. This module
 * carries the last raw read from whoever performed it to the debug panel that
 * displays it, with no prop threading in between.
 *
 * It is deliberately self-contained. Deleting this file, the panel component,
 * and the two call sites removes the feature completely, which is the intent
 * once the SDK shapes are settled.
 */

let lastRead: string | null = null;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return lastRead;
}

/** The server renders no payload, so the panel starts empty and hydrates cleanly. */
function getServerSnapshot() {
  return null;
}

/** Records a payload for display. Anything not serialisable is reported as such. */
export function recordRawSdkRead(label: string, payload: unknown) {
  try {
    lastRead = `${label}\n${JSON.stringify(payload, null, 2)}`;
  } catch {
    lastRead = `${label}\n[payload could not be serialised]\n${String(payload)}`;
  }

  for (const listener of listeners) listener();
}

/**
 * Records a rejected SDK call. Error objects serialise to `{}` by default, so
 * their own property names are listed explicitly.
 */
export function recordRawSdkError(label: string, error: unknown) {
  const own = Object.getOwnPropertyNames(Object(error));

  try {
    lastRead = `${label}\n${JSON.stringify(error, own, 2)}\n${String(error)}`;
  } catch {
    lastRead = `${label}\n${String(error)}`;
  }

  for (const listener of listeners) listener();
}

export function useRawSdkRead() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
