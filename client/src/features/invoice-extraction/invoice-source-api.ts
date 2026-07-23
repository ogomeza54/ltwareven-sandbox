import type {
  InvoiceDraftDto,
  InvoicePublicAssetDto,
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
      ["draft", "uploaded"].includes(candidate.status) &&
      !candidate.activeRunId,
  );
  return (
    candidates.find((candidate) => candidate.source?.assets.length) ??
    candidates[0] ??
    null
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
