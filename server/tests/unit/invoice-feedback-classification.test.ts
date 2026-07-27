import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOMATIC_ENRICHMENT_REASON,
  classifyHeaderFeedback,
  classifyLineFeedback,
} from "../../modules/invoice-extraction/domain/feedback-classification";

const line = {
  description: "GASKET TURBOCHARGER OIL RETURN LINE",
  vendorPartNumber: "DDE A5411870080",
  quantity: "1",
  unitCost: "7.74",
  classification: "unknown",
};

test("default USD is automatic enrichment rather than a manual correction", () => {
  assert.deepEqual(classifyHeaderFeedback("currency", null, "USD"), {
    decision: "corrected",
    reason: AUTOMATIC_ENRICHMENT_REASON,
  });
});

test("an inferred stock type is automatic enrichment when invoice values are unchanged", () => {
  assert.deepEqual(
    classifyLineFeedback(line, {
      ...line,
      quantity: "1.000000",
      unitCost: "7.7400",
      classification: "inventory",
    }),
    {
      decision: "corrected",
      reason: AUTOMATIC_ENRICHMENT_REASON,
    },
  );
});

test("an edited invoice value remains a correction", () => {
  assert.deepEqual(
    classifyLineFeedback(line, {
      ...line,
      description: "Different description",
      classification: "inventory",
    }),
    { decision: "corrected", reason: null },
  );
});

test("unchanged numeric values with database precision are accepted", () => {
  assert.deepEqual(
    classifyLineFeedback(
      { ...line, classification: "inventory" },
      {
        ...line,
        quantity: "1.000000",
        unitCost: "7.7400",
        classification: "inventory",
      },
    ),
    { decision: "accepted", reason: null },
  );
});
