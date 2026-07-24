import assert from "node:assert/strict";
import test from "node:test";
import {
  formatExtractionSeconds,
  invoiceExtractionTiming,
} from "../../../client/src/features/invoice-extraction/extraction-timing";

test("extraction timing separates queue, processing and total server time", () => {
  assert.deepEqual(
    invoiceExtractionTiming(
      {
        createdAt: "2026-07-24T10:00:00.000Z",
        startedAt: "2026-07-24T10:00:01.250Z",
        completedAt: "2026-07-24T10:00:05.750Z",
      },
      Date.parse("2026-07-24T10:01:00.000Z"),
    ),
    {
      queueMs: 1_250,
      processingMs: 4_500,
      totalMs: 5_750,
    },
  );
});

test("extraction timing remains live before processing starts or completes", () => {
  assert.deepEqual(
    invoiceExtractionTiming(
      {
        createdAt: "2026-07-24T10:00:00.000Z",
        startedAt: null,
        completedAt: null,
      },
      Date.parse("2026-07-24T10:00:02.000Z"),
    ),
    { queueMs: 2_000, processingMs: null, totalMs: 2_000 },
  );
  assert.equal(formatExtractionSeconds(null), "Not started");
  assert.equal(formatExtractionSeconds(2_040), "2.0 s");
  assert.equal(formatExtractionSeconds(25), "<0.1 s");
});
