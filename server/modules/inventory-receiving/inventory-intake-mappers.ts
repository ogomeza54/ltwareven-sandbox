import type { InventoryReceivingLine } from "./types";

export function buildLineItemInsertValues(
  intakeId: string,
  intake: {
    qbTransactionType: string | null;
    qbDebitAccount: string | null;
    qbCreditAccount: string | null;
    qbVendorName: string | null;
    qbInvoiceNumber: string | null;
  },
  item: InventoryReceivingLine,
  companyId: string,
) {
  return {
    inventoryIntakeId: intakeId,
    partId: item.partId || null,
    partNameSnapshot: item.partNameSnapshot,
    partNumberSnapshot: item.partNumberSnapshot ?? "",
    itemType: item.itemType || "inventory",
    groupId: item.groupId || null,
    subgroupId: item.subgroupId || null,
    qty: item.qty,
    unitCost: item.unitCost,
    lineTotal: item.lineTotal,
    landedCost: item.landedCost,
    companyId,
    quickbooksSyncStatus: "not_synced",
    qbTransactionType: intake.qbTransactionType,
    qbDebitAccount: intake.qbDebitAccount,
    qbCreditAccount: intake.qbCreditAccount,
    qbVendorName: intake.qbVendorName,
    qbInvoiceNumber: intake.qbInvoiceNumber,
    qbAmount: item.lineTotal,
  };
}

export function buildIntakeQbFields(
  vendor: string,
  invoiceNumber: string | null | undefined,
  config?: {
    qbTransactionType?: string | null;
    qbDebitAccount?: string | null;
    qbCreditAccount?: string | null;
  },
) {
  return {
    qbVendorName: vendor.trim() || null,
    qbTransactionType: (config?.qbTransactionType || "bill") as string,
    qbDebitAccount: (config?.qbDebitAccount || "Inventory Asset") as string,
    qbCreditAccount: (config?.qbCreditAccount || "Accounts Payable") as string,
    qbInvoiceNumber: invoiceNumber ?? null,
  };
}

export type IntakeQbFields = ReturnType<typeof buildIntakeQbFields>;

export function assertQbFieldsComplete(fields: IntakeQbFields): void {
  const required = [
    "qbVendorName",
    "qbTransactionType",
    "qbDebitAccount",
    "qbCreditAccount",
  ] as const;
  for (const key of required) {
    if (!fields[key]) {
      throw new Error(
        `Cannot save intake: required QB field "${key}" is missing or empty`,
      );
    }
  }
}

export function applyLandedCosts(
  items: InventoryReceivingLine[],
  taxAmount: unknown,
  deliveryFee: unknown,
  adjustmentAmount: unknown = "0",
): InventoryReceivingLine[] {
  const totalAncillary =
    parseFloat((taxAmount as string) || "0") +
    parseFloat((deliveryFee as string) || "0") +
    parseFloat((adjustmentAmount as string) || "0");
  const stockItems = items.filter(
    (item) =>
      item.itemType !== "service" && item.itemType !== "direct_expense",
  );
  const stockSubtotal = stockItems.reduce(
    (sum, item) => sum + parseFloat(item.lineTotal || "0"),
    0,
  );

  return items.map((item) => {
    if (item.itemType === "service" || item.itemType === "direct_expense") {
      return { ...item, landedCost: undefined };
    }
    const lineTotal = parseFloat(item.lineTotal || "0");
    const qty = item.qty || 1;
    const weight = stockSubtotal > 0 ? lineTotal / stockSubtotal : 0;
    const ancillaryShare = weight * totalAncillary;
    return {
      ...item,
      landedCost: ((lineTotal + ancillaryShare) / qty).toFixed(4),
    };
  });
}
