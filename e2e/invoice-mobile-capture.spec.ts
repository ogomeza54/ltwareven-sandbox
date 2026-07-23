import { createHash } from "node:crypto";
import { expect, test, type Page, type Route } from "@playwright/test";

const draftId = "00000000-0000-4000-8000-000000000001";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);
const pngChecksum = createHash("sha256").update(png).digest("hex");

interface MockState {
  revision: number;
  draftStatus: "uploaded" | "needs_review";
  activeRunId: string | null;
  extractionPolls: number;
  uploadAttempts: number;
  failFirstUpload: boolean;
  intakeSubmissions: number;
  assets: Array<{
    id: string;
    displayName: string;
    checksumSha256: string;
    detectedType: "image/png";
    byteSize: number;
    pageCount: number;
    position: number;
    state: "Saved";
    createdAt: string;
  }>;
}

function draft(state: MockState) {
  const timestamp = "2026-07-23T12:00:00.000Z";
  return {
    id: draftId,
    status: state.draftStatus,
    revision: state.revision,
    activeRunId: state.activeRunId,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastActivityAt: timestamp,
    source: {
      totalPages: state.assets.length,
      assets: state.assets,
    },
  };
}

async function json(route: Route, value: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
}

async function mockApplication(
  page: Page,
  failFirstUpload = false,
  commitBeforeFirstAbort = false,
  commitReorderBeforeAbort = false,
  commitDeleteBeforeAbort = false,
) {
  let reorderAborted = false;
  let deleteAborted = false;
  const state: MockState = {
    revision: 2,
    draftStatus: "uploaded",
    activeRunId: null,
    extractionPolls: 0,
    uploadAttempts: 0,
    failFirstUpload,
    intakeSubmissions: 0,
    assets: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        displayName: "page-one.png",
        checksumSha256: pngChecksum,
        detectedType: "image/png",
        byteSize: png.length,
        pageCount: 1,
        position: 1,
        state: "Saved",
        createdAt: "2026-07-23T12:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        displayName: "page-two.png",
        checksumSha256: pngChecksum.replace(/^./, "a"),
        detectedType: "image/png",
        byteSize: png.length,
        pageCount: 1,
        position: 2,
        state: "Saved",
        createdAt: "2026-07-23T12:00:00.000Z",
      },
    ],
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/user") {
      return json(route, {
        id: "user-1",
        email: "operator@example.test",
        role: "admin",
        companyId: "company-1",
        ownCompanyId: "company-1",
        activeCompanyName: "Test Company",
        authSource: "local",
        mustChangePassword: false,
      });
    }
    if (path === "/api/notifications") {
      return json(route, {
        lowStock: [],
        pendingCountReviews: [],
        pendingRepairOrders: [],
      });
    }
    if (path === "/api/invoice-drafts" && request.method() === "GET") {
      return json(route, [draft(state)]);
    }
    if (path === `/api/invoice-drafts/${draftId}`) {
      return json(route, draft(state));
    }
    if (
      path === `/api/invoice-drafts/${draftId}/extraction-runs` &&
      request.method() === "POST"
    ) {
      state.activeRunId = "00000000-0000-4000-8000-000000000010";
      state.revision += 1;
      return json(route, extractionRun(state, "queued"), 202);
    }
    if (path === "/api/invoice-extraction-runs/00000000-0000-4000-8000-000000000010") {
      state.extractionPolls += 1;
      if (state.extractionPolls >= 2) {
        state.draftStatus = "needs_review";
        state.revision += 1;
        return json(route, extractionRun(state, "completed"));
      }
      return json(route, extractionRun(state, "processing"));
    }
    if (
      path === `/api/invoice-drafts/${draftId}/assets` &&
      request.method() === "POST"
    ) {
      state.uploadAttempts += 1;
      const multipart = request.postDataBuffer()?.toString("utf8") ?? "";
      const uploadedName =
        /filename="([^"]+)"/.exec(multipart)?.[1] ?? "phone-invoice.png";
      const replacementAssetId = request.headers()["x-replaces-invoice-asset"];
      if (
        state.failFirstUpload &&
        state.uploadAttempts === 1 &&
        !commitBeforeFirstAbort
      ) {
        return route.abort("connectionreset");
      }
      state.revision += 1;
      const replacementPosition = replacementAssetId
        ? state.assets.find((asset) => asset.id === replacementAssetId)?.position
        : undefined;
      if (replacementAssetId) {
        state.assets = state.assets.filter(
          (asset) => asset.id !== replacementAssetId,
        );
      }
      state.assets.push({
        id: "00000000-0000-4000-8000-000000000004",
        displayName: uploadedName,
        checksumSha256: pngChecksum,
        detectedType: "image/png",
        byteSize: png.length,
        pageCount: 1,
        position: replacementPosition ?? state.assets.length + 1,
        state: "Saved",
        createdAt: "2026-07-23T12:00:00.000Z",
      });
      state.assets
        .sort((left, right) => left.position - right.position)
        .forEach((asset, index) => {
          asset.position = index + 1;
        });
      if (
        state.failFirstUpload &&
        state.uploadAttempts === 1 &&
        commitBeforeFirstAbort
      ) {
        return route.abort("connectionreset");
      }
      return json(route, draft(state), 202);
    }
    if (
      path === `/api/invoice-drafts/${draftId}/assets/order` &&
      request.method() === "PATCH"
    ) {
      const body = request.postDataJSON() as { assetIds: string[] };
      state.assets.sort(
        (left, right) =>
          body.assetIds.indexOf(left.id) - body.assetIds.indexOf(right.id),
      );
      state.assets.forEach((asset, index) => {
        asset.position = index + 1;
      });
      state.revision += 1;
      if (commitReorderBeforeAbort && !reorderAborted) {
        reorderAborted = true;
        return route.abort("connectionreset");
      }
      return json(route, draft(state));
    }
    if (
      path.startsWith(`/api/invoice-drafts/${draftId}/assets/`) &&
      request.method() === "DELETE"
    ) {
      const assetId = path.split("/").pop();
      state.assets = state.assets.filter((asset) => asset.id !== assetId);
      state.assets.forEach((asset, index) => {
        asset.position = index + 1;
      });
      state.revision += 1;
      if (commitDeleteBeforeAbort && !deleteAborted) {
        deleteAborted = true;
        return route.abort("connectionreset");
      }
      return json(route, draft(state));
    }
    if (path === "/api/inventory/intakes" && request.method() === "POST") {
      state.intakeSubmissions += 1;
      return json(route, { id: "intake-1" }, 201);
    }
    if (path.includes(`/api/invoice-drafts/${draftId}/assets/`)) {
      return route.fulfill({ status: 200, contentType: "image/png", body: png });
    }
    return json(route, []);
  });
  return state;
}

function extractionRun(
  state: MockState,
  status: "queued" | "processing" | "completed",
) {
  const value = {
    observed: null,
    normalized: null,
    confidence: null,
    sourceAssetId: null,
    sourcePage: null,
  };
  return {
    id: "00000000-0000-4000-8000-000000000010",
    draftId,
    runNumber: 1,
    status,
    revision: status === "completed" ? 2 : 1,
    attemptStatus: status === "completed" ? "completed" : "submitted",
    failureCode: null,
    engineVersion: "invoice-v1",
    model: "gpt-5.6-terra",
    schemaVersion: "invoice-proposal-v1",
    executionMode: "background",
    storeResponse: true,
    proposal:
      status === "completed"
        ? {
            schemaVersion: "invoice-proposal-v1",
            header: {
              vendorName: { ...value, observed: "Test Vendor", normalized: "Test Vendor" },
              invoiceNumber: value,
              invoiceDate: value,
              currency: { ...value, observed: "USD", normalized: "USD" },
              subtotal: value,
              tax: value,
              freight: value,
              total: value,
            },
            lines: [
              {
                description: { ...value, observed: "Brake pad", normalized: "Brake pad" },
                vendorPartNumber: value,
                quantity: { ...value, observed: "2", normalized: "2" },
                unitCost: value,
                lineTotal: value,
                classification: { kind: "inventory", confidence: null },
              },
            ],
            uncertainties: [],
          }
        : null,
    createdAt: "2026-07-23T12:00:00.000Z",
    completedAt: status === "completed" ? "2026-07-23T12:00:02.000Z" : null,
  };
}

async function openReceiveInventory(page: Page) {
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Receive Inventory", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("capture previews before upload, retries, reorders, resumes and enters manual mode", async ({
  page,
}, testInfo) => {
  const state = await mockApplication(page, true);
  await openReceiveInventory(page);

  const camera = page.getByLabel("Take invoice photo with rear camera");
  await expect(camera).toHaveAttribute("capture", "environment");
  await expect(page.getByLabel("Choose invoice image or PDF")).toBeVisible();
  await page.getByLabel("Choose invoice image or PDF").setInputFiles({
    name: "phone-invoice.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page.getByRole("img", { name: "Local preview of selected invoice" }),
  ).toBeVisible();
  await expect(page.getByText("Complete review before upload")).toBeVisible();
  expect(state.uploadAttempts).toBe(0);

  await page.getByRole("button", { name: /Use document/ }).click();
  await expect(page.getByRole("button", { name: "Retry upload" })).toBeVisible();
  expect(state.assets).toHaveLength(2);
  await page.getByRole("button", { name: "Retry upload" }).click();
  await expect(page.getByText("phone-invoice.png saved.")).toBeVisible();
  expect(state.assets).toHaveLength(3);

  await page.getByRole("button", { name: "Move saved page 2 earlier" }).click();
  await expect(page.getByText(/page-two\.png moved to position 1 of 3/)).toBeVisible();
  expect(state.assets[0].displayName).toBe("page-two.png");

  await page.getByRole("button", { name: "Enter manually" }).click();
  await expect(page.getByLabel("Vendor / Supplier *")).toBeFocused();

  await page.reload();
  await openReceiveInventory(page);
  await expect(page.getByText("phone-invoice.png").first()).toBeVisible();
  await expect(page.getByText(/position 1 of 3/).first()).toBeVisible();

  if (testInfo.project.name !== "desktop-chromium") {
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole("button", { name: "Receive & Update Stock" })).toBeVisible();
  }
});

test("mobile and narrow reflow keep controls reachable without required horizontal scroll", async ({
  page,
}, testInfo) => {
  await mockApplication(page);
  await openReceiveInventory(page);
  const dialog = page.getByRole("dialog");
  const takePhoto = page.getByText("Take photo", { exact: true }).locator("..");
  expect((await takePhoto.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect((await page.getByRole("button", { name: "Enter manually" }).boundingBox())?.height)
    .toBeGreaterThanOrEqual(44);

  if (testInfo.project.name !== "desktop-chromium") {
    const overflow = await dialog.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(
      dialog.locator("td").getByText("Part / Item", { exact: true }),
    ).toBeVisible();
  } else {
    await expect(dialog.locator("thead")).toBeVisible();
    await page.setViewportSize({ width: 640, height: 900 });
    const overflow = await dialog.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(
      dialog.locator("td").getByText("Part / Item", { exact: true }),
    ).toBeVisible();
  }
});

test("saved retake preserves the original until replacement succeeds", async ({
  page,
}) => {
  const state = await mockApplication(page);
  await openReceiveInventory(page);
  const firstPage = page
    .getByRole("article", { name: /Saved page 1: page-one\.png/ });
  const chooserPromise = page.waitForEvent("filechooser");
  await firstPage.getByRole("button", { name: "Retake saved page 1" }).click();
  const chooser = await chooserPromise;
  expect(state.assets.some((asset) => asset.displayName === "page-one.png")).toBe(
    true,
  );
  await chooser.setFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: /Use document/ }).click();
  await expect(page.getByText("replacement.png saved.")).toBeVisible();
  expect(state.assets.some((asset) => asset.displayName === "page-one.png")).toBe(
    false,
  );
  expect(state.assets[0].displayName).toBe("replacement.png");
});

test("saved retake remains available at the ten-page limit", async ({
  page,
}) => {
  const state = await mockApplication(page);
  for (let index = 3; index <= 10; index += 1) {
    state.assets.push({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      displayName: `page-${index}.png`,
      checksumSha256: `${index.toString(16)}`.padStart(64, "0"),
      detectedType: "image/png",
      byteSize: png.length,
      pageCount: 1,
      position: index,
      state: "Saved",
      createdAt: "2026-07-23T12:00:00.000Z",
    });
  }
  await openReceiveInventory(page);
  await expect(page.getByText("10 of 10 pages saved.")).toBeVisible();

  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Retake saved page 1", exact: true })
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "limit-replacement.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: /Use document/ }).click();

  await expect(page.getByText("limit-replacement.png saved.")).toBeVisible();
  expect(state.assets).toHaveLength(10);
  expect(state.assets[0].displayName).toBe("limit-replacement.png");
});

test("a committed upload with a lost response is recovered without retry duplication", async ({
  page,
}) => {
  const state = await mockApplication(page, true, true);
  await openReceiveInventory(page);
  await page.getByLabel("Choose invoice image or PDF").setInputFiles({
    name: "recovered.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: /Use document/ }).click();
  await expect(
    page.getByText("recovered.png saved after reconnecting."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry upload" })).toHaveCount(0);
  expect(state.uploadAttempts).toBe(1);
  expect(
    state.assets.filter((asset) => asset.displayName === "recovered.png"),
  ).toHaveLength(1);
});

test("committed reorder and delete responses are recovered from server truth", async ({
  page,
}) => {
  const state = await mockApplication(page, false, false, true, true);
  await openReceiveInventory(page);

  await page.getByRole("button", { name: "Move saved page 2 earlier" }).click();
  await expect(
    page.getByText(/page-two\.png moved to position 1 of 2 after reconnecting/),
  ).toBeVisible();
  expect(state.assets[0].displayName).toBe("page-two.png");

  await page.getByRole("button", { name: "Remove saved page 2" }).click();
  await expect(
    page.getByText(/page-one\.png removed after reconnecting/),
  ).toBeVisible();
  expect(state.assets.map((asset) => asset.displayName)).toEqual([
    "page-two.png",
  ]);
});

test("manual receiving remains submit-capable without invoice capture", async ({
  page,
}) => {
  const state = await mockApplication(page);
  await openReceiveInventory(page);
  await page.getByRole("button", { name: "Enter manually" }).click();
  await page.getByLabel("Vendor / Supplier *").fill("Manual Supplier");
  await page.getByLabel("Part or item name").fill("Manual Brake Pad");
  await page.getByLabel("Lot price").fill("25.00");
  await page.getByRole("button", { name: "Receive & Update Stock" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(state.intakeSubmissions).toBe(1);
});

test("AI extraction is polled and stops at a human review result without stock writes", async ({
  page,
}) => {
  const state = await mockApplication(page);
  await openReceiveInventory(page);
  await page.getByRole("button", { name: "Analyze invoice" }).click();
  await expect(page.getByText(/Status: queued|Status: processing/)).toBeVisible();
  await expect(
    page.getByText(/1 line items proposed for review/),
  ).toBeVisible({ timeout: 8_000 });
  expect(state.intakeSubmissions).toBe(0);
  await expect(page.getByRole("button", { name: "Receive & Update Stock" })).toBeVisible();
});
