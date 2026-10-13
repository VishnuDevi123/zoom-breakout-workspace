import { Spinner } from "../ui";

/**
 * The one screen shown while the app starts, for host and participant alike:
 * Zoom's role check, then the data the first real page needs. Nothing else
 * renders until then, so no in-between page flashes on the way.
 */
export default function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="bw-shell bw-loading" role="status" aria-live="polite">
      <div className="bw-loading__mark">
        <Spinner large />
        <span className="bw-loading__message">{message}</span>
        <span className="bw-loading__hint">Hang tight, this takes a few seconds.</span>
      </div>
    </div>
  );
}
