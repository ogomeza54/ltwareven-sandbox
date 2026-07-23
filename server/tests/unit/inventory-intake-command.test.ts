import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { normalizeInventoryIntakeRequest } from "../../modules/inventory-receiving/inventory-intake-command";

const validBody = {
  vendor: "  Fleet Supply  ",
  subtotal: "10",
  taxAmount: "1",
  deliveryFee: "2",
  totalAmount: "13",
  items: [
    {
      partNameSnapshot: "Filter",
      partNumberSnapshot: "F-1",
      qty: 1,
      unitCost: "10",
      lineTotal: "10",
    },
  ],
};

describe("normalizeInventoryIntakeRequest", () => {
  test("preserves trimming, defaults and matched reconciliation", () => {
    const command = normalizeInventoryIntakeRequest(validBody);
    assert.equal(command.header.vendor, "Fleet Supply");
    assert.equal(command.header.reconciliationStatus, "matched");
    assert.equal(command.header.quickbooksSyncStatus, "not_synced");
    assert.equal(command.items[0]?.partNumberSnapshot, "F-1");
  });

  test("uses warning for zero entered total and mismatches", () => {
    assert.equal(
      normalizeInventoryIntakeRequest({ ...validBody, totalAmount: "0" }).header
        .reconciliationStatus,
      "warning",
    );
    assert.equal(
      normalizeInventoryIntakeRequest({ ...validBody, totalAmount: "14" })
        .header.reconciliationStatus,
      "warning",
    );
  });

  test("preserves existing validation messages", () => {
    assert.throws(
      () => normalizeInventoryIntakeRequest({ ...validBody, vendor: " " }),
      /Vendor is required/,
    );
    assert.throws(
      () => normalizeInventoryIntakeRequest({ ...validBody, items: [] }),
      /At least one line item is required/,
    );
    assert.throws(
      () =>
        normalizeInventoryIntakeRequest({
          ...validBody,
          items: [{ partNameSnapshot: "Filter", qty: 0 }],
        }),
      /quantity ≥ 1/,
    );
    assert.throws(
      () =>
        normalizeInventoryIntakeRequest({
          ...validBody,
          items: [
            {
              partNameSnapshot: "Filter",
              qty: 1,
              itemType: "service",
            },
          ],
        }),
      /itemType must be/,
    );
  });

  test("whitelists tenant, actor, stock and QB fields", () => {
    const command = normalizeInventoryIntakeRequest({
      ...validBody,
      companyId: "forged-company",
      createdByUserId: "forged-user",
      quickbooksId: "forged-qb",
      items: [
        {
          ...validBody.items[0],
          companyId: "forged-company",
          quantityInStock: 999,
          qbAmount: "999",
        },
      ],
    });
    assert.equal("companyId" in command.header, false);
    assert.equal("createdByUserId" in command.header, false);
    assert.equal(command.header.quickbooksId, null);
    assert.equal("companyId" in command.items[0]!, false);
    assert.equal("quantityInStock" in command.items[0]!, false);
    assert.equal("qbAmount" in command.items[0]!, false);
  });

  test("rejects malformed identifiers instead of treating them as absent", () => {
    for (const key of ["partId", "groupId", "subgroupId"] as const) {
      assert.throws(
        () =>
          normalizeInventoryIntakeRequest({
            ...validBody,
            items: [{ ...validBody.items[0], [key]: 123 }],
          }),
        new RegExp(`${key} must be a string`),
      );
    }
  });

  test("does not coerce arrays or booleans into stock quantities", () => {
    for (const qty of [true, [2]]) {
      assert.throws(
        () =>
          normalizeInventoryIntakeRequest({
            ...validBody,
            items: [{ ...validBody.items[0], qty }],
          }),
        /qty must be a number or numeric string/,
      );
    }
  });

  test("preserves scalar part numbers as their PostgreSQL text value", () => {
    const command = normalizeInventoryIntakeRequest({
      ...validBody,
      items: [{ ...validBody.items[0], partNumberSnapshot: 123 }],
    });
    assert.equal(command.items[0]?.partNumberSnapshot, "123");
  });

  test("records current numeric edge behavior", () => {
    assert.throws(
      () =>
        normalizeInventoryIntakeRequest({
          ...validBody,
          items: [{ ...validBody.items[0], qty: -1 }],
        }),
      /quantity ≥ 1/,
    );
    assert.equal(
      normalizeInventoryIntakeRequest({
        ...validBody,
        items: [{ ...validBody.items[0], qty: 1.5 }],
      }).items[0]?.qty,
      1.5,
    );
    assert.equal(
      normalizeInventoryIntakeRequest({
        ...validBody,
        subtotal: "-100",
        totalAmount: "-100",
        taxAmount: "0",
        deliveryFee: "0",
      }).header.reconciliationStatus,
      "matched",
    );
  });
});
