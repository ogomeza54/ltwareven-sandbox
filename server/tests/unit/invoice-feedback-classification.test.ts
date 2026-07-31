import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOMATIC_ENRICHMENT_REASON,
  classifyHeaderFeedback,
  classifyLineFieldFeedback,
} from "../../modules/invoice-extraction/domain/feedback-classification";

test("default USD is automatic enrichment rather than a manual correction", () => {
  assert.deepEqual(classifyHeaderFeedback("currency", null, "USD"), {
    decision: "added",
    reason: AUTOMATIC_ENRICHMENT_REASON,
  });
});

test("zero tax and freight defaults are automatic enrichments", () => {
  assert.deepEqual(
    classifyHeaderFeedback("tax", null, "0.00"),
    {
      decision: "added",
      reason: AUTOMATIC_ENRICHMENT_REASON,
    },
  );
});

test("an inferred stock type can be marked as automatic enrichment", () => {
  assert.deepEqual(
    classifyLineFieldFeedback("classification", "unknown", "inventory", true),
    {
      decision: "corrected",
      reason: AUTOMATIC_ENRICHMENT_REASON,
    },
  );
});

test("an edited line field remains a correction", () => {
  assert.deepEqual(
    classifyLineFieldFeedback("description", "Fuel filter", "Fuel filters"),
    { decision: "corrected", reason: null },
  );
});

test("unchanged numeric fields with database precision are accepted", () => {
  assert.deepEqual(
    classifyLineFieldFeedback("unitCost", "7.74", "7.7400"),
    { decision: "accepted", reason: null },
  );
});
