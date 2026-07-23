import assert from "node:assert/strict";
import test from "node:test";
import { scoreInvoiceEvaluation } from "../../modules/invoice-extraction/domain/invoice-evaluation";

const document = {
  header: {
    vendorName: "Acme",
    invoiceNumber: "INV-1",
    invoiceDate: "2026-07-23",
    currency: "USD",
    subtotal: "10.00",
    tax: "0.00",
    freight: "0.00",
    total: "10.00",
  },
  lines: [
    {
      description: "Brake pad",
      vendorPartNumber: "BP-1",
      quantity: "1",
      unitCost: "10.00",
    },
  ],
};

test("evaluation scoring is reproducible and exposes critical regressions", () => {
  const perfect = scoreInvoiceEvaluation([
    { fixtureKey: "synthetic-1", expected: document, prediction: document },
  ]);
  assert.equal(perfect.headerFields.accuracy, 1);
  assert.equal(perfect.lines.precision, 1);
  assert.equal(perfect.documentsExact.rate, 1);
  assert.deepEqual(perfect.criticalRegressions, []);
  assert.equal(perfect.insufficientForThreshold, true);

  const regression = scoreInvoiceEvaluation([
    {
      fixtureKey: "synthetic-1",
      expected: document,
      prediction: {
        ...document,
        header: { ...document.header, invoiceNumber: "INV-2", total: "11.00" },
        lines: [],
      },
    },
  ]);
  assert.equal(regression.lines.recall, 0);
  assert.deepEqual(regression.criticalRegressions, [
    { fixtureKey: "synthetic-1", field: "invoiceNumber" },
    { fixtureKey: "synthetic-1", field: "total" },
  ]);
});
