import type { Activity } from "@/types/breakout";

/**
 * The host's question and, when written, its description, atop both activity
 * views. Styled like the host's submissions page heading: question first, the
 * description right under it, smaller and grey, with no label.
 */
export default function ActivityPrompt({ activity }: { activity: Activity }) {
  return (
    <div className="bw-prompt">
      <h2 className="bw-activity-page__question">{activity.title}</h2>
      {activity.description ? <p className="bw-activity-page__description">{activity.description}</p> : null}
    </div>
  );
}
