import { createHash } from "node:crypto";
import { expect, test, type Page, type Route } from "@playwright/test";

const draftId = "00000000-0000-4000-8000-000000000001";
const freshDraftId = "00000000-0000-4000-8000-000000000101";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);
const pngChecksum = createHash("sha256").update(png).digest("hex");

function onePagePdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>",
    "<< /Length 27 >>\nstream\n0 0 0 RG 72 650 468 72 re S\nendstream",
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n`;
  source += "0000000000 65535 f \n";
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}

function twoPagePdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 5 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 6 0 R >>",
    "<< /Length 27 >>\nstream\n0 0 0 RG 72 650 468 72 re S\nendstream",
    "<< /Length 27 >>\nstream\n0 0 0 RG 72 550 468 72 re S\nendstream",
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n`;
  source += "0000000000 65535 f \n";
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}

interface MockState {
  revision: number;
  draftStatus:
    | "uploaded"
    | "needs_review"
    | "rejected"
    | "confirmed"
    | "canceled";
  activeRunId: string | null;
  extractionPolls: number;
  reviewSaves: number;
  reviewDecision: "draft" | "approved" | "rejected";
  reviewHeader: Record<string, string | null>;
  reviewedFields: string[];
  selectedPartId: string | null;
  proposedNewPart: {
    name: string;
    partNumber: string;
    itemType: "inventory" | "consumable";
    category: string | null;
    groupId: string | null;
    subgroupId: string | null;
  } | null;
  lineVendorPartNumber: string | null;
  lineUnitCost: string | null;
  lineClassification: "inventory" | "consumable" | "adjustment" | "unknown";
  lineDecision: "draft" | "approved";
  confirmationStatus: "reserved" | "completed";
  stockConfirmations: number;
  rejectionReason: string | null;
  uploadAttempts: number;
  failFirstUpload: boolean;
  intakeSubmissions: number;
  draftCreations: number;
  matchRevisionConflicts: number;
  coreAdjustmentInvoice: boolean;
  freshDraftAssets: string[];
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
  conflictFirstMatchUpdate = false,
  coreAdjustmentInvoice = false,
) {
  let reorderAborted = false;
  let deleteAborted = false;
  const state: MockState = {
    revision: 2,
    draftStatus: "uploaded",
    activeRunId: null,
    extractionPolls: 0,
    reviewSaves: 0,
    reviewDecision: "draft",
    reviewHeader: {
      vendorName: "Test Vendor",
      invoiceNumber: null,
      invoiceDate: null,
      currency: "USD",
      subtotal: null,
      tax: null,
      freight: null,
      total: null,
    },
    reviewedFields: [],
    selectedPartId: null,
    proposedNewPart: null,
    lineVendorPartNumber: null,
    lineUnitCost: null,
    lineClassification: "inventory",
    lineDecision: "draft",
    confirmationStatus: "reserved",
    stockConfirmations: 0,
    rejectionReason: null,
    uploadAttempts: 0,
    failFirstUpload,
    intakeSubmissions: 0,
    draftCreations: 0,
    matchRevisionConflicts: 0,
    coreAdjustmentInvoice,
    freshDraftAssets: [],
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
    if (path === "/api/invoice-drafts" && request.method() === "POST") {
      state.draftCreations += 1;
      return json(route, freshDraft(state), 201);
    }
    if (path === `/api/invoice-drafts/${freshDraftId}`) {
      return json(route, freshDraft(state));
    }
    if (
      path === `/api/invoice-drafts/${freshDraftId}/assets` &&
      request.method() === "POST"
    ) {
      const multipart = request.postDataBuffer()?.toString("utf8") ?? "";
      const uploadedName =
        /filename="([^"]+)"/.exec(multipart)?.[1] ?? "new-invoice.png";
      state.freshDraftAssets.push(uploadedName);
      return json(route, freshDraft(state), 202);
    }
    if (path === `/api/invoice-drafts/${draftId}`) {
      return json(route, draft(state));
    }
    if (
      path === `/api/invoice-drafts/${draftId}/cancel` &&
      request.method() === "POST"
    ) {
      state.draftStatus = "canceled";
      state.revision += 1;
      return json(route, draft(state));
    }
    if (
      path === `/api/invoice-drafts/${draftId}/review` &&
      request.method() === "GET"
    ) {
      return json(route, reviewWorkspace(state));
    }
    if (
      path ===
        `/api/invoice-drafts/${draftId}/review/lines/00000000-0000-4000-8000-000000000020/candidates` &&
      request.method() === "GET"
    ) {
      return json(route, [
        {
          part: {
            id: "00000000-0000-4000-8000-000000000030",
            name: "Brake Pad Catalog",
            partNumber: "BP-100",
            category: "Brakes",
            itemType: "inventory",
          },
          score: 95,
          signals: ["Exact part reference", "Name similarity 80%"],
        },
      ]);
    }
    if (
      path === `/api/invoice-drafts/${draftId}/review/matches` &&
      request.method() === "PATCH"
    ) {
      if (
        conflictFirstMatchUpdate &&
        state.lineDecision === "approved" &&
        state.matchRevisionConflicts === 0
      ) {
        state.matchRevisionConflicts += 1;
        return json(
          route,
          {
            code: "INVOICE_DRAFT_REVISION_CONFLICT",
            message: "The invoice draft changed. Refresh and try again.",
          },
          409,
        );
      }
      const body = request.postDataJSON() as {
        revision: number;
        matches: Array<{
          selectedPartId: string | null;
          proposedNewPart: MockState["proposedNewPart"];
        }>;
      };
      expect(body).not.toHaveProperty("companyId");
      state.selectedPartId = body.matches[0]?.selectedPartId ?? null;
      state.proposedNewPart = body.matches[0]?.proposedNewPart ?? null;
      state.revision += 1;
      return json(route, reviewWorkspace(state));
    }
    if (
      path === `/api/invoice-drafts/${draftId}/review/lines` &&
      request.method() === "PATCH"
    ) {
      const body = request.postDataJSON() as {
        decision: "draft" | "approved";
        lines: Array<{
          unitCost: string | null;
          classification: "inventory" | "consumable" | "adjustment" | "unknown";
        }>;
      };
      state.lineUnitCost = body.lines[0]?.unitCost ?? null;
      state.lineClassification =
        body.lines[0]?.classification ?? state.lineClassification;
      state.lineDecision = body.decision;
      state.revision += 1;
      return json(route, reviewWorkspace(state));
    }
    if (
      path === `/api/invoice-drafts/${draftId}/confirmation-intents` &&
      request.method() === "POST"
    ) {
      return json(route, confirmationIntent(state), 201);
    }
    if (
      path ===
        `/api/invoice-drafts/${draftId}/confirmation-intents/00000000-0000-4000-8000-000000000040/confirm` &&
      request.method() === "POST"
    ) {
      state.confirmationStatus = "completed";
      state.stockConfirmations += 1;
      state.draftStatus = "confirmed";
      return json(route, confirmationIntent(state));
    }
    if (
      path === `/api/invoice-drafts/${draftId}/review` &&
      request.method() === "PATCH"
    ) {
      const body = request.postDataJSON() as {
        revision: number;
        header: Record<string, string | null>;
        reviewedFields: string[];
        decision: "draft" | "approved";
      };
      expect(body).not.toHaveProperty("companyId");
      state.reviewHeader = body.header;
      state.reviewedFields = body.reviewedFields;
      state.reviewDecision = body.decision;
      state.reviewSaves += 1;
      state.revision += 1;
      return json(route, reviewWorkspace(state));
    }
    if (
      path === `/api/invoice-drafts/${draftId}/reject` &&
      request.method() === "POST"
    ) {
      const body = request.postDataJSON() as { reason: string };
      state.reviewDecision = "rejected";
      state.rejectionReason = body.reason;
      state.draftStatus = "rejected";
      state.revision += 1;
      return json(route, reviewWorkspace(state));
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

function freshDraft(state: MockState) {
  const timestamp = "2026-07-23T12:05:00.000Z";
  return {
    id: freshDraftId,
    status: state.freshDraftAssets.length ? "uploaded" : "draft",
    revision: state.freshDraftAssets.length,
    activeRunId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastActivityAt: timestamp,
    source: state.freshDraftAssets.length
      ? {
          totalPages: state.freshDraftAssets.length,
          assets: state.freshDraftAssets.map((displayName, index) => ({
            id: `00000000-0000-4000-8000-${String(102 + index).padStart(12, "0")}`,
            displayName,
            checksumSha256: pngChecksum,
            detectedType: "image/png",
            byteSize: png.length,
            pageCount: 1,
            position: index + 1,
            state: "Saved",
            createdAt: timestamp,
          })),
        }
      : null,
  };
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
    startedAt:
      status === "queued" ? null : "2026-07-23T12:00:00.250Z",
    completedAt: status === "completed" ? "2026-07-23T12:00:02.000Z" : null,
  };
}

function reviewWorkspace(state: MockState) {
  const completed = extractionRun(state, "completed");
  const totalReviewed = state.reviewedFields.includes("total");
  const coreLines = [
    {
      id: "00000000-0000-4000-8000-000000000020",
      sourceLineIndex: 0,
      position: 1,
      description: "BRAKE SHOE KIT 4711 Q PLUS",
      vendorPartNumber: "104F/ABP MK4711Q 20STAN",
      quantity: "2",
      unitCost: "61.8000",
      calculatedLineTotal: "123.60",
      classification: "consumable" as const,
      proposed: null,
      match: {
        decision: "unresolved" as const,
        selectedPart: null,
        proposedNewPart: null,
        originalSuggestion: null,
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000021",
      sourceLineIndex: 1,
      position: 2,
      description: "CORE CHARGE",
      vendorPartNumber: "104F/ABP MK4711Q 20STAN-CORE",
      quantity: "2",
      unitCost: "55.0000",
      calculatedLineTotal: "110.00",
      classification: "adjustment" as const,
      proposed: null,
      match: {
        decision: "unresolved" as const,
        selectedPart: null,
        proposedNewPart: null,
        originalSuggestion: null,
      },
    },
    {
      id: "00000000-0000-4000-8000-000000000022",
      sourceLineIndex: 2,
      position: 3,
      description: "CORE RETURN",
      vendorPartNumber: "104F/ABP MK4711Q 20STAN-CORE",
      quantity: "-2",
      unitCost: "45.0000",
      calculatedLineTotal: "-90.00",
      classification: "adjustment" as const,
      proposed: null,
      match: {
        decision: "unresolved" as const,
        selectedPart: null,
        proposedNewPart: null,
        originalSuggestion: null,
      },
    },
  ];
  return {
    draftId,
    draftRevision: state.revision,
    reviewRevision: state.reviewSaves,
    decision: state.reviewDecision,
    rejectionReason: state.rejectionReason,
    proposedHeader: completed.proposal?.header,
    finalHeader: state.coreAdjustmentInvoice
      ? {
          vendorName: "DOGGETT FREIGHTLINER OF SOUTH TEXAS, LLC",
          invoiceNumber: "X104654880:01",
          invoiceDate: "2024-09-09",
          currency: "USD",
          subtotal: "143.60",
          tax: "11.86",
          freight: "0.00",
          total: "155.46",
        }
      : state.reviewHeader,
    reviewedFields: state.reviewedFields,
    issues: totalReviewed
      ? []
      : [
          {
            path: "header.total",
            reason: "missing",
            message: "Invoice total needs review.",
          },
        ],
    lines: state.coreAdjustmentInvoice ? coreLines : [
      {
        id: "00000000-0000-4000-8000-000000000020",
        sourceLineIndex: 0,
        position: 1,
        description: "Brake pad",
        vendorPartNumber: state.lineVendorPartNumber,
        quantity: "2",
        unitCost: state.lineUnitCost,
        calculatedLineTotal: state.lineUnitCost ? "100.00" : null,
        classification: state.lineClassification,
        proposed: completed.proposal?.lines[0],
        match: {
          decision: state.selectedPartId
            ? "existing"
            : state.proposedNewPart
              ? "new"
              : "unresolved",
          selectedPart: state.selectedPartId
            ? {
                id: state.selectedPartId,
                name: "Brake Pad Catalog",
                partNumber: "BP-100",
                category: "Brakes",
                itemType: "inventory",
              }
            : null,
          proposedNewPart: state.proposedNewPart,
          originalSuggestion: null,
        },
      },
    ],
    reconciliation: state.coreAdjustmentInvoice ? {
      decision: "draft",
      complete: true,
      withinTolerance: true,
      observedSubtotal: "143.60",
      observedTax: "11.86",
      observedFreight: null,
      observedTotal: "155.46",
      calculatedSubtotal: "143.60",
      calculatedTax: "11.86",
      calculatedFreight: "0.00",
      calculatedTotal: "155.46",
      difference: "0.00",
    } : {
      decision: state.lineDecision,
      complete: state.lineUnitCost !== null,
      withinTolerance: state.lineUnitCost === "50",
      observedSubtotal: null,
      observedTax: null,
      observedFreight: null,
      observedTotal: state.reviewHeader.total,
      calculatedSubtotal: state.lineUnitCost ? "100.00" : null,
      calculatedTax: state.lineUnitCost ? "0.00" : null,
      calculatedFreight: state.lineUnitCost ? "0.00" : null,
      calculatedTotal: state.lineUnitCost ? "100.00" : null,
      difference: state.lineUnitCost ? "0.00" : null,
    },
    source: draft(state).source,
    updatedAt: "2026-07-23T12:00:02.000Z",
  };
}

function confirmationIntent(state: MockState) {
  return {
    id: "00000000-0000-4000-8000-000000000040",
    draftId,
    draftRevision: state.revision,
    idempotencyKey: "invoice-confirmation-e2e-key",
    payloadHash: "a".repeat(64),
    status: state.confirmationStatus,
    duplicateStatus: "clear",
    duplicateSignals: [],
    overrideReason: null,
    summary: {
      vendor: state.reviewHeader.vendorName,
      invoiceNumber: state.reviewHeader.invoiceNumber,
      invoiceDate: state.reviewHeader.invoiceDate,
      currency: "USD",
      subtotal: "100.00",
      tax: "0.00",
      freight: "0.00",
      total: "100.00",
      lines: [
        {
          lineId: "00000000-0000-4000-8000-000000000020",
          description: "Brake pad",
          partNumber: "BP-100",
          itemType: "inventory",
          quantity: "2",
          unitCost: "50",
          lineTotal: "100.00",
          resolution: {
            kind: "existing",
            partId: "00000000-0000-4000-8000-000000000030",
            partName: "Brake Pad Catalog",
          },
        },
      ],
      newPartCount: 0,
      stockUnitDelta: "2",
    },
    intakeId:
      state.confirmationStatus === "completed"
        ? "00000000-0000-4000-8000-000000000050"
        : null,
    createdAt: "2026-07-23T12:00:03.000Z",
  };
}

async function openReceiveInventory(page: Page) {
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Receive Inventory", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("Take photo requests the device camera and explains denied permission", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      },
    });
  });
  await mockApplication(page);
  await openReceiveInventory(page);

  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Take invoice photo" })).toBeVisible();
  await expect(
    page.getByText("Camera access was denied. Allow camera access in your browser, then try again."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose an image instead" })).toBeVisible();
});

test("capture previews before upload, retries, reorders, resumes and enters manual mode", async ({
  page,
}, testInfo) => {
  const state = await mockApplication(page, true);
  await openReceiveInventory(page);

  await page.getByRole("button", { name: "Move saved page 2 earlier" }).click();
  await expect(page.getByText(/page-two\.png moved to position 1 of 2/)).toBeVisible();
  expect(state.assets[0].displayName).toBe("page-two.png");

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
  await expect(
    page.getByRole("progressbar", { name: "AI processing progress" }),
  ).toBeVisible();

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

test("PDF selection renders and checks every page locally before upload", async ({
  page,
}) => {
  await mockApplication(page);
  await openReceiveInventory(page);
  await page.getByLabel("Choose invoice image or PDF").setInputFiles({
    name: "local-two-page-preview.pdf",
    mimeType: "application/pdf",
    buffer: twoPagePdf(),
  });
  await expect(
    page.getByRole("img", { name: "Local preview of the first PDF page" }),
  ).toBeVisible();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await expect(page.getByText("2 pages checked")).toBeVisible();
  await expect(page.getByText(/Page 1:/)).toBeVisible();
  await expect(page.getByText(/Page 2:/)).toBeVisible();
  await expect(
    page.getByText(/quality checks.*not.*available/i),
  ).toHaveCount(0);
});

test("saved retake preserves the original until replacement succeeds", async ({
  page,
}) => {
  const state = await mockApplication(page);
  await openReceiveInventory(page);
  const firstPage = page
    .getByRole("article", { name: /Saved page 1: page-one\.png/ });
  await firstPage.getByRole("button", { name: "Retake saved page 1" }).click();
  await expect(page.getByRole("heading", { name: "Take invoice photo" })).toBeVisible();
  expect(state.assets.some((asset) => asset.displayName === "page-one.png")).toBe(
    true,
  );
  await page.getByLabel("Take invoice photo with rear camera").setInputFiles({
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

  await page
    .getByRole("button", { name: "Retake saved page 1", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Take invoice photo" })).toBeVisible();
  await page.getByLabel("Take invoice photo with rear camera").setInputFiles({
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

test("AI extraction populates the existing intake form without stock writes", async ({
  page,
}) => {
  const state = await mockApplication(page);
  await openReceiveInventory(page);
  await page.getByRole("button", { name: "Analyze invoice" }).click();
  await expect(
    page.getByText("1 line items ready for review."),
  ).toBeVisible({ timeout: 8_000 });
  const progress = page.getByRole("status", {
    name: "Invoice analysis progress",
  });
  await expect(progress).toContainText("AI processing completed");
  await expect(progress).toContainText("1.8 s");
  await expect(progress).not.toContainText("Queue");
  await expect(progress).not.toContainText("Total");
  await expect(page.getByRole("progressbar", { name: "AI processing progress" })).toHaveAttribute("aria-valuenow", "100");
  await expect(
    page.getByRole("region", { name: "Invoice review workspace" }),
  ).toHaveCount(0);
  await expect(page.getByText(/Invoice scanned · 1 line detected/)).toBeVisible();
  const vendor = page.getByLabel("Vendor / Supplier *", { exact: true });
  await expect(vendor).toHaveValue("Test Vendor");
  await vendor.fill("Corrected Vendor");
  await expect(vendor).toHaveValue("Corrected Vendor");
  await expect(page.getByText("New stock part — verify its name and reference")).toBeVisible();
  expect(state.intakeSubmissions).toBe(0);
  expect(state.stockConfirmations).toBe(0);
  await expect(page.getByRole("button", { name: "Confirm & Update Stock" })).toBeVisible();
});

test("an exact stock reference is linked automatically but still waits for final confirmation", async ({
  page,
}) => {
  const state = await mockApplication(page);
  state.draftStatus = "needs_review";
  state.lineVendorPartNumber = "BP-100";

  await openReceiveInventory(page);
  await expect(
    page.getByText("Matched to existing stock"),
  ).toBeVisible();
  await expect(page.getByLabel("Part or item name")).toHaveValue(
    "Brake Pad Catalog",
  );
  await expect.poll(() => state.selectedPartId).toBe(
    "00000000-0000-4000-8000-000000000030",
  );
  expect(state.lineDecision).toBe("draft");
  expect(state.stockConfirmations).toBe(0);
});

test("a reviewed invoice can be discarded and replaced without changing stock", async ({
  page,
}) => {
  const state = await mockApplication(page);
  await openReceiveInventory(page);
  await page.getByRole("button", { name: "Analyze invoice" }).click();
  await expect(
    page.getByText(/Invoice scanned · 1 line detected/),
  ).toBeVisible({ timeout: 8_000 });

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Discard this invoice and start over?");
    await dialog.accept();
  });
  await page
    .getByRole("button", { name: "Discard invoice and start over" })
    .first()
    .click();

  await expect(
    page.getByText("Invoice discarded. You can upload another invoice."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Invoice review workspace" }),
  ).toHaveCount(0);
  await expect(page.getByText("page-one.png")).toHaveCount(0);
  expect(state.draftStatus).toBe("canceled");
  expect(state.stockConfirmations).toBe(0);

  await page.getByLabel("Choose invoice image or PDF").setInputFiles({
    name: "replacement-after-discard.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: /Use document/ }).click();
  await expect(
    page.getByText("replacement-after-discard.png saved."),
  ).toBeVisible();
  expect(state.draftCreations).toBe(1);
});

test("an unknown line classification is highlighted inline", async ({
  page,
}) => {
  const state = await mockApplication(page);
  state.draftStatus = "needs_review";
  state.reviewDecision = "approved";
  state.reviewHeader.total = "100.00";
  state.reviewedFields = ["total"];
  state.lineUnitCost = "50";
  state.lineClassification = "unknown";
  state.lineDecision = "approved";
  state.selectedPartId = "00000000-0000-4000-8000-000000000030";

  await openReceiveInventory(page);
  await expect(
    page.getByText("Choose Inventory or Consumable for this line."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByText("Choose Inventory or Consumable for this line."),
  ).toHaveCount(0);
});

test("reviewed invoice confirms stock exactly once through the reserved intent", async ({
  page,
}) => {
  const state = await mockApplication(page);
  state.lineVendorPartNumber = "BP-100";
  await openReceiveInventory(page);
  await page.getByRole("button", { name: "Analyze invoice" }).click();
  await expect(
    page.getByText(/Invoice scanned · 1 line detected/),
  ).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("Matched to existing stock")).toBeVisible();
  await expect(page.locator("#receive-inventory-vendor")).toHaveValue(
    "Test Vendor",
  );
  await page.locator("#receive-inventory-invoice-number").fill("INV-E2E-1");
  await page.locator("#receive-inventory-total").fill("100.00");
  await expect(page.getByLabel("Part or item name")).toHaveValue(
    "Brake Pad Catalog",
  );
  await expect(page.getByLabel("Part number")).toHaveValue("BP-100");
  await page.getByLabel("Lot price").fill("100.00");
  await expect(page.getByLabel("Lot price")).toHaveValue("100.00");
  await expect(page.locator("#receive-inventory-tax")).toHaveValue("0.00");
  await expect(page.locator("#receive-inventory-total")).toHaveValue("100.00");
  expect(state.intakeSubmissions).toBe(0);
  await page.getByRole("button", { name: "Confirm & Update Stock" }).click();
  await expect.poll(() => state.stockConfirmations).toBe(1);
  expect(state.intakeSubmissions).toBe(0);
  await expect(page.getByRole("dialog")).toBeHidden();
  const reopen = page
    .getByRole("button", { name: "Receive Inventory", exact: true })
    .first();
  await expect(reopen).toBeVisible();
  await reopen.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("page-one.png")).toHaveCount(0);
  await expect(page.getByText(/Status: completed/)).toHaveCount(0);
  await expect(page.getByText("0 of 10 pages saved.")).toBeVisible();
});

test("confirmation refreshes and retries once after a draft revision conflict", async ({
  page,
}) => {
  const state = await mockApplication(page, false, false, false, false, true);
  state.lineVendorPartNumber = "BP-100";
  await openReceiveInventory(page);
  await page.getByRole("button", { name: "Analyze invoice" }).click();
  await expect(
    page.getByText(/Invoice scanned · 1 line detected/),
  ).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("Matched to existing stock")).toBeVisible();
  await page.locator("#receive-inventory-invoice-number").fill("INV-CONFLICT-1");
  await page.locator("#receive-inventory-total").fill("100.00");
  await page.getByLabel("Lot price").fill("100.00");

  await page.getByRole("button", { name: "Confirm & Update Stock" }).click();

  await expect.poll(() => state.matchRevisionConflicts).toBe(1);
  await expect.poll(() => state.stockConfirmations).toBe(1);
  await expect(page.getByText("Failed to confirm invoice")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("CORE charge and return stay financial adjustments with correct landed cost", async ({
  page,
}) => {
  await mockApplication(page, false, false, false, false, false, true);
  await openReceiveInventory(page);
  await page.getByRole("button", { name: "Analyze invoice" }).click();

  await expect(page.getByText(/Invoice scanned · 3 lines detected/)).toBeVisible({
    timeout: 8_000,
  });
  await expect(page.getByText("Charge · no stock movement")).toBeVisible();
  await expect(page.getByText("Credit · no stock movement")).toBeVisible();
  await expect(page.getByText("$77.7300")).toBeVisible();
  await expect(page.getByText("$143.60")).toBeVisible();
  await expect(page.locator("#receive-inventory-total")).toHaveValue("155.46");
  await expect(page.getByText("Totals Match")).toBeVisible();
});
