import type { LiveOperationState } from "@/lib/use-live-room-controller";

import { Spinner } from "./ui";

const TITLES = { launch: "Starting the round", close: "Ending the round" };

/**
 * Dims the whole screen while Zoom opens or closes rooms. These take seconds,
 * and a second press or a stray edit meanwhile would race the SDK, so it cannot
 * be dismissed. The step text is the controller's own, never made up here.
 */
export default function ZoomActionOverlay({ operation }: { operation: LiveOperationState }) {
  if (operation.kind !== "running") return null;

  return (
    <div className="bw-overlay" role="alertdialog" aria-modal="true" aria-label={TITLES[operation.operation]}>
      <div className="bw-overlay__panel bw-overlay__panel--sm bw-zoom-progress" aria-live="polite">
        <Spinner large />
        <span className="bw-modal-title">{TITLES[operation.operation]}</span>
        <span className="bw-zoom-progress__step">{operation.step}</span>
      </div>
    </div>
  );
}
