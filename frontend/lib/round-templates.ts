/** Static presets that seed a workspace. Titles and durations only; rooms are planned per round. */
export interface RoundTemplate {
  name: string;
  rounds: { title: string; durationSec: number }[];
}

export const ROUND_TEMPLATES: RoundTemplate[] = [
  {
    name: "Rotating intros",
    rounds: [
      { title: "Two-minute intros", durationSec: 240 },
      { title: "Research & decide", durationSec: 300 },
      { title: "Warm intros & asks", durationSec: 240 },
    ],
  },
  {
    name: "Speed mentoring",
    rounds: [
      { title: "Meet your mentor", durationSec: 210 },
      { title: "Deep dive", durationSec: 300},
      { title: "Switch mentors", durationSec: 210 },
      { title: "Wrap up", durationSec: 150 },
    ],
  },
];
