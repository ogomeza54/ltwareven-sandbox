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
): Promise<InvoiceDraftDto> {
  const body = new FormData();
  body.append("file", file);
  return responseJson(
    await fetch(`/api/invoice-drafts/${draft.id}/assets`, {
      method: "POST",
      credentials: "include",
      headers: { "If-Match": `"${draft.revision}"` },
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
