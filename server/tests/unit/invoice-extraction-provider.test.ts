import assert from "node:assert/strict";
import test from "node:test";
import {
  invoiceProposalSchema,
  rejectInvoiceReviewSchema,
  startInvoiceExtractionSchema,
  updateInvoiceHeaderReviewSchema,
} from "@shared/invoice-extraction/contracts";
import { invoiceProposalJsonSchema } from "../../modules/invoice-extraction/providers/openai-invoice-provider";
import {
  getInvoiceExtractionRun,
  startInvoiceExtraction,
} from "../../../client/src/features/invoice-extraction/invoice-source-api";

const id = "00000000-0000-4000-8000-000000000001";
const observed = {
  observed: null,
  normalized: null,
  confidence: null,
  sourceAssetId: null,
  sourcePage: null,
};
const proposal = {
  schemaVersion: "invoice-proposal-v1",
  header: {
    vendorName: observed,
    invoiceNumber: observed,
    invoiceDate: observed,
    currency: observed,
    subtotal: observed,
    tax: observed,
    freight: observed,
    total: observed,
  },
  lines: [],
  uncertainties: [
    { path: "header.total", reason: "missing", message: "Not visible" },
  ],
} as const;

test("proposal contract keeps observed, normalized, provenance and uncertainty distinct", () => {
  assert.deepEqual(invoiceProposalSchema.parse(proposal), proposal);
  assert.equal(
    invoiceProposalSchema.safeParse({
      ...proposal,
      header: {
        ...proposal.header,
        total: { ...observed, confidence: 1.2 },
      },
    }).success,
    false,
  );
  assert.equal(invoiceProposalJsonSchema.additionalProperties, false);
});

test("start command rejects tenant and provider fields", () => {
  assert.equal(startInvoiceExtractionSchema.safeParse({ revision: 4 }).success, true);
  assert.equal(
    startInvoiceExtractionSchema.safeParse({
      revision: 4,
      companyId: "attacker",
      model: "unapproved",
    }).success,
    false,
  );
});

test("review commands are revisioned, strict and require a rejection reason", () => {
  const header = {
    vendorName: "Vendor",
    invoiceNumber: null,
    invoiceDate: null,
    currency: "USD",
    subtotal: null,
    tax: null,
    freight: null,
    total: null,
  };
  assert.equal(
    updateInvoiceHeaderReviewSchema.safeParse({
      revision: 3,
      header,
      reviewedFields: ["vendorName"],
      decision: "draft",
    }).success,
    true,
  );
  assert.equal(
    updateInvoiceHeaderReviewSchema.safeParse({
      revision: 3,
      header,
      reviewedFields: [],
      decision: "draft",
      companyId: "foreign",
    }).success,
    false,
  );
  assert.equal(
    rejectInvoiceReviewSchema.safeParse({ revision: 3, reason: "  " }).success,
    false,
  );
});

test("client starts and polls an extraction without sending tenant authority", async () => {
  const previous = globalThis.fetch;
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const run = {
    id,
    draftId: id,
    runNumber: 1,
    status: "queued",
    revision: 0,
    attemptStatus: "queued",
    failureCode: null,
    engineVersion: "invoice-v1",
    model: "gpt-5.6-terra",
    schemaVersion: "invoice-proposal-v1",
    executionMode: "background",
    storeResponse: true,
    proposal: null,
    createdAt: "2026-07-23T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
  } as const;
  globalThis.fetch = (async (input, init) => {
    calls.push({ input: String(input), init });
    return Response.json(run, { status: calls.length === 1 ? 202 : 200 });
  }) as typeof fetch;
  try {
    await startInvoiceExtraction({
      id,
      status: "uploaded",
      revision: 4,
      activeRunId: null,
      createdAt: run.createdAt,
      updatedAt: run.createdAt,
      lastActivityAt: run.createdAt,
    });
    await getInvoiceExtractionRun(id);
  } finally {
    globalThis.fetch = previous;
  }
  assert.equal(calls[0].input, `/api/invoice-drafts/${id}/extraction-runs`);
  assert.equal(calls[0].init?.body, JSON.stringify({ revision: 4 }));
  assert.equal(calls[1].input, `/api/invoice-extraction-runs/${id}`);
});
