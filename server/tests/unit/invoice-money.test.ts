import assert from "node:assert/strict";
import test from "node:test";
import {
  InvoiceNumericError,
  lineExtensionCents,
  centsToDecimal,
  normalizeQuantity,
  normalizeUnitCost,
  reconcileInvoiceMoney,
} from "../../modules/invoice-extraction/domain/invoice-money";

test("invoice money rounds each line half-up before summing", () => {
  assert.equal(centsToDecimal(lineExtensionCents("3", "10.005")), "30.02");
  const result = reconcileInvoiceMoney({
    lines: [
      { quantity: "1", unitCost: "0.005" },
      { quantity: "1", unitCost: "0.005" },
    ],
    observedSubtotal: "0.02",
    observedTax: "0.01",
    observedFreight: "0.02",
    observedTotal: "0.05",
    toleranceCents: 1,
  });
  assert.deepEqual(result.lineTotals, ["0.01", "0.01"]);
  assert.equal(result.calculatedSubtotal, "0.02");
  assert.equal(result.calculatedTotal, "0.05");
  assert.equal(result.difference, "0.00");
  assert.equal(result.withinTolerance, true);
});

test("reconciliation uses explicit tolerance and remains incomplete for missing values", () => {
  const within = reconcileInvoiceMoney({
    lines: [{ quantity: "2.5", unitCost: "4.0000" }],
    observedSubtotal: "10.00",
    observedTax: null,
    observedFreight: null,
    observedTotal: "10.01",
    toleranceCents: 1,
  });
  assert.equal(within.calculatedTotal, "10.00");
  assert.equal(within.difference, "0.01");
  assert.equal(within.withinTolerance, true);
  const incomplete = reconcileInvoiceMoney({
    lines: [{ quantity: null, unitCost: "4.00" }],
    observedSubtotal: null,
    observedTax: null,
    observedFreight: null,
    observedTotal: null,
    toleranceCents: 1,
  });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.calculatedTotal, null);
  assert.equal(incomplete.withinTolerance, false);
});

test("numeric validation rejects negative, exponent, excessive precision, zero quantity and overflow", () => {
  for (const operation of [
    () => normalizeQuantity("0"),
    () => normalizeQuantity("-1"),
    () => normalizeQuantity("1e3"),
    () => normalizeQuantity("1.1234567"),
    () => normalizeQuantity("123456789012345"),
    () => normalizeUnitCost("1.12345"),
    () => normalizeUnitCost("NaN"),
  ]) {
    assert.throws(operation, InvoiceNumericError);
  }
});
