import test from "node:test";
import assert from "node:assert/strict";

import {
  isCompletedLraQueueItem,
  lraQueueBucket,
  type LraQueueClassifyInput,
} from "../queue-classify";

function item(
  overrides: Partial<LraQueueClassifyInput> = {},
): LraQueueClassifyInput {
  return {
    applicationStatus: "release_signing",
    blocker: "Pending: release path selection",
    releaseFileStatus: "awaiting_path",
    ...overrides,
  };
}

test("completed only when release file is closed, not merely released", () => {
  assert.equal(
    isCompletedLraQueueItem(item({ releaseFileStatus: "released" })),
    false,
  );
  assert.equal(
    isCompletedLraQueueItem(
      item({
        applicationStatus: "released",
        blocker: "Released",
        releaseFileStatus: "released",
      }),
    ),
    false,
  );
  assert.equal(
    isCompletedLraQueueItem(item({ releaseFileStatus: "closed" })),
    true,
  );
});

test("completed when application is paid_off or closed", () => {
  assert.equal(
    isCompletedLraQueueItem(
      item({ applicationStatus: "paid_off", releaseFileStatus: null }),
    ),
    true,
  );
  assert.equal(
    isCompletedLraQueueItem(
      item({ applicationStatus: "closed", releaseFileStatus: null }),
    ),
    true,
  );
});

test("active awaiting_path buckets as setup", () => {
  assert.equal(isCompletedLraQueueItem(item()), false);
  assert.equal(lraQueueBucket(item()), "setup");
});

test("awaiting_signatures buckets as setup (LRA-facilitated signing)", () => {
  assert.equal(
    lraQueueBucket(
      item({
        releaseFileStatus: "awaiting_signatures",
        blocker: "Pending: document signatures",
      }),
    ),
    "setup",
  );
});

test("awaiting_briefing buckets as briefing (Briefer check-off)", () => {
  assert.equal(
    lraQueueBucket(
      item({
        releaseFileStatus: "awaiting_briefing",
        blocker: "Documents signed, awaiting briefing",
      }),
    ),
    "briefing",
  );
});

test("ready_release and released (awaiting close) bucket as ready", () => {
  assert.equal(
    lraQueueBucket(
      item({
        releaseFileStatus: "ready_release",
        blocker: "Documents signed, awaiting check release",
      }),
    ),
    "ready",
  );
  assert.equal(
    lraQueueBucket(
      item({
        applicationStatus: "released",
        blocker: "Released",
        releaseFileStatus: "released",
      }),
    ),
    "ready",
  );
});

test("completed items bucket as completed", () => {
  assert.equal(
    lraQueueBucket(item({ releaseFileStatus: "closed" })),
    "completed",
  );
});
