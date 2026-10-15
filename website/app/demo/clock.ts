/** "m:ss", as the app's round clock shows it. */
export function formatClock(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
