import type { Activity, RoomResponsesView } from "@/types/breakout";

/** Display text and tints per activity kind, shared by the host editor and (later) the room page. */
export const ACTIVITY_KINDS: Record<
  Activity["kind"],
  { label: string; hint: string; tint: string; ink: string; titleLabel: string; titlePlaceholder: string }
> = {
  individual: {
    label: "Individual response",
    hint: "private",
    tint: "#fff4c4",
    ink: "#746019",
    titleLabel: "Question",
    titlePlaceholder: "What should each person answer?",
  },
  ideaBoard: {
    label: "Shared response",
    hint: "idea board",
    tint: "#c3faf5",
    ink: "#187574",
    titleLabel: "Prompt for the board",
    titlePlaceholder: "What should the room add ideas about?",
  },
};

export type ActivityProgress = "notStarted" | "working" | "completed";

export const PROGRESS_LABELS: Record<ActivityProgress, string> = {
  notStarted: "Not started",
  working: "Working",
  completed: "Completed",
};

/**
 * One person's progress on one activity. An answer is completed once submitted;
 * a board once the person marks ready, and in progress once they add a note.
 */
export function activityProgress(
  activity: Activity,
  view: RoomResponsesView | null,
  participantUUID: string,
): ActivityProgress {
  if (!view) return "notStarted";
  switch (activity.kind) {
    case "individual": {
      const status = view.statuses[activity.id]?.[participantUUID];
      if (status === "submitted") return "completed";
      return status === "working" ? "working" : "notStarted";
    }
    case "ideaBoard": {
      if (view.ready[activity.id]?.includes(participantUUID)) return "completed";
      const wroteNote = view.ideas[activity.id]?.some((note) => note.participantUUID === participantUUID);
      return wroteNote ? "working" : "notStarted";
    }
    default:
      return assertNever(activity);
  }
}

/** A room member's line in the people list: Submitted once every activity is completed. */
export function memberStatus(
  activities: Activity[],
  view: RoomResponsesView | null,
  participantUUID: string,
): "Submitted" | "Working" | "Not started" {
  const progress = activities.map((activity) => activityProgress(activity, view, participantUUID));
  if (progress.length > 0 && progress.every((step) => step === "completed")) return "Submitted";
  return progress.some((step) => step !== "notStarted") ? "Working" : "Not started";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled activity: ${JSON.stringify(value)}`);
}
