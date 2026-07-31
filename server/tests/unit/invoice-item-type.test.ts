import assert from "node:assert/strict";
import test from "node:test";
import { resolveInvoiceItemType } from "../../../client/src/features/invoice-extraction/invoice-item-type";

test("an existing catalog part type overrides an unknown AI classification", () => {
  assert.deepEqual(
    resolveInvoiceItemType({
      classification: "unknown",
      selectedPartType: "inventory",
    }),
    { itemType: "inventory", needsReview: false },
  );
  assert.deepEqual(
    resolveInvoiceItemType({
      classification: "unknown",
      selectedPartType: "consumable",
    }),
    { itemType: "consumable", needsReview: false },
  );
});

test("an existing catalog part remains authoritative over an AI disagreement", () => {
  assert.deepEqual(
    resolveInvoiceItemType({
      classification: "consumable",
      selectedPartType: "inventory",
    }),
    { itemType: "inventory", needsReview: false },
  );
});

test("a confident AI type is accepted for an unlinked line", () => {
  assert.deepEqual(
    resolveInvoiceItemType({ classification: "consumable" }),
    { itemType: "consumable", needsReview: false },
  );
});

test("an unknown unlinked line still requires human review", () => {
  assert.deepEqual(
    resolveInvoiceItemType({
      classification: "unknown",
      proposedPartType: "inventory",
    }),
    { itemType: "inventory", needsReview: true },
  );
});

test("financial adjustments never require an inventory type decision", () => {
  assert.deepEqual(
    resolveInvoiceItemType({
      classification: "adjustment",
      selectedPartType: "inventory",
    }),
    { itemType: "adjustment", needsReview: false },
  );
});

test("service and labor lines never require a stock type decision", () => {
  assert.deepEqual(
    resolveInvoiceItemType({ classification: "service" }),
    { itemType: "service", needsReview: false },
  );
});

test("direct expenses never require a stock type decision", () => {
  assert.deepEqual(
    resolveInvoiceItemType({ classification: "direct_expense" }),
    { itemType: "service", needsReview: false },
  );
});
