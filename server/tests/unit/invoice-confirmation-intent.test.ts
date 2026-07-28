import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalPayloadHash,
  normalizedInvoiceIdentity,
  stockUnitDelta,
} from "../../modules/invoice-extraction/domain/confirmation-intent";

test("canonical confirmation hashes ignore object insertion order but not values", () => {
  const first = canonicalPayloadHash({
    revision: 3,
    summary: { total: "10.00", vendor: "Acme" },
  });
  const reordered = canonicalPayloadHash({
    summary: { vendor: "Acme", total: "10.00" },
    revision: 3,
  });
  assert.equal(first, reordered);
  assert.notEqual(
    first,
    canonicalPayloadHash({
      summary: { vendor: "Acme", total: "11.00" },
      revision: 3,
    }),
  );
});

test("supplier invoice identity is normalized and absent without invoice number", () => {
  assert.equal(
    normalizedInvoiceIdentity("  Fréight-Liner Parts ", " INV / 001 "),
    "freightlinerparts:inv001",
  );
  assert.equal(normalizedInvoiceIdentity("Vendor", null), null);
  assert.equal(normalizedInvoiceIdentity("Vendor", "   "), null);
});

test("stock delta uses decimal arithmetic rather than binary floats", () => {
  assert.equal(
    stockUnitDelta([{ quantity: "0.1" }, { quantity: "0.2" }]),
    "0.3",
  );
  assert.equal(stockUnitDelta([{ quantity: "2.500000" }]), "2.5");
  assert.equal(
    stockUnitDelta([
      { quantity: "2", resolution: { kind: "existing" } },
      { quantity: "3", resolution: { kind: "service" } },
      { quantity: "4", resolution: { kind: "direct_expense" } },
      { quantity: "2", resolution: { kind: "adjustment" } },
      { quantity: "-2", resolution: { kind: "adjustment" } },
    ]),
    "2",
  );
});
