import type { Request, RequestHandler } from "express";
import { storage } from "./storage";
import type {
  InvoiceActorContext,
  InvoiceRole,
} from "@shared/invoice-extraction/contracts";

type AuthRequest = Request & {
  session?: Request["session"] & {
    localUserId?: string;
    superAdminActiveCompanyId?: string;
  };
  user?: { claims?: { sub?: string } };
  userContext?: {
    userId: string;
    companyId: string;
    actorCompanyId: string;
    role: string;
    isProductAdministrator: boolean;
  };
};

export const resolveUserId = (req: AuthRequest): string | undefined =>
  req.session?.localUserId || req.user?.claims?.sub;

export const withCompanyContext: RequestHandler = async (
  request,
  response,
  next,
) => {
  const req = request as AuthRequest;
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      response.status(401).json({ message: "User not found" });
      return;
    }
    const user = await storage.getUser(userId);
    if (!user) {
      response.status(401).json({ message: "User not found" });
      return;
    }
    let effectiveCompanyId = user.companyId;
    if (user.role === "super_admin" && req.session?.superAdminActiveCompanyId) {
      effectiveCompanyId = req.session.superAdminActiveCompanyId;
    }
    req.userContext = {
      userId: user.id,
      companyId: effectiveCompanyId,
      actorCompanyId: user.companyId,
      role: user.role,
      // Product administration is a separate trusted capability. No existing
      // customer role silently receives it in this story.
      isProductAdministrator: false,
    };
    next();
  } catch (error) {
    console.error("Error getting user context:", error);
    response.status(500).json({ message: "Failed to get user context" });
  }
};

export function invoiceActorFromRequest(request: Request): InvoiceActorContext {
  const context = (request as AuthRequest).userContext;
  if (!context) {
    throw new Error("Authenticated company context is missing");
  }
  return {
    actorUserId: context.userId,
    actorCompanyId: context.actorCompanyId,
    effectiveCompanyId: context.companyId,
    role: context.role as InvoiceRole,
    isProductAdministrator: context.isProductAdministrator,
  };
}
