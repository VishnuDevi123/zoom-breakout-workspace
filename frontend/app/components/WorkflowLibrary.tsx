"use client";

import { useState } from "react";

import { formatClock } from "@/lib/round-clock";
import { ROUND_TEMPLATES, sampleSnapshot } from "@/lib/round-templates";
import type { PastWorkflow, SavedTemplate, WorkflowSnapshot } from "@/types/breakout";

import SaveTemplateModal, { plural } from "./SaveTemplateModal";
import { Button, ConfirmModal } from "./ui";

/** Default title for a workflow started from a sample. */
const SAMPLE_TITLE = "Sample Workflow";

function roomCount(workflow: WorkflowSnapshot): number {
  return workflow.rounds.reduce((sum, round) => sum + round.roomNames.length, 0);
}

function activityCount(workflow: WorkflowSnapshot): number {
  return workflow.rounds.reduce((sum, round) => sum + round.activities.length, 0);
}

/** One workflow in a list: name, a summary line, its actions. */
function LibraryRow({ title, meta, action }: { title: string; meta: string; action: React.ReactNode }) {
  return (
    <div className="bw-library-row">
      <div className="bw-library-row__text">
        <span className="bw-library-row__title">{title}</span>
        <span className="bw-library-row__meta">{meta}</span>
      </div>
      {action}
    </div>
  );
}

type LibraryTab = "templates" | "saved" | "past";

function tabLabel(label: string, count: number): string {
  return count > 0 ? `${label} · ${count}` : label;
}

/**
 * Landing lists as tabs: samples and saved templates (use), past workflows
 * (save as template). Using one over an existing workflow asks first.
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
  const [tab, setTab] = useState<LibraryTab>("templates");
  const tabs: { id: LibraryTab; label: string }[] = [
    { id: "templates", label: "Templates" },
    { id: "saved", label: tabLabel("Saved", templates.length) },
    { id: "past", label: tabLabel("Past", past.length) },
  ];

  function use(snapshot: WorkflowSnapshot) {
    if (hasWorkflow) setReplacing(snapshot);
    else void onUse(snapshot);
  }

  return (
    <>
      <div className="bw-library">
        <div className="bw-tabs" role="tablist" aria-label="Workflow library">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className="bw-tabs__tab"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="bw-library-list" role="tabpanel">
          {tab === "templates"
            ? ROUND_TEMPLATES.map((template) => (
                <LibraryRow
                  key={template.name}
                  title={template.name}
                  meta={`${plural(template.rounds.length, "round")} · ${formatClock(template.rounds.reduce((sum, round) => sum + round.durationSec, 0))}`}
                  action={
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => use(sampleSnapshot(template, SAMPLE_TITLE))}>
                      Use
                    </Button>
                  }
                />
              ))
            : null}

          {tab === "saved" && templates.length === 0 ? <p className="bw-library-empty">Saved workflows appear here.</p> : null}
          {tab === "saved"
            ? templates.map((template) => (
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
                      <Button variant="secondary" size="sm" disabled={busy} onClick={() => use(template)}>
                        Use
                      </Button>
                    </div>
                  }
                />
              ))
            : null}

          {tab === "past" && past.length === 0 ? <p className="bw-library-empty">Workflows you end appear here.</p> : null}
          {tab === "past"
            ? past.map((workflow) => {
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
              })
            : null}
        </div>
      </div>

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
