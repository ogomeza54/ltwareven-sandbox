import assert from "node:assert/strict";
import test from "node:test";
import type { InvoiceProposal } from "@shared/invoice-extraction/contracts";
import { reconcileInvoiceDescriptions } from "../../modules/invoice-extraction/domain/invoice-description-reconciliation";

const observed = (value: string | null, sourcePage = 2) => ({
  observed: value,
  normalized: value,
  confidence: 0.95,
  sourceAssetId: "444044b7-03ed-4168-b536-c5cea9ea3aa2",
  sourcePage,
});

function line(input: {
  description: string;
  reference: string;
  quantity?: string;
  unitCost?: string;
  lineTotal?: string;
  sourcePage?: number;
}): InvoiceProposal["lines"][number] {
  return {
    description: observed(input.description, input.sourcePage),
    vendorPartNumber: observed(input.reference, input.sourcePage),
    quantity: observed(input.quantity ?? "1", input.sourcePage),
    unitCost: observed(input.unitCost ?? "7.74", input.sourcePage),
    lineTotal: observed(input.lineTotal ?? "7.74", input.sourcePage),
    classification: { kind: "inventory", confidence: 0.95 },
  };
}

function proposal(lines: InvoiceProposal["lines"]): InvoiceProposal {
  const empty = observed(null, 1);
  return {
    schemaVersion: "invoice-proposal-v1",
    header: {
      vendorName: empty,
      invoiceNumber: empty,
      invoiceDate: empty,
      currency: empty,
      subtotal: empty,
      tax: empty,
      freight: empty,
      total: empty,
    },
    lines,
    uncertainties: [],
  };
}

test("uses the complete description from another page for the same commercial line", () => {
  const result = reconcileInvoiceDescriptions(proposal([
    line({
      description: "GASKET TURBOCHARGER OIL R",
      reference: "DDE A5411870080",
      sourcePage: 2,
    }),
    line({
      description: "GASKET TURBOCHARGER OIL RETURN LINE",
      reference: "DDE-A5411870080",
      sourcePage: 1,
    }),
  ]));

  assert.equal(
    result.lines[0].description.normalized,
    "GASKET TURBOCHARGER OIL RETURN LINE",
  );
  assert.equal(result.lines[0].description.sourcePage, 1);
});

test("does not borrow a description from another reference or price", () => {
  const result = reconcileInvoiceDescriptions(proposal([
    line({ description: "GASKET TURBOCHARGER OIL R", reference: "PART-A" }),
    line({
      description: "GASKET TURBOCHARGER OIL RETURN LINE",
      reference: "PART-B",
      sourcePage: 1,
    }),
    line({
      description: "GASKET TURBOCHARGER OIL RETURN LINE PREMIUM",
      reference: "PART-A",
      unitCost: "9.99",
      lineTotal: "9.99",
      sourcePage: 1,
    }),
  ]));

  assert.equal(result.lines[0].description.normalized, "GASKET TURBOCHARGER OIL R");
  assert.equal(result.lines[0].description.sourcePage, 2);
});

test("does not replace a complete description with unrelated longer text", () => {
  const result = reconcileInvoiceDescriptions(proposal([
    line({ description: "METAL SEAL", reference: "DDE-A47" }),
    line({
      description: "COMPLETELY DIFFERENT METAL COMPONENT",
      reference: "DDE-A47",
      sourcePage: 1,
    }),
  ]));

  assert.equal(result.lines[0].description.normalized, "METAL SEAL");
});
