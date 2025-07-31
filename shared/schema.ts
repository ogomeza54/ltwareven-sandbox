import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Companies table for multi-tenancy
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("basic"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Users table with company association
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("employee"),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Mechanics table
export const mechanics = pgTable("mechanics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  specialization: text("specialization").notNull(),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).notNull(),
  isAvailable: boolean("is_available").default(true).notNull(),
  currentWorkload: integer("current_workload").default(0).notNull(),
  maxWorkload: integer("max_workload").default(40).notNull(),
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

// Vehicles table
export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  year: integer("year").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  vin: text("vin"),
  licensePlate: text("license_plate"),
  color: text("color"),
  mileage: integer("mileage"),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Repair Orders table
export const repairOrders = pgTable("repair_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(),
  vehicleId: varchar("vehicle_id").notNull().references(() => vehicles.id),
  customerId: varchar("customer_id").notNull().references(() => customers.id),
  mechanicId: varchar("mechanic_id").references(() => mechanics.id),
  inspectorId: varchar("inspector_id").notNull().references(() => users.id),
  description: text("description").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
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

// Inventory Parts table
export const inventoryParts = pgTable("inventory_parts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  partNumber: text("part_number").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  quantityInStock: integer("quantity_in_stock").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  companyId: varchar("company_id").notNull().references(() => companies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Parts Usage table (junction table for repair orders and parts)
export const partsUsage = pgTable("parts_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  repairOrderId: varchar("repair_order_id").notNull().references(() => repairOrders.id),
  partId: varchar("part_id").notNull().references(() => inventoryParts.id),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
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

// Insert schemas
export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
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

// Types
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

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
