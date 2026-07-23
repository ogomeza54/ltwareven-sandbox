import assert from "node:assert/strict";
import test from "node:test";
import type {
  InvoiceDraftDto,
  InvoicePublicAssetDto,
} from "@shared/invoice-extraction/contracts";
import {
  deleteInvoiceSource,
  invoiceFileChecksum,
  InvoiceSourceApiError,
  listInvoiceDrafts,
  movedInvoiceAssetIds,
  privateInvoiceAssetUrl,
  reorderInvoiceSources,
  safeInvoiceDisplayName,
  selectResumableInvoiceDraft,
  SerializedInvoiceMutationQueue,
  uploadInvoiceSource,
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

test("client upload fingerprint and replacement header identify lost responses safely", async () => {
  const previous = globalThis.fetch;
  const file = new File([new Uint8Array([1, 2, 3])], "replacement.png", {
    type: "image/png",
  });
  assert.equal(
    await invoiceFileChecksum(file),
    "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
  );
  globalThis.fetch = (async (input, init) => {
    assert.equal(input, `/api/invoice-drafts/${draft.id}/assets`);
    assert.equal(init?.method, "POST");
    assert.equal(
      (init?.headers as Record<string, string>)["X-Replaces-Invoice-Asset"],
      "00000000-0000-4000-8000-000000000002",
    );
    return Response.json(draft, { status: 202 });
  }) as typeof fetch;
  try {
    await uploadInvoiceSource(
      draft,
      file,
      "00000000-0000-4000-8000-000000000002",
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("client reorder sends a revisioned JSON mutation and proxy stays same-origin", async () => {
  const previous = globalThis.fetch;
  const assets = [
    { id: "00000000-0000-4000-8000-000000000002", position: 1 },
    { id: "00000000-0000-4000-8000-000000000003", position: 2 },
  ] as InvoicePublicAssetDto[];
  const ids = movedInvoiceAssetIds(assets, assets[1].id, -1);
  assert.deepEqual(ids, [assets[1].id, assets[0].id]);
  globalThis.fetch = (async (input, init) => {
    assert.equal(input, `/api/invoice-drafts/${draft.id}/assets/order`);
    assert.equal(init?.method, "PATCH");
    assert.equal((init?.headers as Record<string, string>)["If-Match"], '"7"');
    assert.equal(init?.body, JSON.stringify({ assetIds: ids }));
    return Response.json(draft);
  }) as typeof fetch;
  try {
    assert.deepEqual(await reorderInvoiceSources(draft, ids ?? []), draft);
  } finally {
    globalThis.fetch = previous;
  }
  assert.equal(
    privateInvoiceAssetUrl(draft.id, assets[0].id),
    `/api/invoice-drafts/${draft.id}/assets/${assets[0].id}`,
  );
  assert.equal(movedInvoiceAssetIds(assets, assets[0].id, -1), null);
});

test("client mutation queue never overlaps revisioned operations", async () => {
  const queue = new SerializedInvoiceMutationQueue();
  const events: string[] = [];
  let releaseFirst: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const first = queue.run(async () => {
    events.push("first:start");
    await gate;
    events.push("first:end");
  });
  const second = queue.run(async () => {
    events.push("second:start");
    events.push("second:end");
  });
  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    "first:start",
    "first:end",
    "second:start",
    "second:end",
  ]);
});
