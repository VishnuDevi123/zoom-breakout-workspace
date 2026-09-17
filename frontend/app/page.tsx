import ZoomClient from "./components/ZoomClient";

/**
 * The page renders the gate and nothing else. Which screen the user gets is
 * decided by ZoomClient from the Zoom SDK, so the host shell is never rendered
 * to somebody whose role has not been read yet.
 */
export default function Home() {
  return <ZoomClient />;
}
