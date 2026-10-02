import type { Activity } from "@/types/breakout";

/** Display text and tints per activity kind, shared by the host editor and (later) the room page. */
export const ACTIVITY_KINDS: Record<
  Activity["kind"],
  { label: string; hint?: string; tint: string; ink: string; titleLabel: string; titlePlaceholder: string }
> = {
  individual: {
    label: "Individual response",
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
