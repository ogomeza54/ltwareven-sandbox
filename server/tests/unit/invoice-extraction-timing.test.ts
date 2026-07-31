import assert from "node:assert/strict";
import test from "node:test";
import {
  formatExtractionSeconds,
  invoiceExtractionProgress,
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

test("extraction progress estimates remaining AI time and finishes at 100 percent", () => {
  assert.deepEqual(
    invoiceExtractionProgress("processing", {
      queueMs: 250,
      processingMs: 5_000,
      totalMs: 5_250,
    }),
    { elapsedMs: 5_000, estimatedRemainingMs: 10_000, percent: 30 },
  );
  assert.deepEqual(
    invoiceExtractionProgress("completed", {
      queueMs: 250,
      processingMs: 14_200,
      totalMs: 14_450,
    }),
    { elapsedMs: 14_200, estimatedRemainingMs: 0, percent: 100 },
  );
  assert.deepEqual(
    invoiceExtractionProgress("processing", {
      queueMs: 0,
      processingMs: 20_000,
      totalMs: 20_000,
    }),
    { elapsedMs: 20_000, estimatedRemainingMs: null, percent: 95 },
  );
});
