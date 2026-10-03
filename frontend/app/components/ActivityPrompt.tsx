import type { Activity } from "@/types/breakout";

/** "To do" (the host's question) and, when written, "Description", atop both activity pages. */
export default function ActivityPrompt({ activity }: { activity: Activity }) {
  return (
    <div className="bw-prompt">
      <div className="bw-prompt__part">
        <span className="bw-prompt__label">To do:</span>
        <h2 className="bw-activity-page__question">{activity.title}</h2>
      </div>
      {activity.description ? (
        <div className="bw-prompt__part">
          <span className="bw-prompt__label">Description:</span>
          <p className="bw-activity-page__description">{activity.description}</p>
        </div>
      ) : null}
    </div>
  );
}
