import assert from "node:assert/strict";
import test from "node:test";
import { linkInvoiceLineToStock } from "../../../client/src/features/invoice-extraction/invoice-line-linking";

test("linking an extracted invoice line preserves its scanned price", () => {
  const linked = linkInvoiceLineToStock(
    {
      partNameSnapshot: "FUEL LINE KIT",
      partNumberSnapshot: "OCR-REFERENCE",
      itemType: "inventory",
      classificationNeedsReview: true,
      lotPrice: "64.99",
      lineTotal: "64.99",
    },
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "FUEL LINE KT",
      partNumber: "DDE A0000701432",
      itemType: "inventory",
    },
  );

  assert.equal(linked.partId, "00000000-0000-4000-8000-000000000001");
  assert.equal(linked.partNameSnapshot, "FUEL LINE KT");
  assert.equal(linked.partNumberSnapshot, "DDE A0000701432");
  assert.equal(linked.lotPrice, "64.99");
  assert.equal(linked.lineTotal, "64.99");
  assert.equal(linked.classificationNeedsReview, false);
});
