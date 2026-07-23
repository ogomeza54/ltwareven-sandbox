import assert from "node:assert/strict";
import test from "node:test";
import type {
  InvoiceDraftDto,
  InvoicePublicAssetDto,
} from "@shared/invoice-extraction/contracts";
import {
  deleteInvoiceSource,
  InvoiceSourceApiError,
  listInvoiceDrafts,
  safeInvoiceDisplayName,
  selectResumableInvoiceDraft,
} from "../../../client/src/features/invoice-extraction/invoice-source-api";

const draft: InvoiceDraftDto = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "uploaded",
  revision: 7,
  activeRunId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastActivityAt: "2026-01-01T00:00:00.000Z",
  source: null,
};

test("client draft listing keeps credentials and restores server DTOs", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    assert.equal(input, "/api/invoice-drafts");
    assert.equal(init?.credentials, "include");
    return Response.json([draft]);
  }) as typeof fetch;
  try {
    assert.deepEqual(await listInvoiceDrafts(), [draft]);
  } finally {
    globalThis.fetch = previous;
  }
});

test("client deletion sends CAS and surfaces stable server errors", async () => {
  const previous = globalThis.fetch;
  const asset = {
    id: "00000000-0000-4000-8000-000000000002",
  } as InvoicePublicAssetDto;
  globalThis.fetch = (async (input, init) => {
    assert.equal(
      input,
      `/api/invoice-drafts/${draft.id}/assets/${asset.id}`,
    );
    assert.equal(init?.method, "DELETE");
    assert.equal((init?.headers as Record<string, string>)["If-Match"], '"7"');
    return Response.json(
      { code: "INVOICE_DRAFT_REVISION_CONFLICT", message: "Reload the draft." },
      { status: 409 },
    );
  }) as typeof fetch;
  try {
    await assert.rejects(
      deleteInvoiceSource(draft, asset),
      (error) =>
        error instanceof InvoiceSourceApiError &&
        error.code === "INVOICE_DRAFT_REVISION_CONFLICT" &&
        error.message === "Reload the draft.",
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("client resume prefers a saved source over a newer empty draft", () => {
  const empty = { ...draft, id: "00000000-0000-4000-8000-000000000003", source: null };
  const saved = {
    ...draft,
    source: {
      totalPages: 1,
      assets: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          displayName: "invoice.png",
          detectedType: "image/png",
          byteSize: 8,
          pageCount: 1,
          position: 1,
          state: "Saved",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
  } satisfies InvoiceDraftDto;
  assert.equal(selectResumableInvoiceDraft([empty, saved])?.id, saved.id);
});

test("client upload announcements remove paths, controls and bidi overrides", () => {
  assert.equal(
    safeInvoiceDisplayName("../vendor/\u202eexe.png\u0000"),
    "exe.png",
  );
});
