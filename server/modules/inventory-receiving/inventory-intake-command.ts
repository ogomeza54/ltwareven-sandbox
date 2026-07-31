import type {
  InventoryReceivingCommand,
  InventoryReceivingLine,
} from "./types";

export class InventoryIntakeRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryIntakeRequestValidationError";
  }
}

export function normalizeInventoryIntakeRequest(
  body: unknown,
): InventoryReceivingCommand {
  const request = (body ?? {}) as Record<string, any>;
  const rawItems = request.items;
  const vendor = request.vendor;

  if (!vendor || !vendor.trim()) {
    throw new InventoryIntakeRequestValidationError("Vendor is required");
  }
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new InventoryIntakeRequestValidationError(
      "At least one line item is required",
    );
  }

  const items: InventoryReceivingLine[] = rawItems.map((raw) => {
    const item = raw as Record<string, any>;
    if (!item.partNameSnapshot || !item.qty || Number(item.qty) < 1) {
      throw new InventoryIntakeRequestValidationError(
        "Each item must have a name and quantity ≥ 1",
      );
    }
    if (
      item.itemType &&
      item.itemType !== "consumable" &&
      item.itemType !== "inventory" &&
      item.itemType !== "service" &&
      item.itemType !== "direct_expense"
    ) {
      throw new InventoryIntakeRequestValidationError(
        "itemType must be 'consumable', 'inventory', 'service' or 'direct_expense'",
      );
    }
    for (const key of ["partId", "groupId", "subgroupId"] as const) {
      if (item[key] && typeof item[key] !== "string") {
        throw new TypeError(`${key} must be a string`);
      }
    }
    if (typeof item.qty !== "number" && typeof item.qty !== "string") {
      throw new TypeError("qty must be a number or numeric string");
    }

    return {
      partId: item.partId || undefined,
      partNameSnapshot: String(item.partNameSnapshot),
      partNumberSnapshot:
        item.partNumberSnapshot == null ? "" : String(item.partNumberSnapshot),
      itemType:
        item.itemType === "consumable" ||
        item.itemType === "inventory" ||
        item.itemType === "service" ||
        item.itemType === "direct_expense"
          ? item.itemType
          : undefined,
      groupId: item.groupId || undefined,
      subgroupId: item.subgroupId || undefined,
      qty: Number(item.qty),
      unitCost: String(item.unitCost || "0"),
      lineTotal: String(item.lineTotal || "0"),
    };
  });

  const calculatedTotal =
    Number(request.subtotal || 0) +
    Number(request.taxAmount || 0) +
    Number(request.deliveryFee || 0);
  const enteredTotal = Number(request.totalAmount || 0);
  const diff = Math.abs(calculatedTotal - enteredTotal);

  return {
    items,
    header: {
      vendor: vendor.trim(),
      invoiceNumber: request.invoiceNumber || null,
      invoiceDate: request.invoiceDate
        ? new Date(String(request.invoiceDate))
        : null,
      subtotal: String(request.subtotal || "0"),
      taxAmount: String(request.taxAmount || "0"),
      deliveryFee: String(request.deliveryFee || "0"),
      totalAmount: String(request.totalAmount || "0"),
      reconciliationStatus:
        enteredTotal !== 0 && diff <= 0.01 ? "matched" : "warning",
      notes: request.notes || null,
      quickbooksSyncStatus: "not_synced",
      quickbooksId: null,
      quickbooksLastSyncedAt: null,
      externalReferenceNumber: request.externalReferenceNumber || null,
      invoicePhotoUrl: request.invoicePhotoUrl || null,
    },
  };
}
