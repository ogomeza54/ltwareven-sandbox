import type { InsertInventoryIntake, InventoryIntake } from "@shared/schema";

export interface InventoryReceivingActorContext {
  companyId: string;
  userId: string;
}

export interface InventoryReceivingLine {
  partId?: string;
  partNameSnapshot: string;
  partNumberSnapshot: string;
  itemType?: string;
  groupId?: string;
  subgroupId?: string;
  qty: number;
  unitCost: string;
  lineTotal: string;
  landedCost?: string;
}

export interface InventoryReceivingCommand {
  header: Omit<InsertInventoryIntake, "companyId" | "createdByUserId">;
  items: InventoryReceivingLine[];
}

export interface InventoryReceivingResult {
  intake: InventoryIntake;
}

export class InventoryReceivingError extends Error {
  constructor(
    public readonly code:
      | "PART_NOT_FOUND"
      | "GROUP_NOT_FOUND"
      | "SUBGROUP_NOT_FOUND"
      | "SUBGROUP_GROUP_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "InventoryReceivingError";
  }
}
