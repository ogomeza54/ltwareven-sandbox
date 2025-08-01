import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { 
  insertUserSchema, insertMechanicSchema, insertCustomerSchema, 
  insertVehicleSchema, insertRepairOrderSchema, insertInventoryPartSchema,
  insertPartsUsageSchema 
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

// Middleware to get user's company context
const withCompanyContext = async (req: any, res: any, next: any) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    
    req.userContext = {
      userId: user.id,
      companyId: user.companyId,
      role: user.role
    };
    
    next();
  } catch (error) {
    console.error("Error getting user context:", error);
    res.status(500).json({ message: "Failed to get user context" });
  }
};

// Auto-assignment algorithm
async function autoAssignMechanic(companyId: string, priority: string = 'medium'): Promise<string | null> {
  const availableMechanics = await storage.getAvailableMechanics(companyId);
  
  if (availableMechanics.length === 0) {
    return null;
  }

  // Sort by current workload (ascending) to assign to least busy mechanic
  const sortedMechanics = availableMechanics.sort((a, b) => a.currentWorkload - b.currentWorkload);
  
  // For high priority jobs, prefer specialists if available
  if (priority === 'high' || priority === 'urgent') {
    const specialists = sortedMechanics.filter(m => 
      m.specialization.toLowerCase().includes('specialist') || 
      m.specialization.toLowerCase().includes('senior')
    );
    if (specialists.length > 0) {
      return specialists[0].id;
    }
  }

  return sortedMechanics[0].id;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
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

  // Repair Orders
  app.get("/api/repair-orders", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const orders = await storage.getRepairOrdersByCompany(req.userContext.companyId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch repair orders" });
    }
  });

  app.get("/api/repair-orders/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const order = await storage.getRepairOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Repair order not found" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch repair order" });
    }
  });

  app.post("/api/repair-orders", isAuthenticated, withCompanyContext, upload.array('damagePhotos', 10), async (req: any, res) => {
    try {
      const body = req.body;
      
      // Parse the request body
      const customerData = {
        name: body.customerName,
        phone: body.phoneNumber,
        email: body.email || null,
        companyId: req.userContext.companyId
      };

      const vehicleData = {
        year: parseInt(body.vehicleYear),
        make: body.vehicleMake,
        model: body.vehicleModel,
        vin: body.vin || null,
        licensePlate: body.licensePlate || null,
        color: body.color || null,
        mileage: body.mileage ? parseInt(body.mileage) : null,
        companyId: req.userContext.companyId
      };

      // Find or create customer
      let customer = await storage.getCustomerByPhone(customerData.phone, req.userContext.companyId);
      if (!customer) {
        const validatedCustomer = insertCustomerSchema.parse(customerData);
        customer = await storage.createCustomer(validatedCustomer);
      }

      // Create vehicle
      const validatedVehicle = insertVehicleSchema.parse({
        ...vehicleData,
        customerId: customer.id
      });
      const vehicle = await storage.createVehicle(validatedVehicle);

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

      // Auto-assign mechanic
      const assignedMechanicId = await autoAssignMechanic(req.userContext.companyId, body.priority);

      // Create repair order
      const repairOrderData = {
        vehicleId: vehicle.id,
        customerId: customer.id,
        mechanicId: assignedMechanicId,
        inspectorId: req.userContext.userId,
        description: body.repairDescription,
        priority: body.priority || 'medium',
        status: 'pending',
        damagePhotos,
        companyId: req.userContext.companyId
      };

      const validatedRepairOrder = insertRepairOrderSchema.parse(repairOrderData);
      const repairOrder = await storage.createRepairOrder(validatedRepairOrder);

      // Update mechanic workload
      if (assignedMechanicId) {
        const mechanic = await storage.getMechanic(assignedMechanicId);
        if (mechanic) {
          await storage.updateMechanic(assignedMechanicId, {
            currentWorkload: mechanic.currentWorkload + 1
          });
        }
      }

      res.status(201).json(repairOrder);
    } catch (error) {
      console.error("Failed to create repair order:", error);
      res.status(400).json({ message: "Failed to create repair order" });
    }
  });

  app.patch("/api/repair-orders/:id", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const updates = req.body;
      const order = await storage.updateRepairOrder(req.params.id, updates);
      res.json(order);
    } catch (error) {
      res.status(400).json({ message: "Failed to update repair order" });
    }
  });

  // Mechanics
  app.get("/api/mechanics", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const mechanics = await storage.getMechanicsByCompany(req.userContext.companyId);
      res.json(mechanics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mechanics" });
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

  // Inventory
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
      if (!query) {
        return res.json([]);
      }
      const parts = await storage.searchParts(query, req.userContext.companyId);
      res.json(parts);
    } catch (error) {
      res.status(500).json({ message: "Failed to search parts" });
    }
  });

  app.post("/api/inventory", isAuthenticated, withCompanyContext, async (req: any, res) => {
    try {
      const partData = { ...req.body, companyId: req.userContext.companyId };
      const validatedPart = insertInventoryPartSchema.parse(partData);
      const part = await storage.createInventoryPart(validatedPart);
      res.status(201).json(part);
    } catch (error) {
      res.status(400).json({ message: "Failed to create inventory part" });
    }
  });

  // Parts Usage
  app.get("/api/repair-orders/:id/parts", isAuthenticated, withCompanyContext, async (req, res) => {
    try {
      const partsUsage = await storage.getPartsUsageByRepairOrder(req.params.id);
      res.json(partsUsage);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch parts usage" });
    }
  });

  app.post("/api/repair-orders/:id/parts", isAuthenticated, withCompanyContext, async (req, res) => {
    try {
      const partsUsageData = {
        ...req.body,
        repairOrderId: req.params.id
      };
      const validatedPartsUsage = insertPartsUsageSchema.parse(partsUsageData);
      const partsUsage = await storage.createPartsUsage(validatedPartsUsage);
      res.status(201).json(partsUsage);
    } catch (error) {
      res.status(400).json({ message: "Failed to add parts to repair order" });
    }
  });

  app.delete("/api/parts-usage/:id", isAuthenticated, withCompanyContext, async (req, res) => {
    try {
      await storage.deletePartsUsage(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: "Failed to remove parts usage" });
    }
  });

  // Super Admin Routes
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

  // Get all companies (super admin only)
  app.get("/api/admin/companies", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const companies = await storage.getAllCompanies();
      res.json(companies);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch companies" });
    }
  });

  // Create new company (super admin only)
  app.post("/api/admin/companies", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const { name, plan } = req.body;
      const company = await storage.createCompany({ name, plan });
      res.status(201).json(company);
    } catch (error) {
      res.status(400).json({ message: "Failed to create company" });
    }
  });

  // Get all users (super admin only)
  app.get("/api/admin/users", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const users = await storage.getAllUsersWithCompany();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Assign admin to company (super admin only)
  app.post("/api/admin/assign-admin", isAuthenticated, isSuperAdmin, async (req: any, res) => {
    try {
      const { email, companyId } = req.body;
      
      // Check if user exists and update their role and company
      let user = await storage.getUserByEmail(email);
      if (!user) {
        // Create a placeholder user that will be updated when they first log in
        user = await storage.createUserPlaceholder({
          email,
          role: 'admin',
          companyId
        });
      } else {
        // Update existing user
        user = await storage.updateUserRole(user.id, 'admin', companyId);
      }
      
      res.json(user);
    } catch (error) {
      console.error('Failed to assign admin:', error);
      res.status(400).json({ message: "Failed to assign admin" });
    }
  });

  // File serving for uploaded images
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
