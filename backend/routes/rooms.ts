import { Router } from "express";

import { fixtureSnapshot } from "../fixtures/breakout.ts";
import { readSnapshot, saveSnapshot } from "../store/snapshots.ts";
import type { ApiResponse, Room, RoomSnapshot } from "../types/breakout.ts";

const router = Router();

/**
 * Slice 0 route skeletons. Every handler answers with the same fixture shape it
 * will answer with once real state lands, so the frontend can be written now.
 */

/** Last stored breakout state for a meeting (slice 2). */
router.get("/snapshot", (req, res) => {
  const parentUUID = req.query.parentUUID;

  if (typeof parentUUID !== "string" || parentUUID.length === 0) {
    const error: ApiResponse<never> = {
      success: false,
      error: "parentUUID is required.",
    };

    res.status(400).json(error);
    return;
  }

  const body: ApiResponse<RoomSnapshot> = {
    success: true,
    data: readSnapshot(parentUUID),
  };

  res.json(body);
});

/**
 * Accept a normalized snapshot read from the Zoom client (slice 2, slice 7).
 *
 * The response is not an acknowledgement, it is the stored snapshot with stable
 * room ids applied. The client renders that rather than its own read, so the
 * ids on screen are the ids later slices can rename and assign against.
 */
router.post("/snapshot", (req, res) => {
  const incoming = req.body as Partial<RoomSnapshot> | undefined;

  if (typeof incoming?.parentUUID !== "string" || incoming.parentUUID.length === 0) {
    const error: ApiResponse<never> = {
      success: false,
      error: "parentUUID is required.",
    };

    res.status(400).json(error);
    return;
  }

  if (!Array.isArray(incoming.rooms) || !Array.isArray(incoming.unassigned)) {
    const error: ApiResponse<never> = {
      success: false,
      error: "rooms and unassigned must both be arrays.",
    };

    res.status(400).json(error);
    return;
  }

  const body: ApiResponse<RoomSnapshot> = {
    success: true,
    data: saveSnapshot({
      parentUUID: incoming.parentUUID,
      rooms: incoming.rooms,
      unassigned: incoming.unassigned,
      sessionState: incoming.sessionState ?? "planning",
      capturedAt: incoming.capturedAt ?? new Date().toISOString(),
    }),
  };

  res.json(body);
});

/** Create rooms with the names the host typed (slice 3). */
router.post("/", (req, res) => {
  const parentUUID: string | undefined = req.body?.parentUUID;

  const body: ApiResponse<RoomSnapshot> = {
    success: true,
    data: fixtureSnapshot(parentUUID),
  };

  res.status(201).json(body);
});

/** Rename a room against its stable id (slice 4). */
router.patch("/:roomId", (req, res) => {
  const snapshot = fixtureSnapshot();

  const room = snapshot.rooms.find((entry) => entry.id === req.params.roomId);

  if (!room) {
    const missing: ApiResponse<Room> = {
      success: false,
      error: `No room with id ${req.params.roomId}`,
    };

    res.status(404).json(missing);
    return;
  }

  const body: ApiResponse<Room> = {
    success: true,
    data: { ...room, name: req.body?.name ?? room.name },
  };

  res.json(body);
});

/** Soft delete a room, its members return to unassigned (slice 4). */
router.delete("/:roomId", (req, res) => {
  const snapshot = fixtureSnapshot();

  const room = snapshot.rooms.find((entry) => entry.id === req.params.roomId);

  if (!room) {
    const missing: ApiResponse<Room> = {
      success: false,
      error: `No room with id ${req.params.roomId}`,
    };

    res.status(404).json(missing);
    return;
  }

  const body: ApiResponse<Room> = {
    success: true,
    data: { ...room, participants: [], deleted: true },
  };

  res.json(body);
});

/** Record assignment intent per stable room id (slice 5). */
router.post("/assignments", (req, res) => {
  const parentUUID: string | undefined = req.body?.parentUUID;

  const body: ApiResponse<RoomSnapshot> = {
    success: true,
    data: fixtureSnapshot(parentUUID),
  };

  res.json(body);
});

export default router;
