import { 
  companies, users, mechanics, customers, vehicles, repairOrders, inventoryParts, partsUsage,
  inventoryIntakes, inventoryIntakeItems, invoices,
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

  // Fleet vehicle search
  searchFleetVehicles(search: string, companyId: string): Promise<Vehicle[]>;

  // Invoice operations
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  getInvoicesByRepairOrder(repairOrderId: string, companyId: string): Promise<Invoice[]>;
  
  // Dashboard stats
  getDashboardStats(companyId: string): Promise<{
    activeOrders: number;
    availableMechanics: number;
    lowStockItems: number;
    monthlyRevenue: number;
  }>;
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
}

export const storage = new DatabaseStorage();
