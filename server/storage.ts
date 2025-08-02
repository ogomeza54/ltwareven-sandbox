import { 
  companies, users, mechanics, customers, vehicles, repairOrders, inventoryParts, partsUsage,
  type Company, type InsertCompany,
  type User, type InsertUser, type UpsertUser,
  type Mechanic, type InsertMechanic,
  type Customer, type InsertCustomer,
  type Vehicle, type InsertVehicle,
  type RepairOrder, type InsertRepairOrder,
  type InventoryPart, type InsertInventoryPart,
  type PartsUsage, type InsertPartsUsage
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, asc } from "drizzle-orm";

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
  getMechanic(id: string): Promise<Mechanic | undefined>;
  createMechanic(mechanic: InsertMechanic): Promise<Mechanic>;
  updateMechanic(id: string, updates: Partial<Mechanic>): Promise<Mechanic>;
  getAvailableMechanics(companyId: string): Promise<Mechanic[]>;
  
  // Customer operations
  getCustomersByCompany(companyId: string): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  getCustomerByPhone(phone: string, companyId: string): Promise<Customer | undefined>;
  
  // Vehicle operations
  getVehiclesByCompany(companyId: string): Promise<Vehicle[]>;
  getVehicle(id: string): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  getVehiclesByCustomer(customerId: string): Promise<Vehicle[]>;
  
  // Repair Order operations
  getRepairOrdersByCompany(companyId: string): Promise<RepairOrder[]>;
  getRepairOrder(id: string): Promise<RepairOrder | undefined>;
  createRepairOrder(repairOrder: InsertRepairOrder): Promise<RepairOrder>;
  updateRepairOrder(id: string, updates: Partial<RepairOrder>): Promise<RepairOrder>;
  getRepairOrdersByMechanic(mechanicId: string): Promise<RepairOrder[]>;
  getRepairOrdersByStatus(status: string, companyId: string): Promise<RepairOrder[]>;
  
  // Inventory operations
  getInventoryPartsByCompany(companyId: string): Promise<InventoryPart[]>;
  getInventoryPart(id: string): Promise<InventoryPart | undefined>;
  createInventoryPart(part: InsertInventoryPart): Promise<InventoryPart>;
  updateInventoryPart(id: string, updates: Partial<InventoryPart>): Promise<InventoryPart>;
  getLowStockParts(companyId: string): Promise<InventoryPart[]>;
  searchParts(query: string, companyId: string): Promise<InventoryPart[]>;
  
  // Parts Usage operations
  getPartsUsageByRepairOrder(repairOrderId: string): Promise<PartsUsage[]>;
  createPartsUsage(partsUsage: InsertPartsUsage): Promise<PartsUsage>;
  deletePartsUsage(id: string): Promise<void>;
  
  // Dashboard stats
  getDashboardStats(companyId: string): Promise<{
    activeOrders: number;
    availableMechanics: number;
    lowStockItems: number;
    monthlyRevenue: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Company operations
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

  // User operations
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
        set: {
          ...userData,
          updatedAt: new Date(),
        },
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

    return result.map(user => ({
      ...user,
      companyName: user.companyName || undefined
    }));
  }

  async createUserPlaceholder(userData: { email: string; role: string; companyId: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        email: userData.email,
        role: userData.role,
        companyId: userData.companyId,
        firstName: null,
        lastName: null,
        profileImageUrl: null,
      })
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

  // Mechanic operations
  async getMechanicsByCompany(companyId: string): Promise<Mechanic[]> {
    return await db.select().from(mechanics).where(eq(mechanics.companyId, companyId));
  }

  async getMechanic(id: string): Promise<Mechanic | undefined> {
    const [mechanic] = await db.select().from(mechanics).where(eq(mechanics.id, id));
    return mechanic || undefined;
  }

  async createMechanic(insertMechanic: InsertMechanic): Promise<Mechanic> {
    const [mechanic] = await db.insert(mechanics).values(insertMechanic).returning();
    return mechanic;
  }

  async updateMechanic(id: string, updates: Partial<Mechanic>): Promise<Mechanic> {
    const [mechanic] = await db.update(mechanics)
      .set(updates)
      .where(eq(mechanics.id, id))
      .returning();
    return mechanic;
  }

  async getAvailableMechanics(companyId: string): Promise<Mechanic[]> {
    return await db.select().from(mechanics)
      .where(and(
        eq(mechanics.companyId, companyId),
        eq(mechanics.isAvailable, true)
      ))
      .orderBy(asc(mechanics.currentWorkload));
  }

  // Customer operations
  async getCustomersByCompany(companyId: string): Promise<Customer[]> {
    return await db.select().from(customers).where(eq(customers.companyId, companyId));
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer || undefined;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values(insertCustomer).returning();
    return customer;
  }

  async getCustomerByPhone(phone: string, companyId: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers)
      .where(and(eq(customers.phone, phone), eq(customers.companyId, companyId)));
    return customer || undefined;
  }

  // Vehicle operations
  async getVehiclesByCompany(companyId: string): Promise<Vehicle[]> {
    return await db.select().from(vehicles).where(eq(vehicles.companyId, companyId));
  }

  async getVehicle(id: string): Promise<Vehicle | undefined> {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    return vehicle || undefined;
  }

  async createVehicle(insertVehicle: InsertVehicle): Promise<Vehicle> {
    const [vehicle] = await db.insert(vehicles).values(insertVehicle).returning();
    return vehicle;
  }

  async getVehiclesByCustomer(customerId: string): Promise<Vehicle[]> {
    return await db.select().from(vehicles).where(eq(vehicles.customerId, customerId));
  }

  // Repair Order operations
  async getRepairOrdersByCompany(companyId: string): Promise<any[]> {
    return await db.select({
      id: repairOrders.id,
      orderNumber: repairOrders.orderNumber,
      description: repairOrders.description,
      priority: repairOrders.priority,
      status: repairOrders.status,
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
      }
    })
    .from(repairOrders)
    .leftJoin(vehicles, eq(repairOrders.vehicleId, vehicles.id))
    .leftJoin(customers, eq(repairOrders.customerId, customers.id))
    .leftJoin(mechanics, eq(repairOrders.mechanicId, mechanics.id))
    .where(eq(repairOrders.companyId, companyId))
    .orderBy(desc(repairOrders.createdAt));
  }

  async getRepairOrder(id: string): Promise<RepairOrder | undefined> {
    const [order] = await db.select().from(repairOrders).where(eq(repairOrders.id, id));
    return order || undefined;
  }

  async createRepairOrder(insertRepairOrder: InsertRepairOrder): Promise<RepairOrder> {
    // Generate order number
    const orderNumber = `RO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    
    const [order] = await db.insert(repairOrders)
      .values({ ...insertRepairOrder, orderNumber })
      .returning();
    return order;
  }

  async updateRepairOrder(id: string, updates: Partial<RepairOrder>): Promise<RepairOrder> {
    const [order] = await db.update(repairOrders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(repairOrders.id, id))
      .returning();
    return order;
  }

  async getRepairOrdersByMechanic(mechanicId: string): Promise<RepairOrder[]> {
    return await db.select().from(repairOrders)
      .where(eq(repairOrders.mechanicId, mechanicId))
      .orderBy(desc(repairOrders.createdAt));
  }

  async getRepairOrdersByStatus(status: string, companyId: string): Promise<RepairOrder[]> {
    return await db.select().from(repairOrders)
      .where(and(eq(repairOrders.status, status), eq(repairOrders.companyId, companyId)))
      .orderBy(desc(repairOrders.createdAt));
  }

  // Inventory operations
  async getInventoryPartsByCompany(companyId: string): Promise<InventoryPart[]> {
    return await db.select().from(inventoryParts)
      .where(eq(inventoryParts.companyId, companyId))
      .orderBy(asc(inventoryParts.name));
  }

  async getInventoryPart(id: string): Promise<InventoryPart | undefined> {
    const [part] = await db.select().from(inventoryParts).where(eq(inventoryParts.id, id));
    return part || undefined;
  }

  async createInventoryPart(insertPart: InsertInventoryPart): Promise<InventoryPart> {
    const [part] = await db.insert(inventoryParts).values(insertPart).returning();
    return part;
  }

  async updateInventoryPart(id: string, updates: Partial<InventoryPart>): Promise<InventoryPart> {
    const [part] = await db.update(inventoryParts)
      .set(updates)
      .where(eq(inventoryParts.id, id))
      .returning();
    return part;
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

  // Parts Usage operations
  async getPartsUsageByRepairOrder(repairOrderId: string): Promise<any[]> {
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

  async createPartsUsage(insertPartsUsage: InsertPartsUsage): Promise<PartsUsage> {
    const [usage] = await db.insert(partsUsage).values(insertPartsUsage).returning();
    
    // Update inventory quantity
    await db.update(inventoryParts)
      .set({
        quantityInStock: sql`${inventoryParts.quantityInStock} - ${insertPartsUsage.quantity}`
      })
      .where(eq(inventoryParts.id, insertPartsUsage.partId));
    
    return usage;
  }

  async deletePartsUsage(id: string): Promise<void> {
    const [usage] = await db.select().from(partsUsage).where(eq(partsUsage.id, id));
    if (usage) {
      // Restore inventory quantity
      await db.update(inventoryParts)
        .set({
          quantityInStock: sql`${inventoryParts.quantityInStock} + ${usage.quantity}`
        })
        .where(eq(inventoryParts.id, usage.partId));
      
      await db.delete(partsUsage).where(eq(partsUsage.id, id));
    }
  }

  // Dashboard stats
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
        sql`${repairOrders.status} IN ('pending', 'in-progress', 'waiting-parts')`
      ));

    const availableMechanicsResult = await db.select({ count: sql<number>`count(*)` })
      .from(mechanics)
      .where(and(
        eq(mechanics.companyId, companyId),
        eq(mechanics.isAvailable, true)
      ));

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
        eq(repairOrders.status, 'completed'),
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
