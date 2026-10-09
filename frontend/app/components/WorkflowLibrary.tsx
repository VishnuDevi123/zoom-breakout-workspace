"use client";

import { useState } from "react";

import { formatClock } from "@/lib/round-clock";
import { ROUND_TEMPLATES, sampleSnapshot } from "@/lib/round-templates";
import type { PastWorkflow, SavedTemplate, WorkflowSnapshot } from "@/types/breakout";

import SaveTemplateModal, { plural } from "./SaveTemplateModal";
import { Button, Card, ConfirmModal, SectionLabel } from "./ui";

/** Default title for a workflow started from a sample. */
const SAMPLE_TITLE = "Sample Workflow";

function roomCount(workflow: WorkflowSnapshot): number {
  return workflow.rounds.reduce((sum, round) => sum + round.roomNames.length, 0);
}

function activityCount(workflow: WorkflowSnapshot): number {
  return workflow.rounds.reduce((sum, round) => sum + round.activities.length, 0);
}

/** One workflow in a list: name, a summary line, one action. */
function LibraryRow({ title, meta, action }: { title: string; meta: string; action: React.ReactNode }) {
  return (
    <div className="bw-library-row">
      <div className="bw-landing-card__text">
        <span className="bw-library-row__title">{title}</span>
        <span className="bw-template__meta">{meta}</span>
      </div>
      {action}
    </div>
  );
}

/** A titled box on the landing page; shows `empty` when it has nothing to list. */
function LibraryPanel({ heading, empty, children }: { heading: string; empty: string | null; children: React.ReactNode }) {
  return (
    <Card className="bw-library-panel">
      <SectionLabel>{heading}</SectionLabel>
      {empty ? <p className="bw-library-panel__empty">{empty}</p> : children}
    </Card>
  );
}

/**
 * Landing lists below the current workflow: past workflows (save as template),
 * saved templates and samples (use). Using one over an existing workflow asks first.
 */
export default function WorkflowLibrary({
  past,
  savedPastIds,
  templates,
  hasWorkflow,
  busy,
  onSavePast,
  onDeleteTemplate,
  onUse,
}: {
  past: PastWorkflow[];
  savedPastIds: string[];
  templates: SavedTemplate[];
  /** True when a workflow is being built, so using a template replaces it. */
  hasWorkflow: boolean;
  busy: boolean;
  onSavePast: (pastWorkflowId: string) => Promise<void>;
  /** Reports its own errors. */
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onUse: (snapshot: WorkflowSnapshot) => Promise<void>;
}) {
  const [saving, setSaving] = useState<PastWorkflow | null>(null);
  const [replacing, setReplacing] = useState<WorkflowSnapshot | null>(null);
  const [deleting, setDeleting] = useState<SavedTemplate | null>(null);

  function use(snapshot: WorkflowSnapshot) {
    if (hasWorkflow) setReplacing(snapshot);
    else void onUse(snapshot);
  }

  return (
    <>
      <LibraryPanel heading="Past workflows" empty={past.length > 0 ? null : "Workflows you end appear here."}>
        <div className="bw-library-list">
          {past.map((workflow) => {
            const saved = savedPastIds.includes(workflow.id);
            return (
              <LibraryRow
                key={workflow.id}
                title={workflow.title}
                meta={`${plural(workflow.rounds.length, "round")} · ended ${new Date(workflow.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                action={
                  <Button variant="secondary" size="sm" disabled={saved} onClick={() => setSaving(workflow)}>
                    {saved ? "Saved" : "Save Workflow"}
                  </Button>
                }
              />
            );
          })}
        </div>
      </LibraryPanel>

      <LibraryPanel heading="Saved templates" empty={templates.length > 0 ? null : "Past workflows you save appear here."}>
        <div className="bw-library-list">
          {templates.map((template) => (
            <LibraryRow
              key={template.id}
              title={template.title}
              meta={`${plural(template.rounds.length, "round")} · ${plural(roomCount(template), "room")} · ${plural(activityCount(template), "activity", "activities")}`}
              action={
                <div className="bw-library-row__actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="bw-button--danger-text"
                    disabled={busy}
                    onClick={() => setDeleting(template)}
                  >
                    Delete
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => use(template)}>
                    Use this workflow
                  </Button>
                </div>
              }
            />
          ))}
        </div>
      </LibraryPanel>

      <LibraryPanel heading="Start from a template" empty={null}>
        <div className="bw-template-list">
          {ROUND_TEMPLATES.map((template) => (
            <button
              type="button"
              key={template.name}
              className="bw-template"
              disabled={busy}
              onClick={() => use(sampleSnapshot(template, SAMPLE_TITLE))}
            >
              <span className="bw-template__name">{template.name}</span>
              <span className="bw-template__meta">
                {template.rounds.length} rounds ·{" "}
                {formatClock(template.rounds.reduce((sum, round) => sum + round.durationSec, 0))}
              </span>
            </button>
          ))}
        </div>
      </LibraryPanel>

      {saving ? (
        <SaveTemplateModal
          title={saving.title}
          rounds={saving.rounds.length}
          rooms={roomCount(saving)}
          activities={activityCount(saving)}
          onConfirm={() => onSavePast(saving.id)}
          onClose={() => setSaving(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmModal
          title={`Delete ${deleting.title}?`}
          message="This saved template is removed and cannot be brought back."
          confirmLabel="Delete"
          onConfirm={() => onDeleteTemplate(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      ) : null}

      {replacing ? (
        <ConfirmModal
          title="Replace your workflow?"
          message="The workflow you are building is replaced: its rounds, rooms, tasks and activities are removed."
          confirmLabel="Replace"
          onConfirm={() => onUse(replacing)}
          onClose={() => setReplacing(null)}
        />
      ) : null}
    </>
  );
}
