const SDK_TIMEOUT_MS = 12_000;

/** Bound one SDK mutation so an unresponsive Zoom bridge cannot lock the UI forever. */
export async function withZoomTimeout<T>(
  label: string,
  operation: Promise<T>,
  timeoutMs = SDK_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out. Live state will be re-read.`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
