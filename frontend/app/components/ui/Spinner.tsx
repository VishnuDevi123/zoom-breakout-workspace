/** Turning ring for work in progress. Inherits the text colour of its parent. */
export default function Spinner({ large = false }: { large?: boolean }) {
  return <span className={large ? "bw-spinner bw-spinner--lg" : "bw-spinner"} aria-hidden />;
}
