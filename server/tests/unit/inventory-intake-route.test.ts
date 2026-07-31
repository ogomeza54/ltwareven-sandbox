import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createInventoryIntakeHandler } from "../../modules/inventory-receiving/inventory-intake-route";

const validBody = {
  vendor: "Fleet Supply",
  subtotal: "10",
  taxAmount: "0",
  deliveryFee: "0",
  totalAmount: "10",
  items: [
    {
      partNameSnapshot: "Filter",
      partNumberSnapshot: "F-1",
      qty: 1,
      unitCost: "10",
      lineTotal: "10",
    },
  ],
};

function responseRecorder() {
  const result: { status?: number; body?: unknown } = {};
  return {
    result,
    response: {
      status(code: number) {
        result.status = code;
        return this;
      },
      json(body: unknown) {
        result.body = body;
        return this;
      },
    },
  };
}

describe("createInventoryIntakeHandler", () => {
  test("returns 201 and derives tenant and actor from server context", async () => {
    const calls: unknown[][] = [];
    const handler = createInventoryIntakeHandler({
      async validateCatalogPlacements() {},
      async createInventoryIntake(...args: unknown[]) {
        calls.push(args);
        return { id: "intake-1" } as any;
      },
    });
    const { result, response } = responseRecorder();
    await handler(
      {
        body: {
          ...validBody,
          companyId: "forged-company",
          createdByUserId: "forged-user",
        },
        userContext: { companyId: "company-1", userId: "user-1" },
      } as any,
      response as any,
      () => undefined,
    );

    assert.equal(result.status, 201);
    assert.deepEqual(result.body, { id: "intake-1" });
    assert.equal(calls[0]?.[2], "company-1");
    assert.equal(calls[0]?.[3], "user-1");
  });

  test("preserves explicit validation and catalog-placement 400 responses", async () => {
    const handler = createInventoryIntakeHandler({
      async validateCatalogPlacements() {
        throw new Error("Group foreign not found");
      },
      async createInventoryIntake() {
        throw new Error("must not be called");
      },
    });

    const validation = responseRecorder();
    await handler(
      {
        body: { ...validBody, vendor: "" },
        userContext: { companyId: "company-1", userId: "user-1" },
      } as any,
      validation.response as any,
      () => undefined,
    );
    assert.deepEqual(validation.result, {
      status: 400,
      body: { message: "Vendor is required" },
    });

    const placement = responseRecorder();
    await handler(
      {
        body: {
          ...validBody,
          items: [{ ...validBody.items[0], groupId: "foreign" }],
        },
        userContext: { companyId: "company-1", userId: "user-1" },
      } as any,
      placement.response as any,
      () => undefined,
    );
    assert.deepEqual(placement.result, {
      status: 400,
      body: { message: "Group foreign not found" },
    });
  });

  test("keeps malformed shapes in the generic failure envelope", async () => {
    const handler = createInventoryIntakeHandler({
      async validateCatalogPlacements() {},
      async createInventoryIntake() {
        throw new Error("must not be called");
      },
    });
    const { result, response } = responseRecorder();
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      await handler(
        {
          body: { ...validBody, vendor: { invalid: true } },
          userContext: { companyId: "company-1", userId: "user-1" },
        } as any,
        response as any,
        () => undefined,
      );
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(result.status, 400);
    assert.equal(
      (result.body as { message: string }).message,
      "Failed to create inventory intake",
    );
  });
});
