export interface StatusDotProps {
  /** Any token colour. Room dots come from ROOM_DOTS in types/breakout.ts. */
  color: string;
  /** Circular 7px dot instead of the 10px squircle used on room cards. */
  round?: boolean;
  /** Pulsing halo, reused from the Live treatment on screen 06. */
  pulse?: boolean;
  className?: string;
}

export default function StatusDot({
  color,
  round = false,
  pulse = false,
  className,
}: StatusDotProps) {
  const classes = [
    "bw-dot",
    round ? "bw-dot--round" : "",
    pulse ? "bw-dot--pulse" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classes} style={{ background: color }} />;
}
