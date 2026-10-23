import assert from "node:assert/strict";
import test from "node:test";

import { withZoomTimeout } from "../lib/zoom-call.ts";

test("Zoom call returns a result before its deadline", async () => {
  assert.equal(await withZoomTimeout("Rename", Promise.resolve("done"), 10), "done");
});

test("Zoom call reports the unfinished step after timeout", async () => {
  const never = new Promise<never>(() => undefined);
  await assert.rejects(
    withZoomTimeout("Assign Ada", never, 5),
    /Assign Ada timed out\. Live state will be re-read\./,
  );
});
