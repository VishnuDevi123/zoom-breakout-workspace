/** App mark in every header. Clickable when a screen can return to the landing page. */
export default function BrandMark({ onHome }: { onHome?: () => void }) {
  if (!onHome) return <span className="bw-brand-mark">B</span>;
  return (
    <button type="button" className="bw-brand-mark bw-brand-mark--link" title="Back to Home Page" onClick={onHome}>
      B
    </button>
  );
}
