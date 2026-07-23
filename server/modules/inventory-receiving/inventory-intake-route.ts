import type { RequestHandler } from "express";
import type { InsertInventoryIntake, InventoryIntake } from "@shared/schema";
import {
  InventoryIntakeRequestValidationError,
  normalizeInventoryIntakeRequest,
} from "./inventory-intake-command";
import type { InventoryReceivingLine } from "./types";

interface InventoryIntakeRouteStorage {
  validateCatalogPlacements(
    placements: Array<{ groupId?: string; subgroupId?: string }>,
    companyId: string,
  ): Promise<void>;
  createInventoryIntake(
    header: Omit<InsertInventoryIntake, "companyId" | "createdByUserId">,
    items: InventoryReceivingLine[],
    companyId: string,
    userId: string,
  ): Promise<InventoryIntake>;
}

export function createInventoryIntakeHandler(
  routeStorage: InventoryIntakeRouteStorage,
): RequestHandler {
  return async (req: any, res) => {
    try {
      let command;
      try {
        command = normalizeInventoryIntakeRequest(req.body);
      } catch (error) {
        if (error instanceof InventoryIntakeRequestValidationError) {
          return res.status(400).json({ message: error.message });
        }
        throw error;
      }

      const placements = command.items
        .filter((item) => item.groupId || item.subgroupId)
        .map((item) => ({
          groupId: item.groupId || undefined,
          subgroupId: item.subgroupId || undefined,
        }));
      if (placements.length > 0) {
        try {
          await routeStorage.validateCatalogPlacements(
            placements,
            req.userContext.companyId,
          );
        } catch (error) {
          return res.status(400).json({
            message:
              error instanceof Error
                ? error.message
                : "Invalid catalog placement",
          });
        }
      }

      const intake = await routeStorage.createInventoryIntake(
        command.header,
        command.items,
        req.userContext.companyId,
        req.userContext.userId,
      );
      return res.status(201).json(intake);
    } catch (error) {
      console.error("Failed to create inventory intake:", error);
      return res.status(400).json({
        message: "Failed to create inventory intake",
        error: error instanceof Error ? error.message : undefined,
      });
    }
  };
}
