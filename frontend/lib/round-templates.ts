/** Static presets that seed a workspace. Titles and durations only; rooms are planned per round. */
export interface RoundTemplate {
  name: string;
  rounds: { title: string; durationSec: number }[];
}

export const ROUND_TEMPLATES: RoundTemplate[] = [
  {
    name: "Rotating intros",
    rounds: [
      { title: "Two-minute intros", durationSec: 480 },
      { title: "Research & decide", durationSec: 600 },
      { title: "Warm intros & asks", durationSec: 480 },
    ],
  },
  {
    name: "Speed mentoring",
    rounds: [
      { title: "Meet your mentor", durationSec: 420 },
      { title: "Deep dive", durationSec: 600 },
      { title: "Switch mentors", durationSec: 420 },
      { title: "Wrap up", durationSec: 300 },
    ],
  },
];
