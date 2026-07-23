/**
 * Storage-level tests for QuickBooks field completeness on inventory intake creation.
 *
 * Run with:  tsx --test server/tests/intake-qb-fields.test.ts
 *
 * Three layers of coverage — each one closer to the actual insert path:
 *
 *  1. buildIntakeQbFields   — pure helper that derives QB header fields from vendor + invoice number
 *  2. assertQbFieldsComplete — guard that rejects null/empty required fields
 *  3. buildLineItemInsertValues — the EXACT function createInventoryIntake uses to build
 *                                every `inventory_intake_items` insert record; testing it
 *                                exercises the real QB field propagation path without
 *                                requiring a live database connection.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildIntakeQbFields,
  assertQbFieldsComplete,
  buildLineItemInsertValues,
} from "../../modules/inventory-receiving/inventory-intake-mappers.js";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const SAMPLE_ITEM = {
  partNameSnapshot: "Air Filter",
  partNumberSnapshot: "AF-1234",
  qty: 5,
  unitCost: "12.50",
  lineTotal: "62.50",
};

const COMPANY_ID = "company-test-001";
const INTAKE_ID = "intake-test-001";

// ─── buildIntakeQbFields ──────────────────────────────────────────────────────

describe("buildIntakeQbFields", () => {
  test("populates all four required QB fields from vendor name", () => {
    const fields = buildIntakeQbFields("Acme Truck Parts", "INV-2026-001");

    assert.equal(fields.qbVendorName, "Acme Truck Parts");
    assert.equal(fields.qbTransactionType, "bill");
    assert.equal(fields.qbDebitAccount, "Inventory Asset");
    assert.equal(fields.qbCreditAccount, "Accounts Payable");
  });

  test("invoice number is preserved when provided", () => {
    const fields = buildIntakeQbFields("Vendor Co", "PO-9999");
    assert.equal(fields.qbInvoiceNumber, "PO-9999");
  });

  test("invoice number null → writes null, not undefined", () => {
    const fields = buildIntakeQbFields("Vendor Co", null);
    assert.equal(
      fields.qbInvoiceNumber,
      null,
      "null input must yield null, not undefined",
    );
    assert.notEqual(fields.qbInvoiceNumber, undefined);
  });

  test("invoice number undefined → writes null, not undefined", () => {
    const fields = buildIntakeQbFields("Vendor Co", undefined);
    assert.equal(
      fields.qbInvoiceNumber,
      null,
      "undefined input must yield null",
    );
    assert.notEqual(fields.qbInvoiceNumber, undefined);
  });

  test("vendor whitespace is trimmed before storage", () => {
    const fields = buildIntakeQbFields("  Acme  ", null);
    assert.equal(fields.qbVendorName, "Acme");
  });

  test("blank vendor string produces null qbVendorName", () => {
    const fields = buildIntakeQbFields("   ", null);
    assert.equal(fields.qbVendorName, null);
  });
});

// ─── assertQbFieldsComplete ───────────────────────────────────────────────────

describe("assertQbFieldsComplete", () => {
  test("does not throw when all required fields are present", () => {
    const fields = buildIntakeQbFields("Acme Truck Parts", "INV-001");
    assert.doesNotThrow(() => assertQbFieldsComplete(fields));
  });

  test("throws when qbVendorName is null (empty vendor)", () => {
    const fields = buildIntakeQbFields("", "INV-001");
    assert.throws(
      () => assertQbFieldsComplete(fields),
      /qbVendorName/,
      "should name the missing field in the error message",
    );
  });

  test("throws when qbVendorName is null (blank-only vendor)", () => {
    const fields = buildIntakeQbFields("   ", null);
    assert.throws(() => assertQbFieldsComplete(fields), /qbVendorName/);
  });

  test("error message references the specific missing QB field", () => {
    const fields = buildIntakeQbFields("", null);
    assert.throws(
      () => assertQbFieldsComplete(fields),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Cannot save intake/);
        assert.match(err.message, /qbVendorName/);
        return true;
      },
    );
  });

  test("all four hardcoded fields survive the completeness check", () => {
    const fields = buildIntakeQbFields("Any Vendor", null);
    const result = assertQbFieldsComplete(fields);
    assert.equal(
      result,
      undefined,
      "assertQbFieldsComplete returns void on success",
    );
  });
});

// ─── buildLineItemInsertValues ────────────────────────────────────────────────
// This is the EXACT function createInventoryIntake delegates to when building
// every inventory_intake_items INSERT.  Testing it here covers the real
// propagation path used by the storage layer.

describe("buildLineItemInsertValues — the function createInventoryIntake uses for every line-item INSERT", () => {
  test("QB fields from the intake header are non-null on the line item", () => {
    const qbFields = buildIntakeQbFields("Fleet Supply Co", "FSC-777");
    assertQbFieldsComplete(qbFields); // confirms header is valid

    const simulatedIntake = { id: INTAKE_ID, ...qbFields };
    const record = buildLineItemInsertValues(
      INTAKE_ID,
      simulatedIntake,
      SAMPLE_ITEM,
      COMPANY_ID,
    );

    assert.notEqual(
      record.qbTransactionType,
      null,
      "qbTransactionType must not be null",
    );
    assert.notEqual(
      record.qbDebitAccount,
      null,
      "qbDebitAccount must not be null",
    );
    assert.notEqual(
      record.qbCreditAccount,
      null,
      "qbCreditAccount must not be null",
    );
    assert.notEqual(record.qbVendorName, null, "qbVendorName must not be null");

    assert.notEqual(record.qbTransactionType, undefined);
    assert.notEqual(record.qbDebitAccount, undefined);
    assert.notEqual(record.qbCreditAccount, undefined);
    assert.notEqual(record.qbVendorName, undefined);
  });

  test("QB field values on the line item exactly match the intake header", () => {
    const qbFields = buildIntakeQbFields("Fleet Supply Co", "FSC-777");
    const simulatedIntake = { id: INTAKE_ID, ...qbFields };
    const record = buildLineItemInsertValues(
      INTAKE_ID,
      simulatedIntake,
      SAMPLE_ITEM,
      COMPANY_ID,
    );

    assert.equal(record.qbTransactionType, "bill");
    assert.equal(record.qbDebitAccount, "Inventory Asset");
    assert.equal(record.qbCreditAccount, "Accounts Payable");
    assert.equal(record.qbVendorName, "Fleet Supply Co");
    assert.equal(record.qbInvoiceNumber, "FSC-777");
  });

  test("qbInvoiceNumber on the line item is null (not undefined) when intake has no invoice number", () => {
    const qbFields = buildIntakeQbFields("Fleet Supply Co", null);
    const simulatedIntake = { id: INTAKE_ID, ...qbFields };
    const record = buildLineItemInsertValues(
      INTAKE_ID,
      simulatedIntake,
      SAMPLE_ITEM,
      COMPANY_ID,
    );

    assert.equal(record.qbInvoiceNumber, null, "must be null, not undefined");
    assert.notEqual(record.qbInvoiceNumber, undefined);
  });

  test("every line item in a multi-item intake has non-null QB fields", () => {
    const items = [
      {
        partNameSnapshot: "Oil Filter",
        qty: 2,
        unitCost: "8.00",
        lineTotal: "16.00",
      },
      {
        partNameSnapshot: "Brake Pad",
        qty: 4,
        unitCost: "25.00",
        lineTotal: "100.00",
      },
      {
        partNameSnapshot: "Air Filter",
        qty: 1,
        unitCost: "15.00",
        lineTotal: "15.00",
      },
    ];

    const qbFields = buildIntakeQbFields("Parts R Us", null);
    const simulatedIntake = { id: INTAKE_ID, ...qbFields };

    for (const item of items) {
      const record = buildLineItemInsertValues(
        INTAKE_ID,
        simulatedIntake,
        item,
        COMPANY_ID,
      );

      assert.notEqual(
        record.qbTransactionType,
        null,
        `${item.partNameSnapshot}: qbTransactionType must not be null`,
      );
      assert.notEqual(
        record.qbDebitAccount,
        null,
        `${item.partNameSnapshot}: qbDebitAccount must not be null`,
      );
      assert.notEqual(
        record.qbCreditAccount,
        null,
        `${item.partNameSnapshot}: qbCreditAccount must not be null`,
      );
      assert.notEqual(
        record.qbVendorName,
        null,
        `${item.partNameSnapshot}: qbVendorName must not be null`,
      );
    }
  });

  test("intake with vendor but no invoice number produces null (not undefined) on every line item", () => {
    const qbFields = buildIntakeQbFields("Vendor Inc", undefined);
    const simulatedIntake = { id: INTAKE_ID, ...qbFields };
    const record = buildLineItemInsertValues(
      INTAKE_ID,
      simulatedIntake,
      SAMPLE_ITEM,
      COMPANY_ID,
    );

    assert.strictEqual(record.qbInvoiceNumber, null);
  });

  test("inventoryIntakeId on the line item matches the intake id", () => {
    const qbFields = buildIntakeQbFields("Vendor Inc", "INV-X");
    const simulatedIntake = { id: INTAKE_ID, ...qbFields };
    const record = buildLineItemInsertValues(
      INTAKE_ID,
      simulatedIntake,
      SAMPLE_ITEM,
      COMPANY_ID,
    );

    assert.equal(record.inventoryIntakeId, INTAKE_ID);
  });

  test("companyId on the line item matches the intake companyId", () => {
    const qbFields = buildIntakeQbFields("Vendor Inc", "INV-X");
    const simulatedIntake = { id: INTAKE_ID, ...qbFields };
    const record = buildLineItemInsertValues(
      INTAKE_ID,
      simulatedIntake,
      SAMPLE_ITEM,
      COMPANY_ID,
    );

    assert.equal(record.companyId, COMPANY_ID);
  });

  test("missing vendor is caught before line items are built (assertQbFieldsComplete throws first)", () => {
    const qbFields = buildIntakeQbFields("", null);

    assert.throws(() => assertQbFieldsComplete(qbFields), /Cannot save intake/);

    // The throw happens BEFORE buildLineItemInsertValues is ever called,
    // guaranteeing null QB fields can never reach the DB.
  });
});
