import type { RoomTask } from "@/types/breakout";

import { Card, SectionLabel } from "./ui";

/** A room's task as participants read it: goal, then instructions and resources when written. */
export default function TaskDetails({
  heading,
  task,
  emptyText,
}: {
  heading: string;
  task: RoomTask | null;
  emptyText: string;
}) {
  return (
    <>
      <SectionLabel>{heading}</SectionLabel>
      <Card className="bw-room-task">
        {task ? (
          <h2 className="bw-task-goal">{task.goal}</h2>
        ) : (
          <p className="bw-task-empty">{emptyText}</p>
        )}
      </Card>

      {task && task.instructions.length > 0 ? (
        <>
          <SectionLabel>Instructions</SectionLabel>
          <Card className="bw-instruction-list">
            {task.instructions.map((line, index) => (
              <div className="bw-instruction-row" key={line}>
                <span className="bw-mono bw-instruction-row__number">{index + 1}</span>
                <span>{line}</span>
              </div>
            ))}
          </Card>
        </>
      ) : null}

      {task && task.resources.length > 0 ? (
        <>
          <SectionLabel>Resources from the host</SectionLabel>
          {task.resources.map((resource) => (
            <ResourceRow key={resource} resource={resource} />
          ))}
        </>
      ) : null}
    </>
  );
}

/**
 * One host-supplied link. A resource is stored as a plain string, so anything
 * that is not a URL is shown as text rather than as a dead link.
 */
function ResourceRow({ resource }: { resource: string }) {
  const isLink = /^https?:\/\//i.test(resource);

  if (!isLink) {
    return (
      <div className="bw-resource-row">
        <span className="bw-resource-row__mark" />
        <span className="bw-resource-row__label">{resource}</span>
      </div>
    );
  }

  return (
    <a className="bw-resource-row" href={resource} target="_blank" rel="noreferrer">
      <span className="bw-resource-row__mark" />
      <span className="bw-resource-row__label">{resource}</span>
      <span className="bw-resource-row__open">Open</span>
    </a>
  );
}
