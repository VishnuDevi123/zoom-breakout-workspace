"use client";

import type { RoomStatus } from "@/types/breakout";

import RoomStatusOptions from "./RoomStatusOptions";
import { Button, Modal } from "./ui";

/** The reminder skips rooms already done, so only these two cases reach it. */
const MESSAGES: Record<RoomStatus, string> = {
  onTrack: "Does your room need more time, or is it done? Let your host know.",
  moreTime: "Your host sees that your room needs more time. Still the case?",
  done: "Your host sees that your room is done.",
};

/**
 * Pops for the room in the round's last minute, so nobody forgets to tell the
 * host they need more time. A tap saves the status and closes; the pressed one stays as it is.
 */
export default function RoomStatusReminder({
  current,
  onChoose,
  onClose,
}: {
  current: RoomStatus;
  onChoose: (status: RoomStatus) => void;
  onClose: () => void;
}) {
  return (
    <Modal label="One minute left" size="sm" onClose={onClose}>
      {(close) => (
        <>
          <div className="bw-overlay__body">
            <span className="bw-modal-title">One minute left</span>
            <p className="bw-confirm-message">{MESSAGES[current]}</p>
            <RoomStatusOptions
              current={current}
              onChoose={(status) => {
                // Here a tap on the pressed toggle answers "still the case": keep it and close.
                if (status !== "onTrack") onChoose(status);
                close();
              }}
            />
          </div>
          <footer className="bw-overlay__footer bw-overlay__footer--end">
            <Button variant="secondary" size="sm" onClick={close}>
              Close
            </Button>
          </footer>
        </>
      )}
    </Modal>
  );
}
