import type {
  InvoiceDraftDto,
  InvoiceExtractionRunDto,
  InvoiceFinalHeader,
  InvoiceHeaderField,
  InvoiceConfirmationIntentDto,
  InvoicePartCandidate,
  InvoicePublicAssetDto,
  InvoiceReviewWorkspaceDto,
} from "@shared/invoice-extraction/contracts";

export class InvoiceSourceApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "InvoiceSourceApiError";
  }
}

export class SerializedInvoiceMutationQueue {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export function movedInvoiceAssetIds(
  assets: readonly InvoicePublicAssetDto[],
  assetId: string,
  direction: -1 | 1,
): string[] | null {
  const ordered = [...assets].sort(
    (left, right) => (left.position ?? 0) - (right.position ?? 0),
  );
  const index = ordered.findIndex((asset) => asset.id === assetId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return null;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered.map((asset) => asset.id);
}

export function safeInvoiceDisplayName(value: string): string {
  const leaf = value.replaceAll("\\", "/").split("/").pop() ?? "";
  const safe = leaf
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .slice(0, 120);
  return safe || "invoice-source";
}

export async function invoiceFileChecksum(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Browser checksum support is unavailable.");
  }
  const bytes = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | { code?: string; message?: string }
    | T
    | null;
  if (!response.ok) {
    const error = body as { code?: string; message?: string } | null;
    throw new InvoiceSourceApiError(
      error?.message ?? "The invoice source operation failed.",
      error?.code ?? "INVOICE_SOURCE_ERROR",
    );
  }
  return body as T;
}

export async function listInvoiceDrafts(): Promise<InvoiceDraftDto[]> {
  return responseJson(
    await fetch("/api/invoice-drafts", { credentials: "include" }),
  );
}

export function selectResumableInvoiceDraft(
  drafts: readonly InvoiceDraftDto[],
): InvoiceDraftDto | null {
  const candidates = drafts.filter(
    (candidate) =>
      ["draft", "uploaded", "needs_review"].includes(candidate.status),
  );
  return (
    candidates.find((candidate) => candidate.source?.assets.length) ??
    candidates[0] ??
    null
  );
}

export function invoiceDraftAcceptsSourceUpload(
  draft: InvoiceDraftDto | null,
): draft is InvoiceDraftDto {
  return (
    draft !== null &&
    ["draft", "uploaded"].includes(draft.status) &&
    draft.activeRunId === null
  );
}

export async function startInvoiceExtraction(
  draft: InvoiceDraftDto,
): Promise<InvoiceExtractionRunDto> {
  return responseJson(
    await fetch(`/api/invoice-drafts/${draft.id}/extraction-runs`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: draft.revision }),
    }),
  );
}

export async function getInvoiceExtractionRun(
  runId: string,
): Promise<InvoiceExtractionRunDto> {
  return responseJson(
    await fetch(`/api/invoice-extraction-runs/${encodeURIComponent(runId)}`, {
      credentials: "include",
    }),
  );
}

export async function getInvoiceReview(
  draftId: string,
): Promise<InvoiceReviewWorkspaceDto> {
  return responseJson(
    await fetch(`/api/invoice-drafts/${encodeURIComponent(draftId)}/review`, {
      credentials: "include",
    }),
  );
}

export async function updateInvoiceHeaderReview(
  workspace: InvoiceReviewWorkspaceDto,
  header: InvoiceFinalHeader,
  reviewedFields: readonly InvoiceHeaderField[],
  decision: "draft" | "approved" = "draft",
): Promise<InvoiceReviewWorkspaceDto> {
  return responseJson(
    await fetch(
      `/api/invoice-drafts/${encodeURIComponent(workspace.draftId)}/review`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: workspace.draftRevision,
          header,
          reviewedFields,
          decision,
        }),
      },
    ),
  );
}

export async function rejectInvoiceReview(
  workspace: InvoiceReviewWorkspaceDto,
  reason: string,
): Promise<InvoiceReviewWorkspaceDto> {
  return responseJson(
    await fetch(
      `/api/invoice-drafts/${encodeURIComponent(workspace.draftId)}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: workspace.draftRevision,
          reason,
        }),
      },
    ),
  );
}

export async function updateInvoiceLinesReview(
  workspace: InvoiceReviewWorkspaceDto,
  lines: Array<{
    id: string | null;
    description: string | null;
    vendorPartNumber: string | null;
    quantity: string | null;
    unitCost: string | null;
    classification: "inventory" | "consumable" | "unknown";
  }>,
  decision: "draft" | "approved" = "draft",
): Promise<InvoiceReviewWorkspaceDto> {
  return responseJson(
    await fetch(
      `/api/invoice-drafts/${encodeURIComponent(workspace.draftId)}/review/lines`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: workspace.draftRevision,
          lines,
          decision,
        }),
      },
    ),
  );
}

export async function getInvoicePartCandidates(
  workspace: InvoiceReviewWorkspaceDto,
  lineId: string,
  query = "",
): Promise<InvoicePartCandidate[]> {
  const parameters = query.trim()
    ? `?q=${encodeURIComponent(query.trim())}`
    : "";
  return responseJson(
    await fetch(
      `/api/invoice-drafts/${encodeURIComponent(workspace.draftId)}/review/lines/${encodeURIComponent(lineId)}/candidates${parameters}`,
      { credentials: "include" },
    ),
  );
}

export async function updateInvoiceLineMatches(
  workspace: InvoiceReviewWorkspaceDto,
  matches: Array<
    | {
        lineId: string;
        decision: "unresolved";
        selectedPartId: null;
        proposedNewPart: null;
      }
    | {
        lineId: string;
        decision: "existing";
        selectedPartId: string;
        proposedNewPart: null;
      }
    | {
        lineId: string;
        decision: "new";
        selectedPartId: null;
        proposedNewPart: {
          name: string;
          partNumber: string;
          itemType: "inventory" | "consumable";
          category: string | null;
          groupId: string | null;
          subgroupId: string | null;
        };
      }
  >,
): Promise<InvoiceReviewWorkspaceDto> {
  return responseJson(
    await fetch(
      `/api/invoice-drafts/${encodeURIComponent(workspace.draftId)}/review/matches`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: workspace.draftRevision,
          matches,
        }),
      },
    ),
  );
}

export async function createInvoiceConfirmationIntent(
  workspace: InvoiceReviewWorkspaceDto,
  idempotencyKey: string,
): Promise<InvoiceConfirmationIntentDto> {
  return responseJson(
    await fetch(
      `/api/invoice-drafts/${encodeURIComponent(workspace.draftId)}/confirmation-intents`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ revision: workspace.draftRevision }),
      },
    ),
  );
}

export async function overrideInvoiceDuplicate(
  intent: InvoiceConfirmationIntentDto,
  reason: string,
): Promise<InvoiceConfirmationIntentDto> {
  return responseJson(
    await fetch(
      `/api/invoice-drafts/${encodeURIComponent(intent.draftId)}/confirmation-intents/${encodeURIComponent(intent.id)}/override`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      },
    ),
  );
}

export async function confirmInvoiceIntent(
  intent: InvoiceConfirmationIntentDto,
): Promise<InvoiceConfirmationIntentDto> {
  return responseJson(
    await fetch(
      `/api/invoice-drafts/${encodeURIComponent(intent.draftId)}/confirmation-intents/${encodeURIComponent(intent.id)}/confirm`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": intent.idempotencyKey,
        },
        body: "{}",
      },
    ),
  );
}

export async function createInvoiceDraft(): Promise<InvoiceDraftDto> {
  return responseJson(
    await fetch("/api/invoice-drafts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );
}

export async function getInvoiceDraft(draftId: string): Promise<InvoiceDraftDto> {
  return responseJson(
    await fetch(`/api/invoice-drafts/${draftId}`, { credentials: "include" }),
  );
}

export async function uploadInvoiceSource(
  draft: InvoiceDraftDto,
  file: File,
  replacementAssetId?: string,
): Promise<InvoiceDraftDto> {
  const body = new FormData();
  body.append("file", file);
  return responseJson(
    await fetch(`/api/invoice-drafts/${draft.id}/assets`, {
      method: "POST",
      credentials: "include",
      headers: {
        "If-Match": `"${draft.revision}"`,
        ...(replacementAssetId
          ? { "X-Replaces-Invoice-Asset": replacementAssetId }
          : {}),
      },
      body,
    }),
  );
}

export async function deleteInvoiceSource(
  draft: InvoiceDraftDto,
  asset: InvoicePublicAssetDto,
): Promise<InvoiceDraftDto> {
  return responseJson(
    await fetch(`/api/invoice-drafts/${draft.id}/assets/${asset.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "If-Match": `"${draft.revision}"` },
    }),
  );
}

export async function cancelInvoiceDraft(
  draft: InvoiceDraftDto,
): Promise<InvoiceDraftDto> {
  return responseJson(
    await fetch(`/api/invoice-drafts/${draft.id}/cancel`, {
      method: "POST",
      credentials: "include",
      headers: { "If-Match": `"${draft.revision}"` },
    }),
  );
}

export async function reorderInvoiceSources(
  draft: InvoiceDraftDto,
  assetIds: readonly string[],
): Promise<InvoiceDraftDto> {
  return responseJson(
    await fetch(`/api/invoice-drafts/${draft.id}/assets/order`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "If-Match": `"${draft.revision}"`,
      },
      body: JSON.stringify({ assetIds }),
    }),
  );
}

export function privateInvoiceAssetUrl(
  draftId: string,
  assetId: string,
): string {
  return `/api/invoice-drafts/${encodeURIComponent(draftId)}/assets/${encodeURIComponent(assetId)}`;
}
