import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, DuplicateDraftError } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { sendCountSubmittedNotification, sendCountReviewedNotification } from "./email";
import { 
  insertUserSchema, insertMechanicSchema, insertCustomerSchema, 
  insertVehicleSchema, insertRepairOrderSchema, insertInventoryPartSchema,
  insertPartsUsageSchema, insertInvoiceSchema,
  insertMaintenanceGroupSchema, insertMaintenanceSubgroupSchema, insertMaintenanceItemSchema,
  ACTIVE_STATUSES
} from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for file uploads
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    cb(null, allowedTypes.includes(file.mimetype));
  }
});

const uploadInvoice = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    cb(null, allowedTypes.includes(file.mimetype));
  }
});

// Resolve userId from either local session or Replit OIDC
const resolveUserId = (req: any): string | undefined =>
  req.session?.localUserId || req.user?.claims?.sub;

// Middleware to get user's company context
const withCompanyContext = async (req: any, res: any, next: any) => {
  try {
    const userId = resolveUserId(req);
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    let effectiveCompanyId = user.companyId;
    // Super admins can temporarily view as another company via session override
    if (user.role === "super_admin" && (req.session as any)?.superAdminActiveCompanyId) {
      effectiveCompanyId = (req.session as any).superAdminActiveCompanyId;
    }

    req.userContext = {
      userId: user.id,
      companyId: effectiveCompanyId,
      role: user.role
    };
    
    next();
  } catch (error) {
    console.error("Error getting user context:", error);
    res.status(500).json({ message: "Failed to get user context" });
  }
};

/**
 * Load-balancing auto-assignment algorithm.
 * Assigns the work order to the mechanic with the lowest current active workload
 * (measured in estimated hours). For urgent/high priority, prefers senior/specialist.
 */
async function autoAssignMechanic(
  companyId: string, 
  priority: string = 'medium',
  estimatedHours: number = 0
): Promise<string | null> {
  const available = await storage.getAvailableMechanics(companyId);
  
  if (available.length === 0) return null;

  // Get real-time workload for each available mechanic (sum of estimated hours on active orders)
  const mechanicsWithLoad = await storage.getMechanicsWithActiveHours(companyId);
  const loadMap = new Map(mechanicsWithLoad.map(m => [m.id, m.activeHours]));

  // Enrich available mechanics with their real-time load
  const enriched = available.map(m => ({
    ...m,
    activeHours: loadMap.get(m.id) ?? 0,
    // Capacity remaining (maxWorkload treated as max hours target)
    capacityRemaining: m.maxWorkload - (loadMap.get(m.id) ?? 0),
  }));

  // Filter out mechanics who are over-capacity (leave a small buffer for new job)
  const withCapacity = enriched.filter(m => m.capacityRemaining >= 0);
  const candidates = withCapacity.length > 0 ? withCapacity : enriched; // fallback to all if all over capacity

  // Sort by active hours ascending (least busy first)
  const sorted = [...candidates].sort((a, b) => a.activeHours - b.activeHours);

  // For urgent/high priority, prefer specialists or senior technicians
  if (priority === 'high' || priority === 'urgent') {
    const specialists = sorted.filter(m => 
      m.specialization.toLowerCase().includes('specialist') || 
      m.specialization.toLowerCase().includes('senior') ||
      m.specialization.toLowerCase().includes('lead')
    );
    if (specialists.length > 0) return specialists[0].id;
  }

  return sorted[0].id;
}

/**
 * Rebalance all active (open/in-progress) work orders across available mechanics.
 * Algorithm: round-robin by least active hours after sorting orders by priority.
 */
async function rebalanceWorkOrders(companyId: string): Promise<{ reassigned: number }> {
  const [activeOrders, available] = await Promise.all([
    storage.getRepairOrdersByStatuses(['open', 'in-progress'], companyId),
    storage.getAvailableMechanics(companyId),
  ]);

  if (available.length === 0 || activeOrders.length === 0) return { reassigned: 0 };

  // Sort orders by priority (urgent first)
  const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
  const sorted = [...activeOrders].sort((a, b) => 
    (priorityWeight[b.priority as keyof typeof priorityWeight] || 1) - 
    (priorityWeight[a.priority as keyof typeof priorityWeight] || 1)
  );

  // Track cumulative hours per mechanic during this rebalance
  const hoursMap = new Map<string, number>(available.map(m => [m.id, 0]));
  let reassigned = 0;

  for (const order of sorted) {
    // Pick mechanic with fewest assigned hours in this batch
    let bestMechanic = available[0];
    let minHours = hoursMap.get(available[0].id) ?? 0;
    
    for (const m of available) {
      const h = hoursMap.get(m.id) ?? 0;
      if (h < minHours) { minHours = h; bestMechanic = m; }
    }

    const estHours = Number(order.estimatedHours) || 2; // default 2h if not set
    hoursMap.set(bestMechanic.id, (hoursMap.get(bestMechanic.id) ?? 0) + estHours);

    // Only update if assignment changed
    if (order.mechanicId !== bestMechanic.id) {
      await storage.updateRepairOrder(order.id, companyId, { mechanicId: bestMechanic.id });
      reassigned++;
    }
  }

  // Recalculate workloads for all mechanics
  await storage.recalculateMechanicWorkloads(companyId);

  return { reassigned };
}

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  // Local auth routes
  app.post('/api/auth/local/login', async (req: any, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const bcrypt = await import('bcryptjs');
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      req.session.localUserId = user.id;
      req.session.save(() => {
        res.json({ success: true, mustChangePassword: user.mustChangePassword });
      });
    } catch (error) {
      console.error("Local login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post('/api/auth/local/logout', (req: any, res) => {
    delete req.session.localUserId;
    req.session.save(() => res.json({ success: true }));
  });

  app.post('/api/auth/change-password', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { currentPassword, newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }
      const bcrypt = await import('bcryptjs');
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      // Verify current password if they already have one and it's not a forced change
      if (user.passwordHash && !user.mustChangePassword) {
        if (!currentPassword) return res.status(400).json({ message: "Current password is required" });
        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return res.status(400).json({ message: "Current password is incorrect" });
      }
      const hash = await bcrypt.hash(newPassword, 12);
      await storage.updateUserPassword(userId, hash, false);
      res.json({ success: true });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // User management routes
  app.get('/api/users', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (!['admin', 'super_admin'].includes(user.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (user.role === 'super_admin') {
        const allUsers = await storage.getAllUsersWithCompany();
        return res.json(allUsers);
      }
      const sessionOverride = (req.session as any)?.superAdminActiveCompanyId as string | undefined;
      const companyId = (user.role === 'super_admin' && sessionOverride) ? sessionOverride : user.companyId;
      const users = await storage.getUsersByCompany(companyId);
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post('/api/users', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const requestingUser = await storage.getUser(userId);
      if (!requestingUser || !['admin', 'super_admin'].includes(requestingUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { email, firstName, lastName, password, role, companyId } = req.body;
      if (!email || !password || !role) {
        return res.status(400).json({ message: "Email, password, and role are required" });
      }
      const existing = await storage.getUserByEmail(email.toLowerCase().trim());
      if (existing) return res.status(409).json({ message: "A user with this email already exists" });
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash(password, 12);
      const targetCompanyId = (requestingUser.role === 'super_admin' && companyId) ? companyId : requestingUser.companyId;
      const newUser = await storage.createLocalUser({
        email: email.toLowerCase().trim(),
        firstName,
        lastName,
        passwordHash: hash,
        role,
        companyId: targetCompanyId,
      });
      const { passwordHash: _h, ...safeUser } = newUser as any;
      res.status(201).json(safeUser);
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch('/api/users/:id/role', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const requestingUser = await storage.getUser(userId);
      if (!requestingUser || !['admin', 'super_admin'].includes(requestingUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { role } = req.body;
      const validRoles = ['admin', 'accounting', 'shop_user', 'technician'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const target = await storage.getUser(req.params.id);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.role === 'super_admin') return res.status(403).json({ message: "Cannot change super_admin role" });
      if (requestingUser.role === 'admin' && target.companyId !== requestingUser.companyId) {
        return res.status(403).json({ message: "Cannot manage users from another company" });
      }
      const updated = await storage.updateUserRole(req.params.id, role, target.companyId);
      const { passwordHash: _h, ...safeUser } = updated as any;
      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.post('/api/users/:id/reset-password', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const requestingUser = await storage.getUser(userId);
      if (!requestingUser || !['admin', 'super_admin'].includes(requestingUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const target = await storage.getUser(req.params.id);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (requestingUser.role === 'admin' && target.companyId !== requestingUser.companyId) {
        return res.status(403).json({ message: "Cannot manage users from another company" });
      }
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash(newPassword, 12);
      await storage.updateUserPassword(req.params.id, hash, true);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.delete('/api/users/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      if (req.params.id === userId) return res.status(400).json({ message: "Cannot delete your own account" });
      const requestingUser = await storage.getUser(userId);
      if (!requestingUser || !['admin', 'super_admin'].includes(requestingUser.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const target = await storage.getUser(req.params.id);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.role === 'super_admin') return res.status(403).json({ message: "Cannot delete a super admin" });
      if (requestingUser.role === 'admin' && target.companyId !== requestingUser.companyId) {
        return res.status(403).json({ message: "Cannot delete users from another company" });
      }
      await storage.deleteUser(req.params.id, target.companyId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveUserId(req);
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const ownCompanyId = user.companyId;
      const sessionOverride = (req.session as any)?.superAdminActiveCompanyId as string | undefined;
      // Only treat as a genuine switch when the override is set AND differs from own company
      const isSwitched =
        user.role === "super_admin" &&
        !!sessionOverride &&
        sessionOverride !== ownCompanyId;

      let effectiveCompanyId = ownCompanyId;
      let activeCompanyName: string | null = null;

      if (isSwitched) {
        effectiveCompanyId = sessionOverride!;
        const company = await storage.getCompany(effectiveCompanyId);
        activeCompanyName = company?.name ?? null;
      }

      // companyId in the response is the effective (possibly switched) company so
      // all existing API filtering keeps working without modification.
      const authSource = (req.session as any)?.localUserId ? 'local' : 'replit';
      const { passwordHash: _h, ...safeUser } = user as any;
      res.json({ ...safeUser, companyId: effectiveCompanyId, ownCompanyId, activeCompanyName, authSource });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Super admin company switcher
  app.post("/api/admin/switch-company", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveUserId(req);
      const user = await storage.getUser(userId);

      if (!user || user.role !== "super_admin") {
        return res.status(403).json({ message: "Only super admins can switch companies" });
      }

      const { companyId } = req.body as { companyId: string | null };

      // Treat switching to own company or explicit null as "exit"
      if (companyId === null || companyId === undefined || companyId === user.companyId) {
        const previousCompanyId = (req.session as any).superAdminActiveCompanyId as string | undefined;
        delete (req.session as any).superAdminActiveCompanyId;
        if (previousCompanyId) {
          await storage.createAdminAuditLog({
            adminUserId: userId,
            targetCompanyId: previousCompanyId,
            action: "switch_out",
          });
        }
      } else {
        const company = await storage.getCompany(companyId);
        if (!company) return res.status(404).json({ message: "Company not found" });
        // If already switched into another company, log a switch_out for it first
        const previousCompanyId = (req.session as any).superAdminActiveCompanyId as string | undefined;
        if (previousCompanyId && previousCompanyId !== companyId) {
          await storage.createAdminAuditLog({
            adminUserId: userId,
            targetCompanyId: previousCompanyId,
            action: "switch_out",
          });
        }
        (req.session as any).superAdminActiveCompanyId = companyId;
        await storage.createAdminAuditLog({
          adminUserId: userId,
          targetCompanyId: companyId,
          action: "switch_in",
        });
      }

      req.session.save(() => {
        res.json({ success: true });
      });
    } catch (error) {
      console.error("Failed to switch company:", error);
      res.status(500).json({ message: "Failed to switch company" });
    }
  });

  // Admin audit log
  app.get("/api/admin/audit-log", isAuthenticated, async (req: any, res) => {
    try {
      const userId = resolveUserId(req);
      const user = await storage.getUser(userId);
      if (!user || user.role !== "super_admin") {
        return res.status(403).json({ message: "Only super admins can view the audit log" });
      }
      const log = await storage.getAdminAuditLog(200);
      res.json(log);
    } catch (error) {
      console.error("Failed to fetch audit log:", error);
      res.status(500).json({ message: "Failed to fetch audit log" });
    }
  });

  // Dashboard Stats
  app.get("/api/dashboard/stats", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const stats = await storage.getDashboardStats(req.userContext.companyId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // ── Work Orders ──────────────────────────────────────────────────────────────

  app.get("/api/repair-orders", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const orders = await storage.getRepairOrdersByCompany(req.userContext.companyId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch work orders" });
    }
  });

  app.get("/api/repair-orders/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const order = await storage.getRepairOrder(req.params.id, req.userContext.companyId);
      if (!order) return res.status(404).json({ message: "Work order not found" });
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch work order" });
    }
  });

  // Create new work order via intake form (multipart form data)
  app.post("/api/repair-orders", isAuthenticated, withCompanyContext, upload.array('damagePhotos', 10), async (req: any, res) => {
    try {
      const body = req.body;

      // Enforce allowed customerType values server-side
      const VALID_CUSTOMER_TYPES = ['company-fleet', 'owner-operator', 'third-party'] as const;
      type CustomerType = typeof VALID_CUSTOMER_TYPES[number];
      const rawCustomerType = body.customerType || 'company-fleet';
      if (!VALID_CUSTOMER_TYPES.includes(rawCustomerType as CustomerType)) {
        return res.status(400).json({ message: "Invalid customerType. Must be one of: company-fleet, owner-operator, third-party" });
      }
      const customerType: CustomerType = rawCustomerType as CustomerType;

      let customerId: string | null = null;
      let vehicleId: string;

      if (customerType === 'company-fleet') {
        // Fleet job: use existing fleet vehicle, no customer required
        if (!body.fleetVehicleId) {
          return res.status(400).json({ message: "Fleet vehicle selection is required for Company Fleet jobs" });
        }
        const fleetVehicle = await storage.getVehicle(body.fleetVehicleId, req.userContext.companyId);
        if (!fleetVehicle) {
          return res.status(400).json({ message: "Selected fleet vehicle not found" });
        }
        // Enforce fleet eligibility: vehicle must be explicitly tagged as company fleet
        // (allow vehicles with no fleetType set but also no customer owner as a fallback)
        const isCompanyFleet = fleetVehicle.fleetType === 'company-fleet';
        const isUnassignedUnit = fleetVehicle.fleetType === null && fleetVehicle.customerId === null;
        if (!isCompanyFleet && !isUnassignedUnit) {
          return res.status(400).json({ message: "Selected vehicle is not a company fleet unit" });
        }
        vehicleId = fleetVehicle.id;
        customerId = null;
      } else {
        // Owner Operator / Third Party: create/find customer then vehicle
        if (!body.customerName || !body.phoneNumber) {
          return res.status(400).json({ message: "Customer name and phone are required for this job type" });
        }
        const customerData = {
          name: body.customerName,
          phone: body.phoneNumber,
          email: body.email || null,
          companyId: req.userContext.companyId
        };
        let customer = await storage.getCustomerByPhone(customerData.phone, req.userContext.companyId);
        if (!customer) {
          customer = await storage.createCustomer(insertCustomerSchema.parse(customerData));
        }
        customerId = customer.id;

        const vehicleData = {
          year: parseInt(body.vehicleYear),
          make: body.vehicleMake,
          model: body.vehicleModel,
          vin: body.vin || null,
          licensePlate: body.licensePlate || null,
          color: body.color || null,
          mileage: body.mileage ? parseInt(body.mileage) : null,
          customerId: customer.id,
          companyId: req.userContext.companyId
        };
        const vehicle = await storage.createVehicle(insertVehicleSchema.parse(vehicleData));
        vehicleId = vehicle.id;
      }

      // Handle file uploads
      const damagePhotos: string[] = [];
      if (req.files) {
        for (const file of req.files as Express.Multer.File[]) {
          const newFilename = `${Date.now()}-${file.originalname}`;
          const newPath = path.join(uploadsDir, newFilename);
          fs.renameSync(file.path, newPath);
          damagePhotos.push(newFilename);
        }
      }

      const estimatedHours = body.estimatedHours ? parseFloat(body.estimatedHours) : 0;
      const assignedMechanicId = await autoAssignMechanic(req.userContext.companyId, body.priority, estimatedHours);

      const repairOrderData = {
        vehicleId,
        customerId,
        customerType,
        mechanicId: assignedMechanicId,
        inspectorId: req.userContext.userId,
        description: body.repairDescription,
        priority: body.priority || 'medium',
        status: 'open',
        serviceType: body.serviceType || null,
        truckType: body.truckType || null,
        trailerNumber: body.trailerNumber || null,
        odometerIn: body.odometerIn ? parseInt(body.odometerIn) : null,
        dotInspectionRequired: body.dotInspectionRequired === 'true',
        scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : null,
        estimatedHours: estimatedHours > 0 ? String(estimatedHours) : null,
        laborRate: body.laborRate ? String(body.laborRate) : null,
        totalEstimate: body.totalEstimate ? String(body.totalEstimate) : null,
        damagePhotos,
        companyId: req.userContext.companyId
      };

      const validatedOrder = insertRepairOrderSchema.parse(repairOrderData);
      const repairOrder = await storage.createRepairOrder(validatedOrder);

      // Recalculate workload from source of truth (avoids counter drift)
      await storage.recalculateMechanicWorkloads(req.userContext.companyId);

      // Create draft invoice if requested (Owner Operator / Third Party only)
      let invoiceWarning: string | null = null;
      if (body.createInvoice === 'true' && customerType !== 'company-fleet') {
        try {
          const laborTotal = estimatedHours > 0 && body.laborRate
            ? estimatedHours * parseFloat(body.laborRate)
            : 0;
          const subtotal = String(laborTotal.toFixed(2));
          await storage.createInvoice(insertInvoiceSchema.parse({
            repairOrderId: repairOrder.id,
            customerId,
            companyId: req.userContext.companyId,
            subtotal,
            taxAmount: "0",
            totalAmount: subtotal,
            status: "draft",
            notes: `Draft invoice for work order #${repairOrder.orderNumber}`,
            quickbooksSyncStatus: "not_synced",
          }));
        } catch (invoiceErr) {
          console.error("Failed to create draft invoice:", invoiceErr);
          invoiceWarning = "Work order created successfully, but draft invoice could not be created.";
        }
      }

      res.status(201).json({ ...repairOrder, ...(invoiceWarning ? { invoiceWarning } : {}) });
    } catch (error) {
      console.error("Failed to create work order:", error);
      res.status(400).json({ message: "Failed to create work order", error: (error as any).message });
    }
  });

  app.patch("/api/repair-orders/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { companyId, id, customerId, vehicleId, ...updates } = req.body;

      // Get current order to detect status changes
      const currentOrder = await storage.getRepairOrder(req.params.id, req.userContext.companyId);
      if (!currentOrder) return res.status(404).json({ message: "Work order not found" });

      // Handle status transitions that require timestamp updates
      if (updates.status && updates.status !== currentOrder.status) {
        const now = new Date();
        if (updates.status === 'completed') updates.completedDate = now;
        if (updates.status === 'closed' || updates.status === 'delivered') updates.closedDate = now;
      }

      const order = await storage.updateRepairOrder(req.params.id, req.userContext.companyId, updates);

      // Recalculate workload from source of truth whenever status or mechanic assignment changes
      if (updates.status || updates.mechanicId !== undefined) {
        await storage.recalculateMechanicWorkloads(req.userContext.companyId);
      }

      res.json(order);
    } catch (error) {
      console.error("Failed to update work order:", error);
      res.status(400).json({ message: "Failed to update work order" });
    }
  });

  app.delete("/api/repair-orders/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      await storage.deleteRepairOrder(req.params.id, req.userContext.companyId);
      // Recalculate workload from source of truth after deletion
      await storage.recalculateMechanicWorkloads(req.userContext.companyId);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: "Failed to delete work order" });
    }
  });

  // Rebalance work orders across mechanics
  app.post("/api/repair-orders/rebalance", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const result = await rebalanceWorkOrders(req.userContext.companyId);
      res.json({ message: `Rebalanced: ${result.reassigned} orders reassigned`, ...result });
    } catch (error) {
      console.error("Failed to rebalance:", error);
      res.status(500).json({ message: "Failed to rebalance work orders" });
    }
  });

  // ── Mechanics ────────────────────────────────────────────────────────────────

  app.get("/api/mechanics", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const mechanics = await storage.getMechanicsByCompany(req.userContext.companyId);
      res.json(mechanics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mechanics" });
    }
  });

  // Mechanics with live workload (active orders + hours)
  app.get("/api/mechanics/workload", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const workload = await storage.getMechanicsWithWorkload(req.userContext.companyId);
      res.json(workload);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mechanic workload" });
    }
  });

  app.post("/api/mechanics", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const mechanicData = { ...req.body, companyId: req.userContext.companyId };
      const validatedMechanic = insertMechanicSchema.parse(mechanicData);
      const mechanic = await storage.createMechanic(validatedMechanic);
      res.status(201).json(mechanic);
    } catch (error) {
      res.status(400).json({ message: "Failed to create mechanic" });
    }
  });

  app.patch("/api/mechanics/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { companyId, id, ...updates } = req.body;
      const mechanic = await storage.updateMechanic(req.params.id, req.userContext.companyId, updates);
      res.json(mechanic);
    } catch (error) {
      res.status(400).json({ message: "Failed to update mechanic" });
    }
  });

  app.delete("/api/mechanics/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      await storage.deleteMechanic(req.params.id, req.userContext.companyId);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: "Failed to delete mechanic" });
    }
  });

  // ── Customers ────────────────────────────────────────────────────────────────

  app.get("/api/customers", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const customers = await storage.getCustomersByCompany(req.userContext.companyId);
      res.json(customers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.get("/api/customers/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id, req.userContext.companyId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  app.post("/api/customers", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const customerData = { ...req.body, companyId: req.userContext.companyId };
      const validatedCustomer = insertCustomerSchema.parse(customerData);
      const customer = await storage.createCustomer(validatedCustomer);
      res.status(201).json(customer);
    } catch (error) {
      res.status(400).json({ message: "Failed to create customer" });
    }
  });

  app.patch("/api/customers/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { companyId, id, ...updates } = req.body;
      const customer = await storage.updateCustomer(req.params.id, req.userContext.companyId, updates);
      res.json(customer);
    } catch (error) {
      res.status(400).json({ message: "Failed to update customer" });
    }
  });

  app.delete("/api/customers/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      await storage.deleteCustomer(req.params.id, req.userContext.companyId);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: "Failed to delete customer" });
    }
  });

  // ── Vehicles ─────────────────────────────────────────────────────────────────

  app.get("/api/vehicles", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const vehicles = await storage.getVehiclesByCompany(req.userContext.companyId);
      res.json(vehicles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch vehicles" });
    }
  });

  // Fleet vehicle lookup — must be before /:id to avoid routing conflict
  app.get("/api/vehicles/fleet", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const search = (req.query.search as string) || "";
      if (!search.trim()) return res.json([]);
      const results = await storage.searchFleetVehicles(search.trim(), req.userContext.companyId);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to search fleet vehicles" });
    }
  });

  app.get("/api/vehicles/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const vehicle = await storage.getVehicle(req.params.id, req.userContext.companyId);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      res.json(vehicle);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch vehicle" });
    }
  });

  app.get("/api/vehicles/customer/:customerId", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const vehicles = await storage.getVehiclesByCustomer(req.params.customerId, req.userContext.companyId);
      res.json(vehicles);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer vehicles" });
    }
  });

  app.post("/api/vehicles", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const vehicleData = { ...req.body, companyId: req.userContext.companyId };
      const validatedVehicle = insertVehicleSchema.parse(vehicleData);
      const vehicle = await storage.createVehicle(validatedVehicle);
      res.status(201).json(vehicle);
    } catch (error) {
      res.status(400).json({ message: "Failed to create vehicle" });
    }
  });

  app.patch("/api/vehicles/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { companyId, id, ...updates } = req.body;
      const vehicle = await storage.updateVehicle(req.params.id, req.userContext.companyId, updates);
      res.json(vehicle);
    } catch (error) {
      res.status(400).json({ message: "Failed to update vehicle" });
    }
  });

  app.delete("/api/vehicles/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      await storage.deleteVehicle(req.params.id, req.userContext.companyId);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: "Failed to delete vehicle" });
    }
  });

  // ── Invoices ──────────────────────────────────────────────────────────────────

  app.post("/api/invoices", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const companyId: string = req.userContext.companyId;

      // Verify repairOrderId belongs to this company
      if (req.body.repairOrderId) {
        const order = await storage.getRepairOrder(req.body.repairOrderId, companyId);
        if (!order) {
          return res.status(403).json({ message: "Repair order not found or access denied" });
        }
      }

      // Verify customerId belongs to this company
      if (req.body.customerId) {
        const customer = await storage.getCustomer(req.body.customerId, companyId);
        if (!customer) {
          return res.status(403).json({ message: "Customer not found or access denied" });
        }
      }

      const invoiceData = { ...req.body, companyId };
      const validated = insertInvoiceSchema.parse(invoiceData);
      const invoice = await storage.createInvoice(validated);
      res.status(201).json(invoice);
    } catch (error) {
      console.error("Failed to create invoice:", error);
      res.status(400).json({ message: "Failed to create invoice", error: (error as any).message });
    }
  });

  app.get("/api/invoices/repair-order/:orderId", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const invoiceList = await storage.getInvoicesByRepairOrder(req.params.orderId, req.userContext.companyId);
      res.json(invoiceList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // ── Inventory ────────────────────────────────────────────────────────────────

  app.get("/api/inventory", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const parts = await storage.getInventoryPartsByCompany(req.userContext.companyId);
      res.json(parts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch inventory" });
    }
  });

  app.get("/api/inventory/search", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const query = req.query.q as string;
      if (!query) return res.json([]);
      const parts = await storage.searchParts(query, req.userContext.companyId);
      res.json(parts);
    } catch (error) {
      res.status(500).json({ message: "Failed to search parts" });
    }
  });

  // ── Inventory Intakes (invoice-style receiving) ───────────────────────────────

  app.get("/api/inventory/intakes", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const intakes = await storage.getInventoryIntakesByCompany(req.userContext.companyId);
      res.json(intakes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch inventory intakes" });
    }
  });

  app.get("/api/inventory/intakes/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const intake = await storage.getInventoryIntake(req.params.id, req.userContext.companyId);
      if (!intake) return res.status(404).json({ message: "Intake not found" });
      res.json(intake);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch intake" });
    }
  });

  // Invoice photo upload — returns a URL path for the uploaded file
  app.post("/api/inventory/intakes/upload-photo", isAuthenticated, withCompanyContext, uploadInvoice.single("photo"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
      const newFilename = `invoice-${Date.now()}${ext}`;
      const newPath = path.join(uploadsDir, newFilename);
      fs.renameSync(req.file.path, newPath);
      res.json({ photoUrl: `/api/uploads/${newFilename}` });
    } catch (error) {
      res.status(500).json({ message: "Failed to upload invoice photo" });
    }
  });

  app.post("/api/inventory/intakes", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { items, ...headerRaw } = req.body;

      if (!headerRaw.vendor || !headerRaw.vendor.trim()) {
        return res.status(400).json({ message: "Vendor is required" });
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "At least one line item is required" });
      }

      // Validate items — name and quantity required; partId optional (new parts are auto-created)
      for (const item of items) {
        if (!item.partNameSnapshot || !item.qty || item.qty < 1) {
          return res.status(400).json({ message: "Each item must have a name and quantity ≥ 1" });
        }
        if (item.itemType && item.itemType !== "consumable" && item.itemType !== "inventory") {
          return res.status(400).json({ message: "itemType must be 'consumable' or 'inventory'" });
        }
      }

      // Validate that any supplied groupId/subgroupId values belong to this company
      // and that each subgroup belongs to its stated group
      const placements = items
        .filter((i: any) => i.groupId || i.subgroupId)
        .map((i: any) => ({ groupId: i.groupId || undefined, subgroupId: i.subgroupId || undefined }));
      if (placements.length > 0) {
        try {
          await storage.validateCatalogPlacements(placements, req.userContext.companyId);
        } catch (err: any) {
          return res.status(400).json({ message: err.message ?? "Invalid catalog placement" });
        }
      }

      // Calculate reconciliation status
      const calculatedTotal =
        Number(headerRaw.subtotal || 0) +
        Number(headerRaw.taxAmount || 0) +
        Number(headerRaw.deliveryFee || 0);
      const enteredTotal = Number(headerRaw.totalAmount || 0);
      const diff = Math.abs(calculatedTotal - enteredTotal);
      const reconciliationStatus =
        enteredTotal === 0
          ? "warning"
          : diff <= 0.01
          ? "matched"
          : "warning";

      const header = {
        vendor: headerRaw.vendor.trim(),
        invoiceNumber: headerRaw.invoiceNumber || null,
        invoiceDate: headerRaw.invoiceDate ? new Date(headerRaw.invoiceDate) : null,
        subtotal: String(headerRaw.subtotal || "0"),
        taxAmount: String(headerRaw.taxAmount || "0"),
        deliveryFee: String(headerRaw.deliveryFee || "0"),
        totalAmount: String(headerRaw.totalAmount || "0"),
        reconciliationStatus,
        notes: headerRaw.notes || null,
        quickbooksSyncStatus: "not_synced",
        quickbooksId: null,
        quickbooksLastSyncedAt: null,
        externalReferenceNumber: headerRaw.externalReferenceNumber || null,
        invoicePhotoUrl: headerRaw.invoicePhotoUrl || null,
      };

      const intake = await storage.createInventoryIntake(
        header,
        items,
        req.userContext.companyId,
        req.userContext.userId
      );

      res.status(201).json(intake);
    } catch (error) {
      console.error("Failed to create inventory intake:", error);
      res.status(400).json({ message: "Failed to create inventory intake", error: (error as any).message });
    }
  });

  app.post("/api/inventory", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const partData = {
        ...req.body,
        companyId: req.userContext.companyId,
        quantityInStock: 0,
      };
      const validatedPart = insertInventoryPartSchema.parse(partData);
      const part = await storage.createInventoryPart(validatedPart);
      res.status(201).json(part);
    } catch (error) {
      console.error("Error creating inventory part:", error);
      res.status(400).json({ message: "Failed to create inventory part", error: (error as any).message });
    }
  });

  app.patch("/api/inventory/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { companyId, id, quantityInStock, ...updates } = req.body;
      const part = await storage.updateInventoryPart(req.params.id, req.userContext.companyId, updates);
      res.json(part);
    } catch (error) {
      res.status(400).json({ message: "Failed to update inventory part" });
    }
  });

  app.delete("/api/inventory/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      await storage.deleteInventoryPart(req.params.id, req.userContext.companyId);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: "Failed to delete inventory part" });
    }
  });

  // ── Inventory Adjustments (admin only) ────────────────────────────────────────

  app.get("/api/inventory/adjustments", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const role = req.userContext.role;
      if (role !== "admin" && role !== "super_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      // Super admins see all adjustments across companies; company admins see only their own
      const adjustments = role === "super_admin"
        ? await storage.getAllInventoryAdjustments()
        : await storage.getInventoryAdjustmentsByCompany(req.userContext.companyId);
      res.json(adjustments);
    } catch (error) {
      console.error("Failed to fetch adjustments:", error);
      res.status(500).json({ message: "Failed to fetch inventory adjustments" });
    }
  });

  app.post("/api/inventory/adjustments", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const role = req.userContext.role;
      if (role !== "admin" && role !== "super_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { partId, adjustmentType, quantity, reason, referenceNote } = req.body;

      const VALID_TYPES = ["add", "subtract", "set"];
      if (!partId || typeof partId !== "string") {
        return res.status(400).json({ message: "partId is required" });
      }
      if (!adjustmentType || !VALID_TYPES.includes(adjustmentType)) {
        return res.status(400).json({ message: "adjustmentType must be add, subtract, or set" });
      }
      const qty = parseInt(quantity, 10);
      if (!Number.isInteger(qty) || qty < 0) {
        return res.status(400).json({ message: "quantity must be a non-negative integer" });
      }
      const trimmedReason = typeof reason === "string" ? reason.trim() : "";
      if (trimmedReason.length === 0) {
        return res.status(400).json({ message: "reason is required and cannot be blank" });
      }

      const adjustment = await storage.createInventoryAdjustment({
        partId,
        adjustmentType,
        quantity: qty,
        reason: trimmedReason,
        referenceNote: referenceNote ? String(referenceNote).trim() || null : null,
        userId: req.userContext.userId,
        companyId: req.userContext.companyId,
      });
      res.status(201).json(adjustment);
    } catch (error) {
      console.error("Failed to create adjustment:", error);
      res.status(400).json({ message: "Failed to create inventory adjustment", error: (error as any).message });
    }
  });

  // ── Inventory Count Sessions ──────────────────────────────────────────────────

  app.get("/api/inventory/count-sessions", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const sessions = await storage.getCountSessionsByCompany(req.userContext.companyId);
      res.json(sessions);
    } catch (error) {
      console.error("Failed to fetch count sessions:", error);
      res.status(500).json({ message: "Failed to fetch count sessions" });
    }
  });

  app.post("/api/inventory/count-sessions", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const existing = await storage.getOpenCountSession(req.userContext.companyId);
      if (existing) {
        if (existing.status === "submitted") {
          return res.status(409).json({ message: "A count session is pending admin review. You cannot start a new count until it is approved or rejected.", pendingReview: true });
        }
        return res.status(409).json({ message: "A draft count session already exists", sessionId: existing.id });
      }
      const rawScope = req.body?.scope;
      const scope: "all" | "low_stock" | "category" =
        rawScope === "low_stock" ? "low_stock" :
        rawScope === "category" ? "category" :
        "all";
      const categoryFilter = scope === "category" && typeof req.body?.categoryFilter === "string"
        ? req.body.categoryFilter.trim() || null
        : null;
      const session = await storage.createCountSession(req.userContext.companyId, req.userContext.userId, scope, categoryFilter);
      res.status(201).json(session);
    } catch (error) {
      if (error instanceof DuplicateDraftError) {
        const body: Record<string, string> = { message: "A draft count session already exists" };
        if (error.existingSessionId) body.sessionId = error.existingSessionId;
        return res.status(409).json(body);
      }
      console.error("Failed to create count session:", error);
      res.status(400).json({ message: "Failed to start inventory count" });
    }
  });

  app.get("/api/inventory/count-sessions/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const session = await storage.getCountSession(req.params.id, req.userContext.companyId);
      if (!session) return res.status(404).json({ message: "Count session not found" });
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch count session" });
    }
  });

  app.patch("/api/inventory/count-sessions/:id/items", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ message: "items must be an array" });

      // Validate countedQty >= 0
      for (const item of items) {
        if (item.countedQty !== null && item.countedQty !== undefined && Number(item.countedQty) < 0) {
          return res.status(400).json({ message: "Counted quantity cannot be negative" });
        }
      }

      // Enforce draft ownership: only the session starter or an admin may edit
      const existing = await storage.getCountSession(req.params.id, req.userContext.companyId);
      if (!existing) return res.status(404).json({ message: "Count session not found" });
      const role = req.userContext.role;
      const isAdmin = role === "admin" || role === "super_admin";
      if (!isAdmin && existing.startedByUserId !== req.userContext.userId) {
        return res.status(403).json({ message: "Only the count starter or an admin may edit this session" });
      }

      await storage.updateCountItems(req.params.id, items, req.userContext.companyId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to update count items:", error);
      res.status(400).json({ message: "Failed to update count items" });
    }
  });

  app.post("/api/inventory/count-sessions/:id/submit", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      // Enforce draft ownership: only the session starter or an admin may submit
      const existing = await storage.getCountSession(req.params.id, req.userContext.companyId);
      if (!existing) return res.status(404).json({ message: "Count session not found" });
      const role = req.userContext.role;
      const isAdmin = role === "admin" || role === "super_admin";
      if (!isAdmin && existing.startedByUserId !== req.userContext.userId) {
        return res.status(403).json({ message: "Only the count starter or an admin may submit this session" });
      }

      const session = await storage.submitCountSession(req.params.id, req.userContext.companyId);
      res.json(session);

      // Post-response: notify company admins by email (response already sent above)
      try {
        const companyUsers = await storage.getUsersByCompany(req.userContext.companyId);
        const adminEmails = [...new Set(
          companyUsers.flatMap(u => (u.role === "admin" || u.role === "super_admin") && u.email ? [u.email] : [])
        )];
        const submitter = await storage.getUser(req.userContext.userId);
        const submitterName = submitter?.firstName
          ? `${submitter.firstName} ${submitter.lastName ?? ""}`.trim()
          : (submitter?.email ?? "A team member");
        const sessionDetail = await storage.getCountSession(session.id, req.userContext.companyId);
        const items: Array<{ countedQty: number | null }> = sessionDetail?.items ?? [];
        await sendCountSubmittedNotification({
          sessionId: session.id,
          submitterName,
          totalItems: items.length,
          itemsEntered: items.filter(i => i.countedQty !== null).length,
          adminEmails,
        });
      } catch (emailErr) {
        console.error("Failed to send count-submitted email:", emailErr);
      }
    } catch (error) {
      console.error("Failed to submit count session:", error);
      res.status(400).json({ message: "Failed to submit count session" });
    }
  });

  app.post("/api/inventory/count-sessions/:id/approve", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const role = req.userContext.role;
      if (role !== "admin" && role !== "super_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { adminNotes } = req.body;
      const session = await storage.approveCountSession(
        req.params.id,
        req.userContext.companyId,
        req.userContext.userId,
        adminNotes
      );
      res.json(session);

      // Post-response: notify the count submitter by email (response already sent above)
      try {
        if (session.startedByUserId) {
          const submitter = await storage.getUser(session.startedByUserId);
          const reviewer = await storage.getUser(req.userContext.userId);
          if (submitter?.email) {
            const submitterName = submitter.firstName
              ? `${submitter.firstName} ${submitter.lastName ?? ""}`.trim()
              : submitter.email;
            const reviewerName = reviewer?.firstName
              ? `${reviewer.firstName} ${reviewer.lastName ?? ""}`.trim()
              : (reviewer?.email ?? "An admin");
            await sendCountReviewedNotification({
              sessionId: session.id,
              status: "approved",
              reviewerName,
              adminNotes: session.adminNotes,
              submitterEmail: submitter.email,
              submitterName,
            });
          }
        }
      } catch (emailErr) {
        console.error("Failed to send count-approved email:", emailErr);
      }
    } catch (error) {
      console.error("Failed to approve count session:", error);
      res.status(400).json({ message: "Failed to approve count session" });
    }
  });

  app.post("/api/inventory/count-sessions/:id/reject", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const role = req.userContext.role;
      if (role !== "admin" && role !== "super_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { adminNotes } = req.body;
      const session = await storage.rejectCountSession(
        req.params.id,
        req.userContext.companyId,
        req.userContext.userId,
        adminNotes
      );
      res.json(session);

      // Post-response: notify the count submitter by email (response already sent above)
      try {
        if (session.startedByUserId) {
          const submitter = await storage.getUser(session.startedByUserId);
          const reviewer = await storage.getUser(req.userContext.userId);
          if (submitter?.email) {
            const submitterName = submitter.firstName
              ? `${submitter.firstName} ${submitter.lastName ?? ""}`.trim()
              : submitter.email;
            const reviewerName = reviewer?.firstName
              ? `${reviewer.firstName} ${reviewer.lastName ?? ""}`.trim()
              : (reviewer?.email ?? "An admin");
            await sendCountReviewedNotification({
              sessionId: session.id,
              status: "rejected",
              reviewerName,
              adminNotes: session.adminNotes,
              submitterEmail: submitter.email,
              submitterName,
            });
          }
        }
      } catch (emailErr) {
        console.error("Failed to send count-rejected email:", emailErr);
      }
    } catch (error) {
      console.error("Failed to reject count session:", error);
      res.status(400).json({ message: "Failed to reject count session" });
    }
  });

  app.get("/api/inventory/count-sessions/:id/adjustments", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const adjustments = await storage.getAdjustmentsByCountSession(req.params.id, req.userContext.companyId);
      res.json(adjustments);
    } catch (error) {
      console.error("Failed to fetch session adjustments:", error);
      res.status(500).json({ message: "Failed to fetch session adjustments" });
    }
  });

  // ── Parts Usage ──────────────────────────────────────────────────────────────

  app.get("/api/repair-orders/:id/parts", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const partsUsage = await storage.getPartsUsageByRepairOrder(req.params.id, req.userContext.companyId);
      res.json(partsUsage);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch parts usage" });
    }
  });

  app.get("/api/parts-usage/:orderId", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const partsUsage = await storage.getPartsUsageByRepairOrder(req.params.orderId, req.userContext.companyId);
      res.json(partsUsage);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch parts usage" });
    }
  });

  app.post("/api/repair-orders/:id/parts", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const partsUsageData = { ...req.body, repairOrderId: req.params.id };
      const validatedPartsUsage = insertPartsUsageSchema.parse(partsUsageData);
      const partsUsage = await storage.createPartsUsage(validatedPartsUsage, req.userContext.companyId);
      res.status(201).json(partsUsage);
    } catch (error) {
      res.status(400).json({ message: "Failed to add parts to work order" });
    }
  });

  app.post("/api/parts-usage", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const validatedPartsUsage = insertPartsUsageSchema.parse(req.body);
      const partsUsage = await storage.createPartsUsage(validatedPartsUsage, req.userContext.companyId);
      res.status(201).json(partsUsage);
    } catch (error) {
      console.error("Error adding parts usage:", error);
      res.status(400).json({ message: "Failed to add parts to work order" });
    }
  });

  app.delete("/api/parts-usage/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      await storage.deletePartsUsage(req.params.id, req.userContext.companyId);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: "Failed to remove parts usage" });
    }
  });

  // ── Maintenance Catalog ───────────────────────────────────────────────────────

  // Seed defaults + get full tree
  app.get("/api/catalog/tree", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      await storage.seedCatalogDefaults(req.userContext.companyId);
      const tree = await storage.getCatalogTree(req.userContext.companyId);
      res.json(tree);
    } catch (error) {
      console.error("Failed to get catalog tree:", error);
      res.status(500).json({ message: "Failed to get catalog tree" });
    }
  });

  // Groups CRUD (admin/super_admin only for mutations)
  app.post("/api/catalog/groups", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { role } = req.userContext;
      if (role !== "admin" && role !== "super_admin") return res.status(403).json({ message: "Admin access required" });
      const data = insertMaintenanceGroupSchema.parse({ ...req.body, companyId: req.userContext.companyId });
      const group = await storage.createMaintenanceGroup(data);
      res.status(201).json(group);
    } catch (error) { res.status(400).json({ message: "Failed to create group" }); }
  });

  app.patch("/api/catalog/groups/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { role } = req.userContext;
      if (role !== "admin" && role !== "super_admin") return res.status(403).json({ message: "Admin access required" });
      const allowed = z.object({ name: z.string().min(1).optional(), sortOrder: z.number().int().optional() }).strict();
      const parsed = allowed.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid fields", errors: parsed.error.flatten() });
      const group = await storage.updateMaintenanceGroup(req.params.id, req.userContext.companyId, parsed.data);
      res.json(group);
    } catch (error) { res.status(400).json({ message: "Failed to update group" }); }
  });

  app.delete("/api/catalog/groups/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { role } = req.userContext;
      if (role !== "admin" && role !== "super_admin") return res.status(403).json({ message: "Admin access required" });
      await storage.deleteMaintenanceGroup(req.params.id, req.userContext.companyId);
      res.status(204).send();
    } catch (error) { res.status(400).json({ message: "Failed to delete group" }); }
  });

  // Subgroups CRUD (admin/super_admin only for mutations)
  app.post("/api/catalog/subgroups", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { role } = req.userContext;
      if (role !== "admin" && role !== "super_admin") return res.status(403).json({ message: "Admin access required" });
      const data = insertMaintenanceSubgroupSchema.parse({ ...req.body, companyId: req.userContext.companyId });
      const sg = await storage.createMaintenanceSubgroup(data);
      res.status(201).json(sg);
    } catch (error) { res.status(400).json({ message: "Failed to create subgroup" }); }
  });

  app.patch("/api/catalog/subgroups/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { role } = req.userContext;
      if (role !== "admin" && role !== "super_admin") return res.status(403).json({ message: "Admin access required" });
      const allowed = z.object({ name: z.string().min(1).optional(), sortOrder: z.number().int().optional() }).strict();
      const parsed = allowed.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid fields", errors: parsed.error.flatten() });
      const sg = await storage.updateMaintenanceSubgroup(req.params.id, req.userContext.companyId, parsed.data);
      res.json(sg);
    } catch (error) { res.status(400).json({ message: "Failed to update subgroup" }); }
  });

  app.delete("/api/catalog/subgroups/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { role } = req.userContext;
      if (role !== "admin" && role !== "super_admin") return res.status(403).json({ message: "Admin access required" });
      await storage.deleteMaintenanceSubgroup(req.params.id, req.userContext.companyId);
      res.status(204).send();
    } catch (error) { res.status(400).json({ message: "Failed to delete subgroup" }); }
  });

  // Items CRUD (admin/super_admin only for mutations)
  app.post("/api/catalog/items", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { role } = req.userContext;
      if (role !== "admin" && role !== "super_admin") return res.status(403).json({ message: "Admin access required" });
      const data = insertMaintenanceItemSchema.parse({ ...req.body, companyId: req.userContext.companyId });
      const item = await storage.createMaintenanceItem(data);
      res.status(201).json(item);
    } catch (error) { res.status(400).json({ message: "Failed to create item" }); }
  });

  app.patch("/api/catalog/items/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { role } = req.userContext;
      if (role !== "admin" && role !== "super_admin") return res.status(403).json({ message: "Admin access required" });
      const allowed = z.object({
        name: z.string().min(1).optional(),
        sortOrder: z.number().int().optional(),
        partId: z.string().nullable().optional(),
      }).strict();
      const parsed = allowed.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid fields", errors: parsed.error.flatten() });
      const item = await storage.updateMaintenanceItem(req.params.id, req.userContext.companyId, parsed.data);
      res.json(item);
    } catch (error: any) {
      const status = error.message?.includes("not found") ? 404 : 400;
      res.status(status).json({ message: error.message ?? "Failed to update item" });
    }
  });

  app.delete("/api/catalog/items/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const { role } = req.userContext;
      if (role !== "admin" && role !== "super_admin") return res.status(403).json({ message: "Admin access required" });
      await storage.deleteMaintenanceItem(req.params.id, req.userContext.companyId);
      res.status(204).send();
    } catch (error) { res.status(400).json({ message: "Failed to delete item" }); }
  });

  // ── Super Admin ──────────────────────────────────────────────────────────────

  const isSuperAdmin = async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated() || !req.user?.claims?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await storage.getUser(req.user.claims.sub);
    if (!user || user.role !== 'super_admin') {
      return res.status(403).json({ message: "Forbidden: Super admin access required" });
    }
    next();
  };

  app.get("/api/admin/companies", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const companies = await storage.getAllCompanies();
      res.json(companies);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch companies" });
    }
  });

  app.post("/api/admin/companies", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const { name, plan } = req.body;
      const company = await storage.createCompany({ name, plan });
      res.status(201).json(company);
    } catch (error) {
      res.status(400).json({ message: "Failed to create company" });
    }
  });

  app.get("/api/admin/users", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const users = await storage.getAllUsersWithCompany();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/assign-admin", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const { email, companyId } = req.body;
      let user = await storage.getUserByEmail(email);
      if (!user) {
        user = await storage.createUserPlaceholder({ email, role: 'admin', companyId });
      } else {
        user = await storage.updateUserRole(user.id, 'admin', companyId);
      }
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: "Failed to assign admin" });
    }
  });

  // Vehicle photo upload
  app.post("/api/vehicles/:id/photo", isAuthenticated, withCompanyContext, upload.single("photo"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
      const newFilename = `vehicle-${req.params.id}-${Date.now()}${ext}`;
      const newPath = path.join(uploadsDir, newFilename);
      fs.renameSync(req.file.path, newPath);
      const photoUrl = `/api/uploads/${newFilename}`;
      const vehicle = await storage.updateVehicle(req.params.id, req.userContext.companyId, { photoUrl });
      res.json({ photoUrl, vehicle });
    } catch (error) {
      res.status(500).json({ message: "Failed to upload photo" });
    }
  });

  // File serving
  app.get("/api/uploads/:filename", (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(uploadsDir, filename);
    if (fs.existsSync(filepath)) {
      res.sendFile(filepath);
    } else {
      res.status(404).json({ message: "File not found" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
