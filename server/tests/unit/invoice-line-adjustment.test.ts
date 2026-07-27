import assert from "node:assert/strict";
import test from "node:test";
import type { InvoiceProposal } from "@shared/invoice-extraction/contracts";
import { classifyInvoiceProposalLine } from "../../modules/invoice-extraction/domain/invoice-line-classification";
import { reconcileInvoiceMoney } from "../../modules/invoice-extraction/domain/invoice-money";
import { applyLandedCosts } from "../../modules/inventory-receiving/inventory-intake-mappers";

const observed = (value: string | null) => ({
  observed: value,
  normalized: value,
  confidence: 0.99,
  sourceAssetId: null,
  sourcePage: 1,
});

function line(input: {
  description: string;
  partNumber: string;
  quantity: string;
  unitCost: string;
  lineTotal: string;
}): InvoiceProposal["lines"][number] {
  return {
    description: observed(input.description),
    vendorPartNumber: observed(input.partNumber),
    quantity: observed(input.quantity),
    unitCost: observed(input.unitCost),
    lineTotal: observed(input.lineTotal),
    classification: { kind: "inventory", confidence: 0.9 },
  };
}

test("CORE charges and returns are deterministic financial adjustments", () => {
  assert.equal(
    classifyInvoiceProposalLine(
      line({
        description: "BRAKE SHOE KIT",
        partNumber: "104F/ABP MK4711Q 20STAN-CORE",
        quantity: "2",
        unitCost: "55.00",
        lineTotal: "110.00",
      }),
    ),
    "adjustment",
  );
  assert.equal(
    classifyInvoiceProposalLine(
      line({
        description: "BRAKE SHOE KIT",
        partNumber: "104F/ABP MK4711Q 20STAN-CORE",
        quantity: "-2",
        unitCost: "45.00",
        lineTotal: "-90.00",
      }),
    ),
    "adjustment",
  );
});

test("Freightliner CORE invoice reconciles and lands only on received stock", () => {
  const reconciliation = reconcileInvoiceMoney({
    lines: [
      { quantity: "2", unitCost: "61.80" },
      { quantity: "2", unitCost: "55.00" },
      { quantity: "-2", unitCost: "45.00" },
    ],
    observedSubtotal: "143.60",
    observedTax: "11.86",
    observedFreight: null,
    observedTotal: "155.46",
    toleranceCents: 1,
  });
  assert.equal(reconciliation.calculatedSubtotal, "143.60");
  assert.equal(reconciliation.calculatedTotal, "155.46");
  assert.equal(reconciliation.withinTolerance, true);

  const [received] = applyLandedCosts(
    [{
      partNameSnapshot: "BRAKE SHOE KIT",
      partNumberSnapshot: "104F/ABP MK4711Q 20STAN",
      itemType: "consumable",
      qty: 2,
      unitCost: "61.80",
      lineTotal: "123.60",
    }],
    "11.86",
    "0.00",
    "20.00",
  );
  assert.equal(received.landedCost, "77.7300");
});
