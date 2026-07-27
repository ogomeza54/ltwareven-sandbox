import {
  inventoryIntakeItems,
  inventoryIntakes,
  inventoryParts,
  maintenanceGroups,
  maintenanceItems,
  maintenanceSubgroups,
  type CompanyIntegration,
  type InventoryIntake,
} from "@shared/schema";
import * as applicationSchema from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import {
  applyLandedCosts,
  assertQbFieldsComplete,
  buildIntakeQbFields,
  buildLineItemInsertValues,
} from "./inventory-intake-mappers";
import {
  InventoryReceivingError,
  type InventoryReceivingActorContext,
  type InventoryReceivingCommand,
  type InventoryReceivingLine,
} from "./types";

export type InventoryReceivingExecutor = Pick<
  PgDatabase<any, typeof applicationSchema>,
  "select" | "insert" | "update"
>;

export async function validateCatalogPlacementsWithExecutor(
  executor: InventoryReceivingExecutor,
  placements: Array<{ groupId?: string; subgroupId?: string }>,
  companyId: string,
): Promise<void> {
  const groupIds = Array.from(
    new Set(
      placements
        .map((placement) => placement.groupId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const subgroupIds = Array.from(
    new Set(
      placements
        .map((placement) => placement.subgroupId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (groupIds.length > 0) {
    const ownedGroups = await executor
      .select({ id: maintenanceGroups.id })
      .from(maintenanceGroups)
      .where(
        and(
          inArray(maintenanceGroups.id, groupIds),
          eq(maintenanceGroups.companyId, companyId),
        ),
      );
    const ownedGroupIds = new Set(ownedGroups.map((group) => group.id));
    for (const id of groupIds) {
      if (!ownedGroupIds.has(id)) {
        throw new InventoryReceivingError(
          "GROUP_NOT_FOUND",
          `Group ${id} not found`,
        );
      }
    }
  }

  if (subgroupIds.length > 0) {
    const ownedSubgroups = await executor
      .select({
        id: maintenanceSubgroups.id,
        groupId: maintenanceSubgroups.groupId,
      })
      .from(maintenanceSubgroups)
      .where(
        and(
          inArray(maintenanceSubgroups.id, subgroupIds),
          eq(maintenanceSubgroups.companyId, companyId),
        ),
      );
    const subgroupMap = new Map(
      ownedSubgroups.map((subgroup) => [subgroup.id, subgroup.groupId]),
    );
    for (const placement of placements) {
      if (!placement.subgroupId) continue;
      if (!subgroupMap.has(placement.subgroupId)) {
        throw new InventoryReceivingError(
          "SUBGROUP_NOT_FOUND",
          `Subgroup ${placement.subgroupId} not found`,
        );
      }
      if (
        placement.groupId &&
        subgroupMap.get(placement.subgroupId) !== placement.groupId
      ) {
        throw new InventoryReceivingError(
          "SUBGROUP_GROUP_MISMATCH",
          `Subgroup ${placement.subgroupId} does not belong to group ${placement.groupId}`,
        );
      }
    }
  }
}

async function validatePartsWithExecutor(
  executor: InventoryReceivingExecutor,
  items: InventoryReceivingLine[],
  companyId: string,
): Promise<void> {
  const linkedPartIds = items
    .map((item) => item.partId)
    .filter(Boolean) as string[];
  if (linkedPartIds.length === 0) return;

  const ownedParts = await executor
    .select({ id: inventoryParts.id })
    .from(inventoryParts)
    .where(
      and(
        inArray(inventoryParts.id, linkedPartIds),
        eq(inventoryParts.companyId, companyId),
      ),
    );
  const ownedIds = new Set(ownedParts.map((part) => part.id));
  for (const id of linkedPartIds) {
    if (!ownedIds.has(id)) {
      throw new InventoryReceivingError(
        "PART_NOT_FOUND",
        `Part ${id} not found in company inventory`,
      );
    }
  }
}

export async function receiveInventoryWithinTransaction(
  tx: InventoryReceivingExecutor,
  command: InventoryReceivingCommand,
  actor: InventoryReceivingActorContext,
  qbConfig?: Pick<
    CompanyIntegration,
    "qbTransactionType" | "qbDebitAccount" | "qbCreditAccount"
  >,
): Promise<InventoryIntake> {
  const { companyId, userId } = actor;
  const { header, items } = command;

  await validatePartsWithExecutor(tx, items, companyId);
  await validateCatalogPlacementsWithExecutor(
    tx,
    items
      .filter((item) => item.groupId || item.subgroupId)
      .map((item) => ({
        groupId: item.groupId,
        subgroupId: item.subgroupId,
      })),
    companyId,
  );

  const itemsWithLanded = applyLandedCosts(
    items,
    header.taxAmount,
    header.deliveryFee,
    command.landedAdjustmentAmount,
  );
  const hasInventoryItem = items.some(
    (item) => (item.itemType || "inventory") === "inventory",
  );
  const qbSyncStatus = hasInventoryItem ? "pending_usage" : "not_synced";
  const qbFields = buildIntakeQbFields(
    header.vendor,
    header.invoiceNumber,
    qbConfig,
  );
  assertQbFieldsComplete(qbFields);

  const [intake] = await tx
    .insert(inventoryIntakes)
    .values({
      ...header,
      companyId,
      createdByUserId: userId,
      qbTransactionType: qbFields.qbTransactionType,
      qbDebitAccount: qbFields.qbDebitAccount,
      qbCreditAccount: qbFields.qbCreditAccount,
      qbVendorName: qbFields.qbVendorName,
      qbInvoiceNumber: qbFields.qbInvoiceNumber,
      qbAmount: header.totalAmount || "0",
      quickbooksSyncStatus: qbSyncStatus,
    })
    .returning();

  if (itemsWithLanded.length === 0) return intake;

  const resolvedItems = await Promise.all(
    itemsWithLanded.map(async (item) => {
      if (item.partId) return item;

      const [newPart] = await tx
        .insert(inventoryParts)
        .values({
          name: item.partNameSnapshot,
          partNumber: item.partNumberSnapshot || "",
          itemType: item.itemType || "inventory",
          category: item.category || null,
          groupId: item.groupId || null,
          subgroupId: item.subgroupId || null,
          price: item.landedCost || item.unitCost || "0",
          quantityInStock: 0,
          companyId,
        })
        .returning();

      if (item.subgroupId) {
        const existingItems = await tx
          .select({ id: maintenanceItems.id, partId: maintenanceItems.partId })
          .from(maintenanceItems)
          .where(
            and(
              eq(maintenanceItems.subgroupId, item.subgroupId),
              eq(maintenanceItems.companyId, companyId),
              sql`lower(${maintenanceItems.name}) = lower(${item.partNameSnapshot})`,
            ),
          );

        if (existingItems.length === 0) {
          await tx.insert(maintenanceItems).values({
            name: item.partNameSnapshot,
            subgroupId: item.subgroupId,
            partId: newPart.id,
            sortOrder: 0,
            companyId,
          });
        } else if (existingItems[0]?.partId === null) {
          await tx
            .update(maintenanceItems)
            .set({ partId: newPart.id })
            .where(eq(maintenanceItems.id, existingItems[0].id));
        }
      }

      return { ...item, partId: newPart.id };
    }),
  );

  await tx
    .insert(inventoryIntakeItems)
    .values(
      resolvedItems.map((item) =>
        buildLineItemInsertValues(intake.id, intake, item, companyId),
      ),
    );

  for (const item of resolvedItems) {
    if (!item.partId) continue;
    const updates: {
      quantityInStock: ReturnType<typeof sql>;
      price: string | undefined;
      itemType: string;
      groupId?: string;
      subgroupId?: string;
    } = {
      quantityInStock: sql`${inventoryParts.quantityInStock} + ${item.qty}`,
      price: item.landedCost,
      itemType: item.itemType || "inventory",
    };
    if (item.groupId) updates.groupId = item.groupId;
    if (item.subgroupId) updates.subgroupId = item.subgroupId;
    await tx
      .update(inventoryParts)
      .set(updates)
      .where(
        and(
          eq(inventoryParts.id, item.partId),
          eq(inventoryParts.companyId, companyId),
        ),
      );
  }

  return intake;
}

export async function receiveInventory(
  database: PgDatabase<any, typeof applicationSchema>,
  command: InventoryReceivingCommand,
  actor: InventoryReceivingActorContext,
  qbConfig?: Pick<
    CompanyIntegration,
    "qbTransactionType" | "qbDebitAccount" | "qbCreditAccount"
  >,
): Promise<InventoryIntake> {
  return database.transaction((tx) =>
    receiveInventoryWithinTransaction(tx, command, actor, qbConfig),
  );
}
