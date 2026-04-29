import { 
  companies, users, mechanics, customers, vehicles, repairOrders, inventoryParts, partsUsage,
  inventoryIntakes, inventoryIntakeItems, invoices, inventoryAdjustments,
  inventoryCountSessions, inventoryCountItems, adminAuditLog,
  type Company, type InsertCompany,
  type User, type InsertUser, type UpsertUser,
  type Mechanic, type InsertMechanic,
  type Customer, type InsertCustomer,
  type Vehicle, type InsertVehicle,
  type RepairOrder, type InsertRepairOrder,
  type InventoryPart, type InsertInventoryPart,
  type PartsUsage, type InsertPartsUsage,
  type InventoryIntake, type InsertInventoryIntake,
  type InventoryIntakeItem, type InsertInventoryIntakeItem,
  type Invoice, type InsertInvoice,
  type InventoryAdjustment, type InsertInventoryAdjustment,
  type InventoryCountSession, type AdminAuditLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";

export interface IStorage {
  // Company operations
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  getAllCompanies(): Promise<Company[]>;
  
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUsersByCompany(companyId: string): Promise<User[]>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsersWithCompany(): Promise<(User & { companyName?: string })[]>;
  createUserPlaceholder(userData: { email: string; role: string; companyId: string }): Promise<User>;
  updateUserRole(id: string, role: string, companyId: string): Promise<User>;
  
  // Mechanic operations
  getMechanicsByCompany(companyId: string): Promise<Mechanic[]>;
  getMechanic(id: string, companyId: string): Promise<Mechanic | undefined>;
  createMechanic(mechanic: InsertMechanic): Promise<Mechanic>;
  updateMechanic(id: string, companyId: string, updates: Partial<Mechanic>): Promise<Mechanic>;
  deleteMechanic(id: string, companyId: string): Promise<void>;
  getAvailableMechanics(companyId: string): Promise<Mechanic[]>;
  getMechanicsWithActiveHours(companyId: string): Promise<{ id: string; activeHours: number }[]>;
  getMechanicsWithWorkload(companyId: string): Promise<any[]>;
  recalculateMechanicWorkloads(companyId: string): Promise<void>;
  
  // Customer operations
  getCustomersByCompany(companyId: string): Promise<Customer[]>;
  getCustomer(id: string, companyId: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, companyId: string, updates: Partial<Customer>): Promise<Customer>;
  deleteCustomer(id: string, companyId: string): Promise<void>;
  getCustomerByPhone(phone: string, companyId: string): Promise<Customer | undefined>;
  
  // Vehicle operations
  getVehiclesByCompany(companyId: string): Promise<Vehicle[]>;
  getVehicle(id: string, companyId: string): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: string, companyId: string, updates: Partial<Vehicle>): Promise<Vehicle>;
  deleteVehicle(id: string, companyId: string): Promise<void>;
  getVehiclesByCustomer(customerId: string, companyId: string): Promise<Vehicle[]>;
  
  // Repair Order operations
  getRepairOrdersByCompany(companyId: string): Promise<any[]>;
  getRepairOrder(id: string, companyId: string): Promise<RepairOrder | undefined>;
  createRepairOrder(repairOrder: InsertRepairOrder): Promise<RepairOrder>;
  updateRepairOrder(id: string, companyId: string, updates: Partial<RepairOrder>): Promise<RepairOrder>;
  deleteRepairOrder(id: string, companyId: string): Promise<void>;
  getRepairOrdersByMechanic(mechanicId: string, companyId: string): Promise<RepairOrder[]>;
  getRepairOrdersByStatus(status: string, companyId: string): Promise<RepairOrder[]>;
  getRepairOrdersByStatuses(statuses: string[], companyId: string): Promise<any[]>;
  
  // Inventory operations
  getInventoryPartsByCompany(companyId: string): Promise<InventoryPart[]>;
  getInventoryPart(id: string, companyId: string): Promise<InventoryPart | undefined>;
  createInventoryPart(part: InsertInventoryPart): Promise<InventoryPart>;
  updateInventoryPart(id: string, companyId: string, updates: Partial<InventoryPart>): Promise<InventoryPart>;
  deleteInventoryPart(id: string, companyId: string): Promise<void>;
  getLowStockParts(companyId: string): Promise<InventoryPart[]>;
  searchParts(query: string, companyId: string): Promise<InventoryPart[]>;
  
  // Parts Usage operations
  getPartsUsageByRepairOrder(repairOrderId: string, companyId: string): Promise<any[]>;
  createPartsUsage(partsUsage: InsertPartsUsage, companyId: string): Promise<PartsUsage>;
  deletePartsUsage(id: string, companyId: string): Promise<void>;

  // Inventory Intake operations
  getInventoryIntakesByCompany(companyId: string): Promise<any[]>;
  getInventoryIntake(id: string, companyId: string): Promise<any | undefined>;
  createInventoryIntake(
    intakeHeader: Omit<InsertInventoryIntake, 'companyId' | 'createdByUserId'>,
    items: Array<{ partId?: string; partNameSnapshot: string; partNumberSnapshot: string; qty: number; unitCost: string; lineTotal: string }>,
    companyId: string,
    userId: string
  ): Promise<InventoryIntake>;

  // Inventory Adjustment operations
  createInventoryAdjustment(request: {
    partId: string;
    adjustmentType: string;
    quantity: number;
    reason: string;
    referenceNote?: string | null;
    userId: string;
    companyId: string;
  }): Promise<InventoryAdjustment>;
  getInventoryAdjustmentsByCompany(companyId: string): Promise<any[]>;
  getAllInventoryAdjustments(): Promise<any[]>;
  getAdjustmentsByCountSession(sessionId: string, companyId: string): Promise<any[]>;

  // Inventory Count Session operations
  createCountSession(companyId: string, userId: string, scope?: "all" | "low_stock" | "category", categoryFilter?: string | null): Promise<InventoryCountSession>;
  getOpenCountSession(companyId: string): Promise<InventoryCountSession | undefined>;
  getCountSessionsByCompany(companyId: string): Promise<any[]>;
  getCountSession(id: string, companyId: string): Promise<any | undefined>;
  updateCountItems(sessionId: string, items: { itemId: string; countedQty: number | null }[], companyId: string): Promise<void>;
  submitCountSession(id: string, companyId: string): Promise<InventoryCountSession>;
  approveCountSession(id: string, companyId: string, reviewedByUserId: string, adminNotes?: string): Promise<InventoryCountSession>;
  rejectCountSession(id: string, companyId: string, reviewedByUserId: string, adminNotes?: string): Promise<InventoryCountSession>;

  // Fleet vehicle search
  searchFleetVehicles(search: string, companyId: string): Promise<Vehicle[]>;

  // Invoice operations
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  getInvoicesByRepairOrder(repairOrderId: string, companyId: string): Promise<Invoice[]>;

  // Admin audit log operations
  createAdminAuditLog(entry: { adminUserId: string; targetCompanyId: string | null; action: string; note?: string }): Promise<AdminAuditLog>;
  getAdminAuditLog(limit?: number): Promise<any[]>;

  // Dashboard stats
  getDashboardStats(companyId: string): Promise<{
    activeOrders: number;
    availableMechanics: number;
    lowStockItems: number;
    monthlyRevenue: number;
  }>;
}

export class DuplicateDraftError extends Error {
  constructor(public readonly existingSessionId: string | null) {
    super("A draft count session already exists for this company");
    this.name = "DuplicateDraftError";
  }
}

export class DatabaseStorage implements IStorage {
  // ── Company ──────────────────────────────────────────────────────────────────
  async getAllCompanies(): Promise<Company[]> {
    return await db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company || undefined;
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(insertCompany).returning();
    return company;
  }

  // ── Users ────────────────────────────────────────────────────────────────────
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: { ...userData, updatedAt: new Date() },
      })
      .returning();
    return user;
  }

  async getUsersByCompany(companyId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.companyId, companyId));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getAllUsersWithCompany(): Promise<(User & { companyName?: string })[]> {
    const result = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        role: users.role,
        companyId: users.companyId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        companyName: companies.name,
      })
      .from(users)
      .leftJoin(companies, eq(users.companyId, companies.id))
      .orderBy(desc(users.createdAt));
    return result.map(u => ({ ...u, companyName: u.companyName || undefined }));
  }

  async createUserPlaceholder(userData: { email: string; role: string; companyId: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({ email: userData.email, role: userData.role, companyId: userData.companyId })
      .returning();
    return user;
  }

  async updateUserRole(id: string, role: string, companyId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ role, companyId, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // ── Mechanics ────────────────────────────────────────────────────────────────
  async getMechanicsByCompany(companyId: string): Promise<Mechanic[]> {
    return await db.select().from(mechanics)
      .where(eq(mechanics.companyId, companyId))
      .orderBy(asc(mechanics.name));
  }

  async getMechanic(id: string, companyId: string): Promise<Mechanic | undefined> {
    const [mechanic] = await db.select().from(mechanics)
      .where(and(eq(mechanics.id, id), eq(mechanics.companyId, companyId)));
    return mechanic || undefined;
  }

  async createMechanic(insertMechanic: InsertMechanic): Promise<Mechanic> {
    const [mechanic] = await db.insert(mechanics).values(insertMechanic).returning();
    return mechanic;
  }

  async updateMechanic(id: string, companyId: string, updates: Partial<Mechanic>): Promise<Mechanic> {
    const [mechanic] = await db.update(mechanics)
      .set(updates)
      .where(and(eq(mechanics.id, id), eq(mechanics.companyId, companyId)))
      .returning();
    return mechanic;
  }

  async deleteMechanic(id: string, companyId: string): Promise<void> {
    await db.delete(mechanics).where(and(eq(mechanics.id, id), eq(mechanics.companyId, companyId)));
  }

  async getAvailableMechanics(companyId: string): Promise<Mechanic[]> {
    return await db.select().from(mechanics)
      .where(and(eq(mechanics.companyId, companyId), eq(mechanics.isAvailable, true)))
      .orderBy(asc(mechanics.currentWorkload));
  }

  /**
   * Returns mechanics with their real-time active estimated hours
   * (sum of estimatedHours from orders with status: open, in-progress, on-hold)
   */
  async getMechanicsWithActiveHours(companyId: string): Promise<{ id: string; activeHours: number }[]> {
    const result = await db
      .select({
        id: mechanics.id,
        activeHours: sql<number>`COALESCE(SUM(CAST(${repairOrders.estimatedHours} AS numeric)), 0)`,
      })
      .from(mechanics)
      .leftJoin(
        repairOrders,
        and(
          eq(repairOrders.mechanicId, mechanics.id),
          sql`${repairOrders.status} IN ('open', 'in-progress', 'on-hold')`
        )
      )
      .where(eq(mechanics.companyId, companyId))
      .groupBy(mechanics.id);

    return result.map(r => ({ id: r.id, activeHours: Number(r.activeHours) }));
  }

  /**
   * Returns all mechanics with comprehensive workload data for the load-balance view.
   */
  async getMechanicsWithWorkload(companyId: string): Promise<any[]> {
    const mechanicsList = await this.getMechanicsByCompany(companyId);
    const activeHoursData = await this.getMechanicsWithActiveHours(companyId);
    const hoursMap = new Map(activeHoursData.map(m => [m.id, m.activeHours]));

    // Get active order counts per mechanic
    const orderCounts = await db
      .select({
        mechanicId: repairOrders.mechanicId,
        count: sql<number>`COUNT(*)`,
      })
      .from(repairOrders)
      .where(and(
        eq(repairOrders.companyId, companyId),
        sql`${repairOrders.status} IN ('open', 'in-progress', 'on-hold')`
      ))
      .groupBy(repairOrders.mechanicId);

    const countMap = new Map(orderCounts.map(r => [r.mechanicId, Number(r.count)]));

    return mechanicsList.map(m => ({
      ...m,
      activeOrderCount: countMap.get(m.id) ?? 0,
      activeHours: hoursMap.get(m.id) ?? 0,
      loadPercent: m.maxWorkload > 0
        ? Math.min(100, Math.round(((hoursMap.get(m.id) ?? 0) / m.maxWorkload) * 100))
        : 0,
    }));
  }

  /**
   * Recalculates currentWorkload (active order count) for all mechanics in a company.
   */
  async recalculateMechanicWorkloads(companyId: string): Promise<void> {
    const orderCounts = await db
      .select({
        mechanicId: repairOrders.mechanicId,
        count: sql<number>`COUNT(*)`,
      })
      .from(repairOrders)
      .where(and(
        eq(repairOrders.companyId, companyId),
        sql`${repairOrders.status} IN ('open', 'in-progress', 'on-hold')`
      ))
      .groupBy(repairOrders.mechanicId);

    const countMap = new Map(orderCounts.map(r => [r.mechanicId, Number(r.count)]));

    const allMechanics = await this.getMechanicsByCompany(companyId);
    for (const m of allMechanics) {
      await db.update(mechanics)
        .set({ currentWorkload: countMap.get(m.id) ?? 0 })
        .where(eq(mechanics.id, m.id));
    }
  }

  // ── Customers ────────────────────────────────────────────────────────────────
  async getCustomersByCompany(companyId: string): Promise<Customer[]> {
    return await db.select().from(customers).where(eq(customers.companyId, companyId));
  }

  async getCustomer(id: string, companyId: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers)
      .where(and(eq(customers.id, id), eq(customers.companyId, companyId)));
    return customer || undefined;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values(insertCustomer).returning();
    return customer;
  }

  async updateCustomer(id: string, companyId: string, updates: Partial<Customer>): Promise<Customer> {
    const [customer] = await db.update(customers)
      .set(updates)
      .where(and(eq(customers.id, id), eq(customers.companyId, companyId)))
      .returning();
    return customer;
  }

  async deleteCustomer(id: string, companyId: string): Promise<void> {
    await db.delete(customers).where(and(eq(customers.id, id), eq(customers.companyId, companyId)));
  }

  async getCustomerByPhone(phone: string, companyId: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers)
      .where(and(eq(customers.phone, phone), eq(customers.companyId, companyId)));
    return customer || undefined;
  }

  // ── Vehicles ─────────────────────────────────────────────────────────────────
  async getVehiclesByCompany(companyId: string): Promise<Vehicle[]> {
    return await db.select().from(vehicles).where(eq(vehicles.companyId, companyId));
  }

  async getVehicle(id: string, companyId: string): Promise<Vehicle | undefined> {
    const [vehicle] = await db.select().from(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)));
    return vehicle || undefined;
  }

  async createVehicle(insertVehicle: InsertVehicle): Promise<Vehicle> {
    const [vehicle] = await db.insert(vehicles).values(insertVehicle).returning();
    return vehicle;
  }

  async updateVehicle(id: string, companyId: string, updates: Partial<Vehicle>): Promise<Vehicle> {
    const [vehicle] = await db.update(vehicles)
      .set(updates)
      .where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)))
      .returning();
    return vehicle;
  }

  async deleteVehicle(id: string, companyId: string): Promise<void> {
    await db.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)));
  }

  async getVehiclesByCustomer(customerId: string, companyId: string): Promise<Vehicle[]> {
    return await db.select().from(vehicles)
      .where(and(eq(vehicles.customerId, customerId), eq(vehicles.companyId, companyId)));
  }

  // ── Repair Orders / Work Orders ───────────────────────────────────────────────
  async getRepairOrdersByCompany(companyId: string): Promise<any[]> {
    return await db.select({
      id: repairOrders.id,
      orderNumber: repairOrders.orderNumber,
      description: repairOrders.description,
      priority: repairOrders.priority,
      status: repairOrders.status,
      customerType: repairOrders.customerType,
      serviceType: repairOrders.serviceType,
      truckType: repairOrders.truckType,
      trailerNumber: repairOrders.trailerNumber,
      odometerIn: repairOrders.odometerIn,
      odometerOut: repairOrders.odometerOut,
      dotInspectionRequired: repairOrders.dotInspectionRequired,
      scheduledDate: repairOrders.scheduledDate,
      completedDate: repairOrders.completedDate,
      closedDate: repairOrders.closedDate,
      estimatedHours: repairOrders.estimatedHours,
      actualHours: repairOrders.actualHours,
      laborRate: repairOrders.laborRate,
      totalEstimate: repairOrders.totalEstimate,
      progressNotes: repairOrders.progressNotes,
      damagePhotos: repairOrders.damagePhotos,
      createdAt: repairOrders.createdAt,
      updatedAt: repairOrders.updatedAt,
      companyId: repairOrders.companyId,
      vehicle: {
        id: vehicles.id,
        year: vehicles.year,
        make: vehicles.make,
        model: vehicles.model,
        vin: vehicles.vin,
        licensePlate: vehicles.licensePlate,
        color: vehicles.color,
        mileage: vehicles.mileage,
      },
      customer: {
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
      },
      mechanic: {
        id: mechanics.id,
        name: mechanics.name,
        specialization: mechanics.specialization,
        hourlyRate: mechanics.hourlyRate,
        phone: mechanics.phone,
      }
    })
    .from(repairOrders)
    .leftJoin(vehicles, eq(repairOrders.vehicleId, vehicles.id))
    .leftJoin(customers, eq(repairOrders.customerId, customers.id))
    .leftJoin(mechanics, eq(repairOrders.mechanicId, mechanics.id))
    .where(eq(repairOrders.companyId, companyId))
    .orderBy(desc(repairOrders.createdAt));
  }

  async getRepairOrder(id: string, companyId: string): Promise<RepairOrder | undefined> {
    const [order] = await db.select().from(repairOrders)
      .where(and(eq(repairOrders.id, id), eq(repairOrders.companyId, companyId)));
    return order || undefined;
  }

  async createRepairOrder(insertRepairOrder: InsertRepairOrder): Promise<RepairOrder> {
    const orderNumber = `WO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const [order] = await db.insert(repairOrders)
      .values({ ...insertRepairOrder, orderNumber })
      .returning();
    return order;
  }

  async updateRepairOrder(id: string, companyId: string, updates: Partial<RepairOrder>): Promise<RepairOrder> {
    const [order] = await db.update(repairOrders)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(repairOrders.id, id), eq(repairOrders.companyId, companyId)))
      .returning();
    return order;
  }

  async deleteRepairOrder(id: string, companyId: string): Promise<void> {
    await db.delete(partsUsage).where(eq(partsUsage.repairOrderId, id));
    await db.delete(repairOrders)
      .where(and(eq(repairOrders.id, id), eq(repairOrders.companyId, companyId)));
  }

  async getRepairOrdersByMechanic(mechanicId: string, companyId: string): Promise<RepairOrder[]> {
    return await db.select().from(repairOrders)
      .where(and(eq(repairOrders.mechanicId, mechanicId), eq(repairOrders.companyId, companyId)))
      .orderBy(desc(repairOrders.createdAt));
  }

  async getRepairOrdersByStatus(status: string, companyId: string): Promise<RepairOrder[]> {
    return await db.select().from(repairOrders)
      .where(and(eq(repairOrders.status, status), eq(repairOrders.companyId, companyId)))
      .orderBy(desc(repairOrders.createdAt));
  }

  async getRepairOrdersByStatuses(statuses: string[], companyId: string): Promise<any[]> {
    return await db.select({
      id: repairOrders.id,
      orderNumber: repairOrders.orderNumber,
      mechanicId: repairOrders.mechanicId,
      priority: repairOrders.priority,
      status: repairOrders.status,
      estimatedHours: repairOrders.estimatedHours,
      serviceType: repairOrders.serviceType,
    })
    .from(repairOrders)
    .where(and(
      eq(repairOrders.companyId, companyId),
      sql`${repairOrders.status} = ANY(ARRAY[${sql.join(statuses.map(s => sql`${s}`), sql`, `)}])`
    ))
    .orderBy(desc(repairOrders.createdAt));
  }

  // ── Inventory ────────────────────────────────────────────────────────────────
  async getInventoryPartsByCompany(companyId: string): Promise<InventoryPart[]> {
    return await db.select().from(inventoryParts)
      .where(eq(inventoryParts.companyId, companyId))
      .orderBy(asc(inventoryParts.name));
  }

  async getInventoryPart(id: string, companyId: string): Promise<InventoryPart | undefined> {
    const [part] = await db.select().from(inventoryParts)
      .where(and(eq(inventoryParts.id, id), eq(inventoryParts.companyId, companyId)));
    return part || undefined;
  }

  async createInventoryPart(insertPart: InsertInventoryPart): Promise<InventoryPart> {
    const [part] = await db.insert(inventoryParts).values(insertPart).returning();
    return part;
  }

  async updateInventoryPart(id: string, companyId: string, updates: Partial<InventoryPart>): Promise<InventoryPart> {
    const [part] = await db.update(inventoryParts)
      .set(updates)
      .where(and(eq(inventoryParts.id, id), eq(inventoryParts.companyId, companyId)))
      .returning();
    return part;
  }

  async deleteInventoryPart(id: string, companyId: string): Promise<void> {
    await db.delete(inventoryParts)
      .where(and(eq(inventoryParts.id, id), eq(inventoryParts.companyId, companyId)));
  }

  async getLowStockParts(companyId: string): Promise<InventoryPart[]> {
    return await db.select().from(inventoryParts)
      .where(and(
        eq(inventoryParts.companyId, companyId),
        sql`${inventoryParts.quantityInStock} <= ${inventoryParts.lowStockThreshold}`
      ));
  }

  async searchParts(query: string, companyId: string): Promise<InventoryPart[]> {
    return await db.select().from(inventoryParts)
      .where(and(
        eq(inventoryParts.companyId, companyId),
        sql`${inventoryParts.name} ILIKE ${'%' + query + '%'} OR ${inventoryParts.partNumber} ILIKE ${'%' + query + '%'}`
      ))
      .limit(10);
  }

  // ── Parts Usage ───────────────────────────────────────────────────────────────
  async getPartsUsageByRepairOrder(repairOrderId: string, companyId: string): Promise<any[]> {
    const order = await db.select().from(repairOrders)
      .where(and(eq(repairOrders.id, repairOrderId), eq(repairOrders.companyId, companyId)));
    if (order.length === 0) return [];
    
    return await db.select({
      id: partsUsage.id,
      repairOrderId: partsUsage.repairOrderId,
      partId: partsUsage.partId,
      quantity: partsUsage.quantity,
      unitPrice: partsUsage.unitPrice,
      createdAt: partsUsage.createdAt,
      part: {
        id: inventoryParts.id,
        name: inventoryParts.name,
        partNumber: inventoryParts.partNumber,
        description: inventoryParts.description,
        price: inventoryParts.price,
      }
    })
    .from(partsUsage)
    .leftJoin(inventoryParts, eq(partsUsage.partId, inventoryParts.id))
    .where(eq(partsUsage.repairOrderId, repairOrderId));
  }

  async createPartsUsage(insertPartsUsage: InsertPartsUsage, companyId: string): Promise<PartsUsage> {
    // Verify the repair order belongs to this company
    const order = await db.select().from(repairOrders)
      .where(and(eq(repairOrders.id, insertPartsUsage.repairOrderId), eq(repairOrders.companyId, companyId)));
    if (order.length === 0) throw new Error("Work order not found");
    
    const [usage] = await db.insert(partsUsage).values(insertPartsUsage).returning();
    
    // Deduct inventory
    await db.update(inventoryParts)
      .set({ quantityInStock: sql`${inventoryParts.quantityInStock} - ${insertPartsUsage.quantity}` })
      .where(and(eq(inventoryParts.id, insertPartsUsage.partId), eq(inventoryParts.companyId, companyId)));
    
    return usage;
  }

  async deletePartsUsage(id: string, companyId: string): Promise<void> {
    const [usage] = await db.select({
      id: partsUsage.id,
      partId: partsUsage.partId,
      quantity: partsUsage.quantity,
    }).from(partsUsage)
      .innerJoin(repairOrders, eq(partsUsage.repairOrderId, repairOrders.id))
      .where(and(eq(partsUsage.id, id), eq(repairOrders.companyId, companyId)));
    
    if (usage) {
      // Restore inventory
      await db.update(inventoryParts)
        .set({ quantityInStock: sql`${inventoryParts.quantityInStock} + ${usage.quantity}` })
        .where(eq(inventoryParts.id, usage.partId));
      
      await db.delete(partsUsage).where(eq(partsUsage.id, id));
    }
  }

  // ── Inventory Intakes ─────────────────────────────────────────────────────────
  async getInventoryIntakesByCompany(companyId: string): Promise<any[]> {
    const intakes = await db.select().from(inventoryIntakes)
      .where(eq(inventoryIntakes.companyId, companyId))
      .orderBy(desc(inventoryIntakes.createdAt));

    // Get item counts per intake
    const counts = await db.select({
      intakeId: inventoryIntakeItems.inventoryIntakeId,
      itemCount: sql<number>`COUNT(*)`,
    }).from(inventoryIntakeItems)
      .where(eq(inventoryIntakeItems.companyId, companyId))
      .groupBy(inventoryIntakeItems.inventoryIntakeId);

    const countMap = new Map(counts.map(c => [c.intakeId, Number(c.itemCount)]));
    return intakes.map(i => ({ ...i, itemCount: countMap.get(i.id) ?? 0 }));
  }

  async getInventoryIntake(id: string, companyId: string): Promise<any | undefined> {
    const [intake] = await db.select().from(inventoryIntakes)
      .where(and(eq(inventoryIntakes.id, id), eq(inventoryIntakes.companyId, companyId)));
    if (!intake) return undefined;

    const items = await db.select().from(inventoryIntakeItems)
      .where(eq(inventoryIntakeItems.inventoryIntakeId, id))
      .orderBy(asc(inventoryIntakeItems.createdAt));

    return { ...intake, items };
  }

  async createInventoryIntake(
    intakeHeader: Omit<InsertInventoryIntake, 'companyId' | 'createdByUserId'>,
    items: Array<{ partId?: string; partNameSnapshot: string; partNumberSnapshot: string; qty: number; unitCost: string; lineTotal: string }>,
    companyId: string,
    userId: string
  ): Promise<InventoryIntake> {
    // Validate that any provided partIds belong to this company before we write anything
    const linkedPartIds = items.map(i => i.partId).filter(Boolean) as string[];
    if (linkedPartIds.length > 0) {
      const ownedParts = await db.select({ id: inventoryParts.id })
        .from(inventoryParts)
        .where(and(
          inArray(inventoryParts.id, linkedPartIds),
          eq(inventoryParts.companyId, companyId)
        ));
      const ownedIds = new Set(ownedParts.map(p => p.id));
      for (const id of linkedPartIds) {
        if (!ownedIds.has(id)) {
          throw new Error(`Part ${id} not found in company inventory`);
        }
      }
    }

    // Wrap everything in a transaction for all-or-nothing consistency
    return await db.transaction(async (tx) => {
      const [intake] = await tx.insert(inventoryIntakes)
        .values({ ...intakeHeader, companyId, createdByUserId: userId })
        .returning();

      if (items.length > 0) {
        await tx.insert(inventoryIntakeItems).values(
          items.map(item => ({
            inventoryIntakeId: intake.id,
            partId: item.partId || null,
            partNameSnapshot: item.partNameSnapshot,
            partNumberSnapshot: item.partNumberSnapshot,
            qty: item.qty,
            unitCost: item.unitCost,
            lineTotal: item.lineTotal,
            companyId,
          }))
        );

        // Increment stock for all linked parts
        for (const item of items) {
          if (item.partId) {
            await tx.update(inventoryParts)
              .set({ quantityInStock: sql`${inventoryParts.quantityInStock} + ${item.qty}` })
              .where(and(eq(inventoryParts.id, item.partId), eq(inventoryParts.companyId, companyId)));
          }
        }
      }

      return intake;
    });
  }

  // ── Inventory Adjustments ─────────────────────────────────────────────────────
  async createInventoryAdjustment(request: {
    partId: string;
    adjustmentType: string;
    quantity: number;
    reason: string;
    referenceNote?: string | null;
    userId: string;
    companyId: string;
  }): Promise<InventoryAdjustment> {
    return await db.transaction(async (tx) => {
      // SELECT FOR UPDATE acquires an exclusive row lock, preventing concurrent adjustment races
      const [part] = await tx
        .select({ qty: inventoryParts.quantityInStock })
        .from(inventoryParts)
        .where(and(eq(inventoryParts.id, request.partId), eq(inventoryParts.companyId, request.companyId)))
        .for("update");

      if (!part) throw new Error("Part not found or access denied");

      const previousQty = part.qty;
      let newQty: number;

      if (request.adjustmentType === "add") newQty = previousQty + request.quantity;
      else if (request.adjustmentType === "subtract") newQty = previousQty - request.quantity;
      else newQty = request.quantity; // set

      if (newQty < 0) throw new Error("Resulting quantity cannot be negative");
      const delta = newQty - previousQty;

      await tx.update(inventoryParts)
        .set({ quantityInStock: newQty })
        .where(and(eq(inventoryParts.id, request.partId), eq(inventoryParts.companyId, request.companyId)));

      const [adjustment] = await tx.insert(inventoryAdjustments).values({
        partId: request.partId,
        previousQty,
        newQty,
        delta,
        adjustmentType: request.adjustmentType,
        reason: request.reason,
        referenceNote: request.referenceNote ?? null,
        userId: request.userId,
        companyId: request.companyId,
      }).returning();

      return adjustment;
    });
  }

  async getInventoryAdjustmentsByCompany(companyId: string): Promise<any[]> {
    return await db.select({
      id: inventoryAdjustments.id,
      partId: inventoryAdjustments.partId,
      previousQty: inventoryAdjustments.previousQty,
      newQty: inventoryAdjustments.newQty,
      delta: inventoryAdjustments.delta,
      adjustmentType: inventoryAdjustments.adjustmentType,
      reason: inventoryAdjustments.reason,
      referenceNote: inventoryAdjustments.referenceNote,
      countSessionId: inventoryAdjustments.countSessionId,
      userId: inventoryAdjustments.userId,
      createdAt: inventoryAdjustments.createdAt,
      partName: inventoryParts.name,
      partNumber: inventoryParts.partNumber,
      performedBy: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email}, 'Unknown')`,
    })
    .from(inventoryAdjustments)
    .leftJoin(inventoryParts, eq(inventoryAdjustments.partId, inventoryParts.id))
    .leftJoin(users, eq(inventoryAdjustments.userId, users.id))
    .where(eq(inventoryAdjustments.companyId, companyId))
    .orderBy(desc(inventoryAdjustments.createdAt));
  }

  async getAllInventoryAdjustments(): Promise<any[]> {
    return await db.select({
      id: inventoryAdjustments.id,
      partId: inventoryAdjustments.partId,
      previousQty: inventoryAdjustments.previousQty,
      newQty: inventoryAdjustments.newQty,
      delta: inventoryAdjustments.delta,
      adjustmentType: inventoryAdjustments.adjustmentType,
      reason: inventoryAdjustments.reason,
      referenceNote: inventoryAdjustments.referenceNote,
      countSessionId: inventoryAdjustments.countSessionId,
      userId: inventoryAdjustments.userId,
      companyId: inventoryAdjustments.companyId,
      createdAt: inventoryAdjustments.createdAt,
      partName: inventoryParts.name,
      partNumber: inventoryParts.partNumber,
      performedBy: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email}, 'Unknown')`,
    })
    .from(inventoryAdjustments)
    .leftJoin(inventoryParts, eq(inventoryAdjustments.partId, inventoryParts.id))
    .leftJoin(users, eq(inventoryAdjustments.userId, users.id))
    .orderBy(desc(inventoryAdjustments.createdAt));
  }

  async getAdjustmentsByCountSession(sessionId: string, companyId: string): Promise<any[]> {
    return await db.select({
      id: inventoryAdjustments.id,
      partId: inventoryAdjustments.partId,
      previousQty: inventoryAdjustments.previousQty,
      newQty: inventoryAdjustments.newQty,
      delta: inventoryAdjustments.delta,
      adjustmentType: inventoryAdjustments.adjustmentType,
      reason: inventoryAdjustments.reason,
      createdAt: inventoryAdjustments.createdAt,
      partName: inventoryParts.name,
      partNumber: inventoryParts.partNumber,
    })
    .from(inventoryAdjustments)
    .leftJoin(inventoryParts, eq(inventoryAdjustments.partId, inventoryParts.id))
    .where(and(
      eq(inventoryAdjustments.countSessionId, sessionId),
      eq(inventoryAdjustments.companyId, companyId),
    ))
    .orderBy(desc(inventoryAdjustments.createdAt));
  }

  // ── Inventory Count Sessions ──────────────────────────────────────────────────

  async getOpenCountSession(companyId: string): Promise<InventoryCountSession | undefined> {
    const [session] = await db.select().from(inventoryCountSessions)
      .where(and(eq(inventoryCountSessions.companyId, companyId), inArray(inventoryCountSessions.status, ["draft", "submitted"])))
      .orderBy(sql`CASE WHEN ${inventoryCountSessions.status} = 'submitted' THEN 0 ELSE 1 END`)
      .limit(1);
    return session;
  }

  async createCountSession(companyId: string, userId: string, scope: "all" | "low_stock" | "category" = "all", categoryFilter?: string | null): Promise<InventoryCountSession> {
    let session: InventoryCountSession;
    try {
      const [created] = await db.insert(inventoryCountSessions).values({
        companyId,
        status: "draft",
        startedByUserId: userId,
      }).returning();
      session = created;
    } catch (err: any) {
      if (err?.code === "23505") {
        const existing = await this.getOpenCountSession(companyId);
        throw new DuplicateDraftError(existing?.id ?? null);
      }
      throw err;
    }

    const allParts = await this.getInventoryPartsByCompany(companyId);
    let parts = allParts;
    if (scope === "low_stock") {
      parts = allParts.filter(p => p.quantityInStock <= p.lowStockThreshold);
    } else if (scope === "category" && categoryFilter) {
      parts = allParts.filter(p => p.category && p.category.toLowerCase() === categoryFilter.toLowerCase());
    }

    if (parts.length > 0) {
      await db.insert(inventoryCountItems).values(
        parts.map(p => ({
          sessionId: session.id,
          partId: p.id,
          systemQtySnapshot: p.quantityInStock,
          countedQty: null,
          variance: null,
          companyId,
        }))
      );
    }
    return session;
  }

  async getCountSessionsByCompany(companyId: string): Promise<any[]> {
    const sessions = await db.select().from(inventoryCountSessions)
      .where(eq(inventoryCountSessions.companyId, companyId))
      .orderBy(desc(inventoryCountSessions.createdAt));

    const result = [];
    for (const s of sessions) {
      const items = await db.select().from(inventoryCountItems)
        .where(eq(inventoryCountItems.sessionId, s.id));
      const totalVariance = items.reduce((sum, i) => sum + Math.abs(i.variance ?? 0), 0);
      const itemsWithVariance = items.filter(i => (i.variance ?? 0) !== 0).length;
      const itemsEntered = items.filter(i => i.countedQty !== null).length;

      let startedByName: string | null = null;
      if (s.startedByUserId) {
        const [u] = await db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
          .from(users).where(eq(users.id, s.startedByUserId));
        if (u) startedByName = u.firstName ? `${u.firstName} ${u.lastName ?? ""}`.trim() : u.email;
      }

      result.push({
        ...s,
        totalItems: items.length,
        itemsEntered,
        itemsWithVariance,
        totalVariance,
        startedByName,
        adjustedPartsCount: null as number | null,
        netDelta: null as number | null,
      });
    }

    const approvedSessionIds = result
      .filter(s => s.status === "approved")
      .map(s => s.id);

    if (approvedSessionIds.length > 0) {
      const adjAggRows = await db
        .select({
          countSessionId: inventoryAdjustments.countSessionId,
          partsCount: sql<number>`cast(count(*) as int)`,
          netDelta: sql<number>`cast(coalesce(sum(${inventoryAdjustments.delta}), 0) as int)`,
        })
        .from(inventoryAdjustments)
        .where(inArray(inventoryAdjustments.countSessionId, approvedSessionIds))
        .groupBy(inventoryAdjustments.countSessionId);

      const adjBySession = new Map(adjAggRows.map(r => [r.countSessionId, r]));
      for (const s of result) {
        if (s.status === "approved") {
          const agg = adjBySession.get(s.id);
          s.adjustedPartsCount = agg ? agg.partsCount : 0;
          s.netDelta = agg ? agg.netDelta : 0;
        }
      }
    }

    return result;
  }

  async getCountSession(id: string, companyId: string): Promise<any | undefined> {
    const [session] = await db.select().from(inventoryCountSessions)
      .where(and(eq(inventoryCountSessions.id, id), eq(inventoryCountSessions.companyId, companyId)));
    if (!session) return undefined;

    const items = await db.select({
      id: inventoryCountItems.id,
      sessionId: inventoryCountItems.sessionId,
      partId: inventoryCountItems.partId,
      systemQtySnapshot: inventoryCountItems.systemQtySnapshot,
      countedQty: inventoryCountItems.countedQty,
      variance: inventoryCountItems.variance,
      partName: inventoryParts.name,
      partNumber: inventoryParts.partNumber,
      partDescription: inventoryParts.description,
      currentQty: inventoryParts.quantityInStock,
    })
    .from(inventoryCountItems)
    .leftJoin(inventoryParts, eq(inventoryCountItems.partId, inventoryParts.id))
    .where(eq(inventoryCountItems.sessionId, id))
    .orderBy(asc(inventoryParts.name));

    let startedByName: string | null = null;
    if (session.startedByUserId) {
      const [u] = await db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users).where(eq(users.id, session.startedByUserId));
      if (u) startedByName = u.firstName ? `${u.firstName} ${u.lastName ?? ""}`.trim() : u.email;
    }

    let reviewedByName: string | null = null;
    if (session.reviewedByUserId) {
      const [u] = await db.select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users).where(eq(users.id, session.reviewedByUserId));
      if (u) reviewedByName = u.firstName ? `${u.firstName} ${u.lastName ?? ""}`.trim() : u.email;
    }

    return { ...session, items, startedByName, reviewedByName };
  }

  async updateCountItems(sessionId: string, items: { itemId: string; countedQty: number | null }[], companyId: string): Promise<void> {
    const [session] = await db.select({ status: inventoryCountSessions.status })
      .from(inventoryCountSessions)
      .where(and(eq(inventoryCountSessions.id, sessionId), eq(inventoryCountSessions.companyId, companyId)));
    if (!session) throw new Error("Count session not found or access denied");
    if (session.status !== "draft") throw new Error("Only draft sessions can be edited");

    for (const { itemId, countedQty } of items) {
      const [existing] = await db.select()
        .from(inventoryCountItems)
        .where(and(
          eq(inventoryCountItems.id, itemId),
          eq(inventoryCountItems.sessionId, sessionId),
          eq(inventoryCountItems.companyId, companyId),
        ));
      if (!existing) continue;
      const variance = countedQty !== null ? countedQty - existing.systemQtySnapshot : null;
      await db.update(inventoryCountItems)
        .set({ countedQty, variance })
        .where(and(
          eq(inventoryCountItems.id, itemId),
          eq(inventoryCountItems.sessionId, sessionId),
          eq(inventoryCountItems.companyId, companyId),
        ));
    }
  }

  async submitCountSession(id: string, companyId: string): Promise<InventoryCountSession> {
    const [current] = await db.select({ status: inventoryCountSessions.status })
      .from(inventoryCountSessions)
      .where(and(eq(inventoryCountSessions.id, id), eq(inventoryCountSessions.companyId, companyId)));
    if (!current) throw new Error("Count session not found");
    if (current.status !== "draft") throw new Error("Only draft sessions can be submitted");

    const [session] = await db.update(inventoryCountSessions)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(and(eq(inventoryCountSessions.id, id), eq(inventoryCountSessions.companyId, companyId)))
      .returning();
    return session;
  }

  async approveCountSession(id: string, companyId: string, reviewedByUserId: string, adminNotes?: string): Promise<InventoryCountSession> {
    return await db.transaction(async (tx) => {
      const [current] = await tx.select()
        .from(inventoryCountSessions)
        .where(and(eq(inventoryCountSessions.id, id), eq(inventoryCountSessions.companyId, companyId)))
        .for("update");
      if (!current) throw new Error("Count session not found");
      if (current.status !== "submitted") throw new Error("Only submitted sessions can be approved");

      const items = await tx.select({
        id: inventoryCountItems.id,
        partId: inventoryCountItems.partId,
        variance: inventoryCountItems.variance,
        systemQtySnapshot: inventoryCountItems.systemQtySnapshot,
      })
      .from(inventoryCountItems)
      .where(and(eq(inventoryCountItems.sessionId, id), eq(inventoryCountItems.companyId, companyId)));

      const itemsWithVariance = items.filter(i => i.variance !== null && i.variance !== 0);

      for (const item of itemsWithVariance) {
        const [part] = await tx
          .select({ qty: inventoryParts.quantityInStock })
          .from(inventoryParts)
          .where(and(eq(inventoryParts.id, item.partId), eq(inventoryParts.companyId, companyId)))
          .for("update");
        if (!part) continue;

        const previousQty = part.qty;
        const variance = item.variance!;
        const newQty = Math.max(0, previousQty + variance);
        const delta = newQty - previousQty;
        const adjustmentType = variance > 0 ? "add" : "subtract";

        await tx.update(inventoryParts)
          .set({ quantityInStock: newQty })
          .where(and(eq(inventoryParts.id, item.partId), eq(inventoryParts.companyId, companyId)));

        await tx.insert(inventoryAdjustments).values({
          partId: item.partId,
          previousQty,
          newQty,
          delta,
          adjustmentType,
          reason: `Physical count — variance correction`,
          referenceNote: `Inventory count session approved`,
          countSessionId: id,
          userId: reviewedByUserId,
          companyId,
        });
      }

      const [session] = await tx.update(inventoryCountSessions)
        .set({ status: "approved", reviewedByUserId, reviewedAt: new Date(), adminNotes: adminNotes ?? null })
        .where(and(eq(inventoryCountSessions.id, id), eq(inventoryCountSessions.companyId, companyId)))
        .returning();
      return session;
    });
  }

  async rejectCountSession(id: string, companyId: string, reviewedByUserId: string, adminNotes?: string): Promise<InventoryCountSession> {
    const [current] = await db.select({ status: inventoryCountSessions.status })
      .from(inventoryCountSessions)
      .where(and(eq(inventoryCountSessions.id, id), eq(inventoryCountSessions.companyId, companyId)));
    if (!current) throw new Error("Count session not found");
    if (current.status !== "submitted") throw new Error("Only submitted sessions can be rejected");

    const [session] = await db.update(inventoryCountSessions)
      .set({ status: "rejected", reviewedByUserId, reviewedAt: new Date(), adminNotes: adminNotes ?? null })
      .where(and(eq(inventoryCountSessions.id, id), eq(inventoryCountSessions.companyId, companyId)))
      .returning();
    return session;
  }

  // ── Fleet Vehicle Search ──────────────────────────────────────────────────────
  async searchFleetVehicles(search: string, companyId: string): Promise<Vehicle[]> {
    return await db.select().from(vehicles)
      .where(and(
        eq(vehicles.companyId, companyId),
        // Restrict to actual fleet units: explicitly flagged as company-fleet OR no customer owner
        sql`(${vehicles.fleetType} = 'company-fleet' OR ${vehicles.customerId} IS NULL)`,
        sql`(
          ${vehicles.tractorNumber} ILIKE ${'%' + search + '%'} OR
          ${vehicles.vin} ILIKE ${'%' + search + '%'} OR
          ${vehicles.licensePlate} ILIKE ${'%' + search + '%'} OR
          ${vehicles.make} ILIKE ${'%' + search + '%'} OR
          ${vehicles.model} ILIKE ${'%' + search + '%'}
        )`
      ))
      .limit(10);
  }

  // ── Invoices ──────────────────────────────────────────────────────────────────
  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async getInvoicesByRepairOrder(repairOrderId: string, companyId: string): Promise<Invoice[]> {
    return await db.select().from(invoices)
      .where(and(eq(invoices.repairOrderId, repairOrderId), eq(invoices.companyId, companyId)));
  }

  // ── Dashboard Stats ────────────────────────────────────────────────────────────
  async getDashboardStats(companyId: string): Promise<{
    activeOrders: number;
    availableMechanics: number;
    lowStockItems: number;
    monthlyRevenue: number;
  }> {
    const activeOrdersResult = await db.select({ count: sql<number>`count(*)` })
      .from(repairOrders)
      .where(and(
        eq(repairOrders.companyId, companyId),
        sql`${repairOrders.status} IN ('open', 'in-progress', 'on-hold')`
      ));

    const availableMechanicsResult = await db.select({ count: sql<number>`count(*)` })
      .from(mechanics)
      .where(and(eq(mechanics.companyId, companyId), eq(mechanics.isAvailable, true)));

    const lowStockResult = await db.select({ count: sql<number>`count(*)` })
      .from(inventoryParts)
      .where(and(
        eq(inventoryParts.companyId, companyId),
        sql`${inventoryParts.quantityInStock} <= ${inventoryParts.lowStockThreshold}`
      ));

    const monthlyRevenueResult = await db.select({ 
      total: sql<number>`COALESCE(SUM(${repairOrders.totalEstimate}), 0)` 
    })
    .from(repairOrders)
    .where(and(
      eq(repairOrders.companyId, companyId),
      sql`${repairOrders.status} IN ('closed', 'delivered')`,
      sql`${repairOrders.updatedAt} >= date_trunc('month', CURRENT_DATE)`
    ));

    return {
      activeOrders: Number(activeOrdersResult[0]?.count || 0),
      availableMechanics: Number(availableMechanicsResult[0]?.count || 0),
      lowStockItems: Number(lowStockResult[0]?.count || 0),
      monthlyRevenue: Number(monthlyRevenueResult[0]?.total || 0),
    };
  }

  // ── Admin Audit Log ───────────────────────────────────────────────────────────
  async createAdminAuditLog(entry: { adminUserId: string; targetCompanyId: string | null; action: string; note?: string }): Promise<AdminAuditLog> {
    const [log] = await db.insert(adminAuditLog).values({
      adminUserId: entry.adminUserId,
      targetCompanyId: entry.targetCompanyId ?? null,
      action: entry.action,
      note: entry.note ?? null,
    }).returning();
    return log;
  }

  async getAdminAuditLog(limit = 100): Promise<any[]> {
    return await db
      .select({
        id: adminAuditLog.id,
        action: adminAuditLog.action,
        note: adminAuditLog.note,
        createdAt: adminAuditLog.createdAt,
        adminUserId: adminAuditLog.adminUserId,
        adminFirstName: users.firstName,
        adminLastName: users.lastName,
        adminEmail: users.email,
        targetCompanyId: adminAuditLog.targetCompanyId,
        targetCompanyName: companies.name,
      })
      .from(adminAuditLog)
      .leftJoin(users, eq(adminAuditLog.adminUserId, users.id))
      .leftJoin(companies, eq(adminAuditLog.targetCompanyId, companies.id))
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();
