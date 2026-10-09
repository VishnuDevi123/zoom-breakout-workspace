"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  deleteTemplate,
  readPastWorkflows,
  readTemplates,
  saveCurrentAsTemplate,
  saveTemplate,
} from "@/lib/execution-api";
import type { PastWorkflow, SavedTemplate } from "@/types/breakout";

/**
 * The landing page's lists: workflows this meeting ended and the host's saved
 * templates. Kept apart from use-workspace, which owns the one current workflow.
 */
export function useWorkflowLibrary(parentUUID: string, hostUUID: string) {
  const [past, setPast] = useState<PastWorkflow[]>([]);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  // Past workflows saved in this app session, so Save Workflow is not pressed twice.
  const [savedPastIds, setSavedPastIds] = useState<string[]>([]);

  useEffect(() => {
    readPastWorkflows(parentUUID)
      .then(setPast)
      .catch((error: unknown) =>
        toast.error("Could not load past workflows.", { description: error instanceof Error ? error.message : undefined }),
      );
  }, [parentUUID]);

  useEffect(() => {
    if (!hostUUID) return;
    readTemplates(hostUUID)
      .then(setTemplates)
      .catch((error: unknown) =>
        toast.error("Could not load saved templates.", { description: error instanceof Error ? error.message : undefined }),
      );
  }, [hostUUID]);

  async function savePast(pastWorkflowId: string): Promise<void> {
    const saved = await saveTemplate({ parentUUID, pastWorkflowId, hostUUID });
    setTemplates((current) => [saved, ...current]);
    setSavedPastIds((current) => [...current, pastWorkflowId]);
  }

  /** The workflow being built, as the server holds it now. */
  async function saveCurrent(): Promise<void> {
    const saved = await saveCurrentAsTemplate({ parentUUID, hostUUID });
    setTemplates((current) => [saved, ...current]);
  }

  async function removeTemplate(templateId: string): Promise<void> {
    setTemplates(await deleteTemplate(hostUUID, templateId));
  }

  return { past, templates, savedPastIds, showPast: setPast, savePast, saveCurrent, removeTemplate };
}
