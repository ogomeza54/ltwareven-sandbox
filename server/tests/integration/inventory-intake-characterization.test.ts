import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, test } from "node:test";
import { and, eq, like } from "drizzle-orm";
import {
  companies,
  companyIntegrations,
  inventoryIntakeItems,
  inventoryIntakes,
  inventoryParts,
  maintenanceGroups,
  maintenanceItems,
  maintenanceSubgroups,
  users,
} from "@shared/schema";
import {
  receiveInventory,
  receiveInventoryWithinTransaction,
} from "../../modules/inventory-receiving/postgres-inventory-intake-service";
import type { InventoryReceivingCommand } from "../../modules/inventory-receiving/types";
import { requireExactLocalTestDatabase } from "../../../scripts/test-database-guard";

requireExactLocalTestDatabase(process.env.DATABASE_URL);
const { closeDatabase, db } = await import("../../db");
const { storage } = await import("../../storage");

const prefix = `bmad-1-1-${process.pid}-${randomUUID()}-`;
let companyId: string;
let foreignCompanyId: string;
let userId: string;
let groupId: string;
let subgroupId: string;

function command(
  items: InventoryReceivingCommand["items"],
  overrides: Partial<InventoryReceivingCommand["header"]> = {},
): InventoryReceivingCommand {
  return {
    header: {
      vendor: `${prefix}Vendor`,
      invoiceNumber: `${prefix}invoice`,
      invoiceDate: null,
      subtotal: "100",
      taxAmount: "10",
      deliveryFee: "10",
      totalAmount: "120",
      reconciliationStatus: "matched",
      notes: null,
      quickbooksSyncStatus: "not_synced",
      quickbooksId: null,
      quickbooksLastSyncedAt: null,
      externalReferenceNumber: null,
      invoicePhotoUrl: null,
      ...overrides,
    },
    items,
  };
}

async function cleanup(): Promise<void> {
  const fixtureCompanies = await db
    .select({ id: companies.id })
    .from(companies)
    .where(like(companies.name, `${prefix}%`));
  const ids = fixtureCompanies.map((company) => company.id);
  for (const id of ids) {
    await db
      .delete(inventoryIntakeItems)
      .where(eq(inventoryIntakeItems.companyId, id));
    await db.delete(inventoryIntakes).where(eq(inventoryIntakes.companyId, id));
    await db.delete(maintenanceItems).where(eq(maintenanceItems.companyId, id));
    await db.delete(inventoryParts).where(eq(inventoryParts.companyId, id));
    await db
      .delete(maintenanceSubgroups)
      .where(eq(maintenanceSubgroups.companyId, id));
    await db
      .delete(maintenanceGroups)
      .where(eq(maintenanceGroups.companyId, id));
    await db
      .delete(companyIntegrations)
      .where(eq(companyIntegrations.companyId, id));
    await db.delete(users).where(eq(users.companyId, id));
    await db.delete(companies).where(eq(companies.id, id));
  }
}

async function seed(): Promise<void> {
  [
    ({ id: companyId } = (
      await db
        .insert(companies)
        .values({ name: `${prefix}primary`, plan: "basic" })
        .returning({ id: companies.id })
    )[0]!),
  ];
  [
    ({ id: foreignCompanyId } = (
      await db
        .insert(companies)
        .values({ name: `${prefix}foreign`, plan: "basic" })
        .returning({ id: companies.id })
    )[0]!),
  ];
  [
    ({ id: userId } = (
      await db
        .insert(users)
        .values({
          email: `${prefix}${Date.now()}@example.test`,
          role: "admin",
          companyId,
        })
        .returning({ id: users.id })
    )[0]!),
  ];
  [
    ({ id: groupId } = (
      await db
        .insert(maintenanceGroups)
        .values({ name: `${prefix}group`, companyId })
        .returning({ id: maintenanceGroups.id })
    )[0]!),
  ];
  [
    ({ id: subgroupId } = (
      await db
        .insert(maintenanceSubgroups)
        .values({ name: `${prefix}subgroup`, groupId, companyId })
        .returning({ id: maintenanceSubgroups.id })
    )[0]!),
  ];
}

describe(
  "inventory receiving PostgreSQL characterization",
  { concurrency: false },
  () => {
    before(async () => {
      assert.equal(process.env.DATABASE_DRIVER, "node-postgres");
      assert.equal(
        new URL(process.env.DATABASE_URL!).pathname.slice(1),
        "talavera_invoice_test",
      );
    });
    beforeEach(async () => {
      await cleanup();
      await seed();
    });
    after(async () => {
      await cleanup();
      await closeDatabase();
    });

    test("existing part accumulates repeated lines and preserves landed effects", async () => {
      const [part] = await db
        .insert(inventoryParts)
        .values({
          name: `${prefix}existing`,
          partNumber: "E-1",
          price: "1",
          quantityInStock: 5,
          companyId,
        })
        .returning();
      const intake = await receiveInventory(
        db,
        command([
          {
            partId: part.id,
            partNameSnapshot: part.name,
            partNumberSnapshot: part.partNumber,
            itemType: "inventory",
            qty: 2,
            unitCost: "25",
            lineTotal: "50",
          },
          {
            partId: part.id,
            partNameSnapshot: part.name,
            partNumberSnapshot: part.partNumber,
            itemType: "inventory",
            groupId,
            subgroupId,
            qty: 3,
            unitCost: "16.67",
            lineTotal: "50",
          },
        ]),
        { companyId, userId },
      );
      const [updated] = await db
        .select()
        .from(inventoryParts)
        .where(eq(inventoryParts.id, part.id));
      const lines = await db
        .select()
        .from(inventoryIntakeItems)
        .where(eq(inventoryIntakeItems.inventoryIntakeId, intake.id));
      assert.equal(updated?.quantityInStock, 10);
      assert.equal(updated?.price, "20.00");
      assert.equal(updated?.itemType, "inventory");
      assert.equal(updated?.groupId, groupId);
      assert.equal(updated?.subgroupId, subgroupId);
      assert.deepEqual(
        lines.map((line) => line.landedCost),
        ["30.0000", "20.0000"],
      );
      assert.equal(intake.quickbooksSyncStatus, "pending_usage");
    });

    test("non-stock CORE adjustments affect landed cost without changing stock", async () => {
      const [part] = await db
        .insert(inventoryParts)
        .values({
          name: `${prefix}brake-shoe-kit`,
          partNumber: "104F/ABP-MK4711Q",
          price: "61.80",
          quantityInStock: 4,
          companyId,
        })
        .returning();
      const request = command(
        [{
          partId: part.id,
          partNameSnapshot: part.name,
          partNumberSnapshot: part.partNumber,
          itemType: "consumable",
          qty: 2,
          unitCost: "61.80",
          lineTotal: "123.60",
        }],
        {
          subtotal: "143.60",
          taxAmount: "11.86",
          deliveryFee: "0.00",
          totalAmount: "155.46",
        },
      );
      request.landedAdjustmentAmount = "20.00";
      const intake = await receiveInventory(db, request, { companyId, userId });
      const [updated] = await db
        .select()
        .from(inventoryParts)
        .where(eq(inventoryParts.id, part.id));
      const [received] = await db
        .select()
        .from(inventoryIntakeItems)
        .where(eq(inventoryIntakeItems.inventoryIntakeId, intake.id));
      assert.equal(updated?.quantityInStock, 6);
      assert.equal(updated?.price, "77.73");
      assert.equal(received?.landedCost, "77.7300");
      assert.equal(intake.subtotal, "143.60");
      assert.equal(intake.totalAmount, "155.46");
    });

    test("new part creates or links catalog entry without overwriting a linked entry", async () => {
      const [unlinked] = await db
        .insert(maintenanceItems)
        .values({
          name: `${prefix}link-me`,
          subgroupId,
          companyId,
        })
        .returning();
      await receiveInventory(
        db,
        command([
          {
            partNameSnapshot: `${prefix}link-me`,
            partNumberSnapshot: "N-1",
            itemType: "consumable",
            groupId,
            subgroupId,
            qty: 2,
            unitCost: "50",
            lineTotal: "100",
          },
        ]),
        { companyId, userId },
      );
      const [linked] = await db
        .select()
        .from(maintenanceItems)
        .where(eq(maintenanceItems.id, unlinked.id));
      assert.ok(linked?.partId);
      const [part] = await db
        .select()
        .from(inventoryParts)
        .where(eq(inventoryParts.id, linked!.partId!));
      assert.equal(part?.quantityInStock, 2);
      assert.equal(part?.price, "60.00");
      assert.equal(part?.itemType, "consumable");

      await receiveInventory(
        db,
        command([
          {
            partNameSnapshot: `${prefix}link-me`,
            partNumberSnapshot: "N-2",
            groupId,
            subgroupId,
            qty: 1,
            unitCost: "100",
            lineTotal: "100",
          },
        ]),
        { companyId, userId },
      );
      const [stillLinked] = await db
        .select()
        .from(maintenanceItems)
        .where(eq(maintenanceItems.id, unlinked.id));
      assert.equal(stillLinked?.partId, linked?.partId);

      await receiveInventory(
        db,
        command([
          {
            partNameSnapshot: `${prefix}create-catalog`,
            partNumberSnapshot: "N-3",
            groupId,
            subgroupId,
            qty: 1,
            unitCost: "100",
            lineTotal: "100",
          },
        ]),
        { companyId, userId },
      );
      const [createdCatalogItem] = await db
        .select()
        .from(maintenanceItems)
        .where(
          and(
            eq(maintenanceItems.companyId, companyId),
            eq(maintenanceItems.name, `${prefix}create-catalog`),
          ),
        );
      assert.ok(createdCatalogItem?.partId);
    });

    test("uses company QB mapping and preserves consumable mode", async () => {
      await db.insert(companyIntegrations).values({
        companyId,
        provider: "quickbooks",
        qbTransactionType: "expense",
        qbDebitAccount: "Parts Expense",
        qbCreditAccount: "Cash",
      });
      const qbCommand = command([
        {
          partNameSnapshot: `${prefix}consumable`,
          partNumberSnapshot: "C-1",
          itemType: "consumable",
          qty: 1,
          unitCost: "100",
          lineTotal: "100",
        },
      ]);
      const intake = await storage.createInventoryIntake(
        qbCommand.header,
        qbCommand.items,
        companyId,
        userId,
      );
      assert.equal(intake.quickbooksSyncStatus, "not_synced");
      assert.equal(intake.qbTransactionType, "expense");
      assert.equal(intake.qbDebitAccount, "Parts Expense");
      assert.equal(intake.qbCreditAccount, "Cash");
    });

    test("rejects foreign part and catalog placement before writing", async () => {
      const [foreignPart] = await db
        .insert(inventoryParts)
        .values({
          name: `${prefix}foreign-part`,
          partNumber: "F-1",
          price: "1",
          companyId: foreignCompanyId,
        })
        .returning();
      const foreignGroup = (
        await db
          .insert(maintenanceGroups)
          .values({
            name: `${prefix}foreign-group`,
            companyId: foreignCompanyId,
          })
          .returning()
      )[0]!;
      const baseline = await db
        .select()
        .from(inventoryIntakes)
        .where(eq(inventoryIntakes.companyId, companyId));
      await assert.rejects(
        receiveInventory(
          db,
          command([
            {
              partId: foreignPart.id,
              partNameSnapshot: foreignPart.name,
              partNumberSnapshot: foreignPart.partNumber,
              groupId: foreignGroup.id,
              qty: 1,
              unitCost: "100",
              lineTotal: "100",
            },
          ]),
          { companyId, userId },
        ),
        /not found in company inventory/,
      );
      const afterFailure = await db
        .select()
        .from(inventoryIntakes)
        .where(eq(inventoryIntakes.companyId, companyId));
      assert.equal(afterFailure.length, baseline.length);
    });

    test("rejects foreign catalog placement even without a linked part", async () => {
      const [foreignGroup] = await db
        .insert(maintenanceGroups)
        .values({
          name: `${prefix}foreign-only-group`,
          companyId: foreignCompanyId,
        })
        .returning();
      await assert.rejects(
        receiveInventory(
          db,
          command([
            {
              partNameSnapshot: `${prefix}catalog-reject`,
              partNumberSnapshot: "FC-1",
              groupId: foreignGroup.id,
              qty: 1,
              unitCost: "100",
              lineTotal: "100",
            },
          ]),
          { companyId, userId },
        ),
        /Group .* not found/,
      );
      assert.equal(
        (
          await db
            .select()
            .from(inventoryIntakes)
            .where(eq(inventoryIntakes.companyId, companyId))
        ).length,
        0,
      );
    });

    test("late PostgreSQL failure rolls back header, new part and catalog link", async () => {
      const initialPartCount = (
        await db
          .select()
          .from(inventoryParts)
          .where(eq(inventoryParts.companyId, companyId))
      ).length;
      await assert.rejects(
        receiveInventory(
          db,
          command([
            {
              partNameSnapshot: `${prefix}rollback`,
              partNumberSnapshot: "R-1",
              groupId,
              subgroupId,
              qty: Number.NaN,
              unitCost: "100",
              lineTotal: "100",
            },
          ]),
          { companyId, userId },
        ),
      );
      assert.equal(
        (
          await db
            .select()
            .from(inventoryIntakes)
            .where(eq(inventoryIntakes.companyId, companyId))
        ).length,
        0,
      );
      assert.equal(
        (
          await db
            .select()
            .from(inventoryParts)
            .where(eq(inventoryParts.companyId, companyId))
        ).length,
        initialPartCount,
      );
      assert.equal(
        (
          await db
            .select()
            .from(maintenanceItems)
            .where(eq(maintenanceItems.companyId, companyId))
        ).length,
        0,
      );
    });

    test("records PostgreSQL behavior for fractional quantities and negative money", async () => {
      await assert.rejects(
        receiveInventory(
          db,
          command([
            {
              partNameSnapshot: `${prefix}fractional`,
              partNumberSnapshot: "FR-1",
              qty: 1.5,
              unitCost: "10",
              lineTotal: "15",
            },
          ]),
          { companyId, userId },
        ),
      );
      const negative = await receiveInventory(
        db,
        command(
          [
            {
              partNameSnapshot: `${prefix}negative`,
              partNumberSnapshot: "NEG-1",
              qty: 1,
              unitCost: "-10",
              lineTotal: "-10",
            },
          ],
          {
            subtotal: "-10",
            taxAmount: "0",
            deliveryFee: "0",
            totalAmount: "-10",
          },
        ),
        { companyId, userId },
      );
      assert.equal(negative.totalAmount, "-10.00");
      const [negativePart] = await db
        .select()
        .from(inventoryParts)
        .where(
          and(
            eq(inventoryParts.companyId, companyId),
            eq(inventoryParts.name, `${prefix}negative`),
          ),
        );
      assert.equal(negativePart?.price, "-10.00");
    });

    test("manual double submit remains non-idempotent", async () => {
      const [part] = await db
        .insert(inventoryParts)
        .values({
          name: `${prefix}double`,
          partNumber: "D-1",
          price: "1",
          quantityInStock: 0,
          companyId,
        })
        .returning();
      const request = command([
        {
          partId: part.id,
          partNameSnapshot: part.name,
          partNumberSnapshot: part.partNumber,
          qty: 2,
          unitCost: "50",
          lineTotal: "100",
        },
      ]);
      await receiveInventory(db, request, { companyId, userId });
      await receiveInventory(db, request, { companyId, userId });
      const intakes = await db
        .select()
        .from(inventoryIntakes)
        .where(eq(inventoryIntakes.companyId, companyId));
      const [updated] = await db
        .select()
        .from(inventoryParts)
        .where(eq(inventoryParts.id, part.id));
      assert.equal(intakes.length, 2);
      assert.equal(updated?.quantityInStock, 4);
    });

    test("inner operation composes inside a caller-owned transaction", async () => {
      const [existingPart] = await db
        .insert(inventoryParts)
        .values({
          name: `${prefix}composable-existing`,
          partNumber: "T-0",
          price: "5",
          quantityInStock: 7,
          companyId,
        })
        .returning();
      const initialPartCount = (
        await db
          .select()
          .from(inventoryParts)
          .where(eq(inventoryParts.companyId, companyId))
      ).length;
      await assert.rejects(
        db.transaction(async (tx) => {
          await receiveInventoryWithinTransaction(
            tx,
            command(
              [
                {
                  partId: existingPart.id,
                  partNameSnapshot: existingPart.name,
                  partNumberSnapshot: existingPart.partNumber,
                  qty: 2,
                  unitCost: "50",
                  lineTotal: "50",
                },
                {
                  partNameSnapshot: `${prefix}composable-new`,
                  partNumberSnapshot: "T-1",
                  groupId,
                  subgroupId,
                  qty: 1,
                  unitCost: "50",
                  lineTotal: "50",
                },
              ],
              {
                subtotal: "100",
                taxAmount: "0",
                deliveryFee: "0",
                totalAmount: "100",
              },
            ),
            { companyId, userId },
          );
          throw new Error("caller rollback");
        }),
        /caller rollback/,
      );
      assert.equal(
        (
          await db
            .select()
            .from(inventoryIntakes)
            .where(eq(inventoryIntakes.companyId, companyId))
        ).length,
        0,
      );
      const [unchangedPart] = await db
        .select()
        .from(inventoryParts)
        .where(eq(inventoryParts.id, existingPart.id));
      assert.equal(unchangedPart?.quantityInStock, 7);
      assert.equal(
        (
          await db
            .select()
            .from(inventoryParts)
            .where(eq(inventoryParts.companyId, companyId))
        ).length,
        initialPartCount,
      );
      assert.equal(
        (
          await db
            .select()
            .from(maintenanceItems)
            .where(eq(maintenanceItems.companyId, companyId))
        ).length,
        0,
      );
    });
  },
);
