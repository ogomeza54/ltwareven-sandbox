import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Companies table for multi-tenancy
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("basic"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Users table with Replit Auth integration and company association
// Roles: super_admin | admin | accounting | shop_user | technician
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: text("role").notNull().default("shop_user"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  passwordHash: text("password_hash"),
  mustChangePassword: boolean("must_change_password").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Mechanics / Technicians table
export const mechanics = pgTable("mechanics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  specialization: text("specialization").notNull(),
  phone: text("phone"),
  email: text("email"),
  cdlClass: text("cdl_class"), // CDL Class A, B, C, or N/A
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).notNull(),
  isAvailable: boolean("is_available").default(true).notNull(),
  currentWorkload: integer("current_workload").default(0).notNull(), // active order count
  maxWorkload: integer("max_workload").default(40).notNull(),        // max hours per period
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Customers table
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Vehicles (fleet) table
export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  year: integer("year").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  vin: text("vin"),
  licensePlate: text("license_plate"),
  color: text("color"),
  mileage: integer("mileage"),
  customerId: varchar("customer_id").references(() => customers.id), // nullable — fleet vehicles have no customer owner
  companyId: varchar("company_id").notNull().references(() => companies.id),
  // Fleet-specific fields
  tractorNumber: text("tractor_number"),   // unit number (e.g. "T-042")
  unitStatus: text("unit_status"),         // active | inactive | maintenance
  fleetType: text("fleet_type"),           // company-fleet | external
  truckType: text("truck_type"),           // semi-truck, box truck, flatbed, tanker, etc.
  photoUrl: text("photo_url"),             // optional unit photo
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Work Orders (Repair Orders) table
export const repairOrders = pgTable("repair_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(),
  vehicleId: varchar("vehicle_id").notNull().references(() => vehicles.id),
  customerId: varchar("customer_id").references(() => customers.id), // nullable for company-fleet jobs
  mechanicId: varchar("mechanic_id").references(() => mechanics.id),
  inspectorId: varchar("inspector_id").notNull().references(() => users.id),

  // Customer type — determines billing flow
  customerType: text("customer_type").notNull().default("company-fleet"), // company-fleet | owner-operator | third-party

  // Trucking-specific fields
  serviceType: text("service_type"),         // engine, brakes, tires, DOT inspection, etc.
  truckType: text("truck_type"),             // semi-truck, box truck, flatbed, tanker, etc.
  trailerNumber: text("trailer_number"),      // trailer unit number if applicable
  odometerIn: integer("odometer_in"),         // odometer reading at intake
  odometerOut: integer("odometer_out"),       // odometer reading at delivery
  dotInspectionRequired: boolean("dot_inspection_required").default(false),
  scheduledDate: timestamp("scheduled_date"), // when work is scheduled to begin
  completedDate: timestamp("completed_date"), // when work was completed
  closedDate: timestamp("closed_date"),       // when order was closed/invoiced

  description: text("description").notNull(),
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  // Status lifecycle: open → in-progress → on-hold → completed → delivered → closed / abandoned
  status: text("status").notNull().default("open"),
  estimatedHours: decimal("estimated_hours", { precision: 5, scale: 2 }),
  actualHours: decimal("actual_hours", { precision: 5, scale: 2 }).default("0"),
  laborRate: decimal("labor_rate", { precision: 10, scale: 2 }),
  totalEstimate: decimal("total_estimate", { precision: 10, scale: 2 }),
  progressNotes: text("progress_notes"),
  damagePhotos: text("damage_photos").array(),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Maintenance Catalog ────────────────────────────────────────────────────────
// Three-level hierarchy: Group → Subgroup → Item
// Items link to inventory parts for price lookup.

export const maintenanceGroups = pgTable("maintenance_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const maintenanceSubgroups = pgTable("maintenance_subgroups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  groupId: varchar("group_id").notNull().references(() => maintenanceGroups.id),
  sortOrder: integer("sort_order").notNull().default(0),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const maintenanceItems = pgTable("maintenance_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  subgroupId: varchar("subgroup_id").notNull().references(() => maintenanceSubgroups.id),
  // Optional link to an inventory part — drives price auto-fill
  partId: varchar("part_id").references(() => inventoryParts.id),
  sortOrder: integer("sort_order").notNull().default(0),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Inventory Parts table
export const inventoryParts = pgTable("inventory_parts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  partNumber: text("part_number").notNull(),
  description: text("description"),
  category: text("category"),
  // Catalog hierarchy links (optional — set when part is linked to a catalog item)
  groupId: varchar("group_id"),
  subgroupId: varchar("subgroup_id"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  quantityInStock: integer("quantity_in_stock").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Inventory Intake (invoice-style receiving) — header record
export const inventoryIntakes = pgTable("inventory_intakes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendor: text("vendor").notNull(),
  invoiceNumber: text("invoice_number"),
  invoiceDate: timestamp("invoice_date"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  deliveryFee: decimal("delivery_fee", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  // "matched" | "warning" | "unmatched"
  reconciliationStatus: text("reconciliation_status").notNull().default("unmatched"),
  notes: text("notes"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdByUserId: varchar("created_by_user_id").references(() => users.id),
  // QuickBooks integration placeholders
  quickbooksSyncStatus: text("quickbooks_sync_status").default("not_synced"),
  quickbooksId: text("quickbooks_id"),
  quickbooksLastSyncedAt: timestamp("quickbooks_last_synced_at"),
  externalReferenceNumber: text("external_reference_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Inventory Intake Items — line items for each intake
export const inventoryIntakeItems = pgTable("inventory_intake_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryIntakeId: varchar("inventory_intake_id").notNull().references(() => inventoryIntakes.id),
  partId: varchar("part_id").references(() => inventoryParts.id),
  partNameSnapshot: text("part_name_snapshot").notNull(),
  partNumberSnapshot: text("part_number_snapshot").notNull().default(""),
  qty: integer("qty").notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 12, scale: 2 }).notNull(),
  landedCost: decimal("landed_cost", { precision: 12, scale: 4 }),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Parts Usage table (junction table for work orders and parts)
export const partsUsage = pgTable("parts_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  repairOrderId: varchar("repair_order_id").notNull().references(() => repairOrders.id),
  partId: varchar("part_id").notNull().references(() => inventoryParts.id),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  // Catalog hierarchy snapshots — stored at usage time so reporting doesn't require joins
  groupSnapshot: text("group_snapshot"),
  subgroupSnapshot: text("subgroup_snapshot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Invoices — customer-facing billing records created from repair orders
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  repairOrderId: varchar("repair_order_id").notNull().references(() => repairOrders.id),
  customerId: varchar("customer_id").references(() => customers.id),  // null for fleet jobs
  companyId: varchar("company_id").notNull().references(() => companies.id),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),  // draft | sent | paid | void
  notes: text("notes"),
  // QuickBooks placeholder fields
  quickbooksSyncStatus: text("quickbooks_sync_status").default("not_synced"),
  quickbooksId: text("quickbooks_id"),
  quickbooksLastSyncedAt: timestamp("quickbooks_last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  mechanics: many(mechanics),
  customers: many(customers),
  vehicles: many(vehicles),
  repairOrders: many(repairOrders),
  inventoryParts: many(inventoryParts),
  inventoryIntakes: many(inventoryIntakes),
  maintenanceGroups: many(maintenanceGroups),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
  inspectedOrders: many(repairOrders),
}));

export const mechanicsRelations = relations(mechanics, ({ one, many }) => ({
  company: one(companies, {
    fields: [mechanics.companyId],
    references: [companies.id],
  }),
  repairOrders: many(repairOrders),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  company: one(companies, {
    fields: [customers.companyId],
    references: [companies.id],
  }),
  vehicles: many(vehicles),
  repairOrders: many(repairOrders),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  customer: one(customers, {
    fields: [vehicles.customerId],
    references: [customers.id],
  }),
  company: one(companies, {
    fields: [vehicles.companyId],
    references: [companies.id],
  }),
  repairOrders: many(repairOrders),
}));

export const repairOrdersRelations = relations(repairOrders, ({ one, many }) => ({
  vehicle: one(vehicles, {
    fields: [repairOrders.vehicleId],
    references: [vehicles.id],
  }),
  customer: one(customers, {
    fields: [repairOrders.customerId],
    references: [customers.id],
  }),
  mechanic: one(mechanics, {
    fields: [repairOrders.mechanicId],
    references: [mechanics.id],
  }),
  inspector: one(users, {
    fields: [repairOrders.inspectorId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [repairOrders.companyId],
    references: [companies.id],
  }),
  partsUsed: many(partsUsage),
}));

export const inventoryPartsRelations = relations(inventoryParts, ({ one, many }) => ({
  company: one(companies, {
    fields: [inventoryParts.companyId],
    references: [companies.id],
  }),
  usage: many(partsUsage),
  intakeItems: many(inventoryIntakeItems),
  maintenanceItems: many(maintenanceItems),
}));

export const inventoryIntakesRelations = relations(inventoryIntakes, ({ one, many }) => ({
  company: one(companies, {
    fields: [inventoryIntakes.companyId],
    references: [companies.id],
  }),
  createdBy: one(users, {
    fields: [inventoryIntakes.createdByUserId],
    references: [users.id],
  }),
  items: many(inventoryIntakeItems),
}));

export const inventoryIntakeItemsRelations = relations(inventoryIntakeItems, ({ one }) => ({
  intake: one(inventoryIntakes, {
    fields: [inventoryIntakeItems.inventoryIntakeId],
    references: [inventoryIntakes.id],
  }),
  part: one(inventoryParts, {
    fields: [inventoryIntakeItems.partId],
    references: [inventoryParts.id],
  }),
  company: one(companies, {
    fields: [inventoryIntakeItems.companyId],
    references: [companies.id],
  }),
}));

export const partsUsageRelations = relations(partsUsage, ({ one }) => ({
  repairOrder: one(repairOrders, {
    fields: [partsUsage.repairOrderId],
    references: [repairOrders.id],
  }),
  part: one(inventoryParts, {
    fields: [partsUsage.partId],
    references: [inventoryParts.id],
  }),
}));

// Maintenance Catalog Relations
export const maintenanceGroupsRelations = relations(maintenanceGroups, ({ one, many }) => ({
  company: one(companies, { fields: [maintenanceGroups.companyId], references: [companies.id] }),
  subgroups: many(maintenanceSubgroups),
}));

export const maintenanceSubgroupsRelations = relations(maintenanceSubgroups, ({ one, many }) => ({
  group: one(maintenanceGroups, { fields: [maintenanceSubgroups.groupId], references: [maintenanceGroups.id] }),
  company: one(companies, { fields: [maintenanceSubgroups.companyId], references: [companies.id] }),
  items: many(maintenanceItems),
}));

export const maintenanceItemsRelations = relations(maintenanceItems, ({ one }) => ({
  subgroup: one(maintenanceSubgroups, { fields: [maintenanceItems.subgroupId], references: [maintenanceSubgroups.id] }),
  company: one(companies, { fields: [maintenanceItems.companyId], references: [companies.id] }),
  part: one(inventoryParts, { fields: [maintenanceItems.partId], references: [inventoryParts.id] }),
}));

// Insert schemas
export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const upsertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertMechanicSchema = createInsertSchema(mechanics).omit({
  id: true,
  createdAt: true,
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  createdAt: true,
});

export const insertRepairOrderSchema = createInsertSchema(repairOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  orderNumber: true,
});

export const insertInventoryPartSchema = createInsertSchema(inventoryParts).omit({
  id: true,
  createdAt: true,
});

export const insertPartsUsageSchema = createInsertSchema(partsUsage).omit({
  id: true,
  createdAt: true,
});

export const insertInventoryIntakeSchema = createInsertSchema(inventoryIntakes).omit({
  id: true,
  createdAt: true,
});

export const insertInventoryIntakeItemSchema = createInsertSchema(inventoryIntakeItems).omit({
  id: true,
  createdAt: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
});

// Maintenance Catalog insert schemas
export const insertMaintenanceGroupSchema = createInsertSchema(maintenanceGroups).omit({ id: true, createdAt: true });
export const insertMaintenanceSubgroupSchema = createInsertSchema(maintenanceSubgroups).omit({ id: true, createdAt: true });
export const insertMaintenanceItemSchema = createInsertSchema(maintenanceItems).omit({ id: true, createdAt: true });

// Inventory Adjustments table — admin-only stock corrections
export const inventoryAdjustments = pgTable("inventory_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partId: varchar("part_id").notNull().references(() => inventoryParts.id),
  previousQty: integer("previous_qty").notNull(),
  newQty: integer("new_qty").notNull(),
  delta: integer("delta").notNull(),
  adjustmentType: text("adjustment_type").notNull(), // add | subtract | set
  reason: text("reason").notNull(),
  referenceNote: text("reference_note"),
  countSessionId: varchar("count_session_id").references(() => inventoryCountSessions.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryAdjustmentsRelations = relations(inventoryAdjustments, ({ one }) => ({
  part: one(inventoryParts, {
    fields: [inventoryAdjustments.partId],
    references: [inventoryParts.id],
  }),
  user: one(users, {
    fields: [inventoryAdjustments.userId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [inventoryAdjustments.companyId],
    references: [companies.id],
  }),
  countSession: one(inventoryCountSessions, {
    fields: [inventoryAdjustments.countSessionId],
    references: [inventoryCountSessions.id],
  }),
}));

export const insertInventoryAdjustmentSchema = createInsertSchema(inventoryAdjustments).omit({
  id: true,
  createdAt: true,
});

export type InventoryAdjustment = typeof inventoryAdjustments.$inferSelect;
export type InsertInventoryAdjustment = z.infer<typeof insertInventoryAdjustmentSchema>;

// Inventory Count Sessions — shop count workflow
export const inventoryCountSessions = pgTable("inventory_count_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  status: text("status").notNull().default("draft"), // draft | submitted | approved | rejected
  startedByUserId: varchar("started_by_user_id").references(() => users.id),
  submittedAt: timestamp("submitted_at"),
  reviewedByUserId: varchar("reviewed_by_user_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("unique_draft_per_company").on(table.companyId).where(sql`status = 'draft'`),
]);

export const inventoryCountItems = pgTable("inventory_count_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => inventoryCountSessions.id),
  partId: varchar("part_id").notNull().references(() => inventoryParts.id),
  systemQtySnapshot: integer("system_qty_snapshot").notNull(),
  countedQty: integer("counted_qty"),
  variance: integer("variance"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
});

export const inventoryCountSessionsRelations = relations(inventoryCountSessions, ({ one, many }) => ({
  company: one(companies, { fields: [inventoryCountSessions.companyId], references: [companies.id] }),
  startedBy: one(users, { fields: [inventoryCountSessions.startedByUserId], references: [users.id] }),
  reviewedBy: one(users, { fields: [inventoryCountSessions.reviewedByUserId], references: [users.id] }),
  items: many(inventoryCountItems),
  adjustments: many(inventoryAdjustments),
}));

export const inventoryCountItemsRelations = relations(inventoryCountItems, ({ one }) => ({
  session: one(inventoryCountSessions, { fields: [inventoryCountItems.sessionId], references: [inventoryCountSessions.id] }),
  part: one(inventoryParts, { fields: [inventoryCountItems.partId], references: [inventoryParts.id] }),
  company: one(companies, { fields: [inventoryCountItems.companyId], references: [companies.id] }),
}));

export const insertInventoryCountSessionSchema = createInsertSchema(inventoryCountSessions).omit({ id: true, createdAt: true });
export const insertInventoryCountItemSchema = createInsertSchema(inventoryCountItems).omit({ id: true });

export type InventoryCountSession = typeof inventoryCountSessions.$inferSelect;
export type InsertInventoryCountSession = z.infer<typeof insertInventoryCountSessionSchema>;
export type InventoryCountItem = typeof inventoryCountItems.$inferSelect;
export type InsertInventoryCountItem = z.infer<typeof insertInventoryCountItemSchema>;

// Admin Audit Log — tracks super admin company switches for accountability
export const adminAuditLog = pgTable("admin_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull().references(() => users.id),
  targetCompanyId: varchar("target_company_id").references(() => companies.id),
  action: text("action").notNull(), // switch_in | switch_out
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const adminAuditLogRelations = relations(adminAuditLog, ({ one }) => ({
  adminUser: one(users, {
    fields: [adminAuditLog.adminUserId],
    references: [users.id],
  }),
  targetCompany: one(companies, {
    fields: [adminAuditLog.targetCompanyId],
    references: [companies.id],
  }),
}));

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLog).omit({
  id: true,
  createdAt: true,
});

export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;

// Status lifecycle constants
export const WORK_ORDER_STATUSES = [
  "open",
  "in-progress",
  "on-hold",
  "completed",
  "delivered",
  "closed",
  "abandoned",
] as const;

export const ACTIVE_STATUSES = ["open", "in-progress", "on-hold"] as const;

export const SERVICE_TYPES = [
  "Preventive Maintenance",
  "Engine Repair",
  "Brake Service",
  "Tire Service",
  "Electrical",
  "Transmission",
  "Suspension",
  "Exhaust",
  "Air Conditioning",
  "DOT Inspection",
  "Oil Change",
  "Coolant Service",
  "Fuel System",
  "Body/Frame",
  "Other",
] as const;

export const TRUCK_TYPES = [
  "Semi-Truck (Day Cab)",
  "Semi-Truck (Sleeper)",
  "Box Truck",
  "Flatbed",
  "Tanker",
  "Refrigerated (Reefer)",
  "Dump Truck",
  "Step Deck",
  "Lowboy",
  "Dry Van",
  "Other",
] as const;

// Types
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = z.infer<typeof upsertUserSchema>;

export type Mechanic = typeof mechanics.$inferSelect;
export type InsertMechanic = z.infer<typeof insertMechanicSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;

export type RepairOrder = typeof repairOrders.$inferSelect;
export type InsertRepairOrder = z.infer<typeof insertRepairOrderSchema>;

export type InventoryPart = typeof inventoryParts.$inferSelect;
export type InsertInventoryPart = z.infer<typeof insertInventoryPartSchema>;

export type PartsUsage = typeof partsUsage.$inferSelect;
export type InsertPartsUsage = z.infer<typeof insertPartsUsageSchema>;

export type InventoryIntake = typeof inventoryIntakes.$inferSelect;
export type InsertInventoryIntake = z.infer<typeof insertInventoryIntakeSchema>;

export type InventoryIntakeItem = typeof inventoryIntakeItems.$inferSelect;
export type InsertInventoryIntakeItem = z.infer<typeof insertInventoryIntakeItemSchema>;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export type MaintenanceGroup = typeof maintenanceGroups.$inferSelect;
export type InsertMaintenanceGroup = z.infer<typeof insertMaintenanceGroupSchema>;

export type MaintenanceSubgroup = typeof maintenanceSubgroups.$inferSelect;
export type InsertMaintenanceSubgroup = z.infer<typeof insertMaintenanceSubgroupSchema>;

export type MaintenanceItem = typeof maintenanceItems.$inferSelect;
export type InsertMaintenanceItem = z.infer<typeof insertMaintenanceItemSchema>;
