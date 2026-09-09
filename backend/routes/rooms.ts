import { Router } from "express";

import { fixtureSnapshot } from "../fixtures/breakout.ts";
import type { ApiResponse, Room, RoomSnapshot } from "../types/breakout.ts";

const router = Router();

/**
 * Slice 0 route skeletons. Every handler answers with the same fixture shape it
 * will answer with once real state lands, so the frontend can be written now.
 */

/** Last stored breakout state for a meeting (slice 2). */
router.get("/snapshot", (req, res) => {
  const parentUUID =
    typeof req.query.parentUUID === "string" ? req.query.parentUUID : undefined;

  const body: ApiResponse<RoomSnapshot> = {
    success: true,
    data: fixtureSnapshot(parentUUID),
  };

  res.json(body);
});

/** Accept a normalized snapshot read from the Zoom client (slice 2, slice 7). */
router.post("/snapshot", (req, res) => {
  const parentUUID: string | undefined = req.body?.parentUUID;

  const body: ApiResponse<RoomSnapshot> = {
    success: true,
    data: fixtureSnapshot(parentUUID),
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
