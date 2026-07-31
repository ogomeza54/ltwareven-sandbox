import type { InvoiceExtractionRunDto } from "@shared/invoice-extraction/contracts";

export interface InvoiceExtractionTiming {
  queueMs: number;
  processingMs: number | null;
  totalMs: number;
}

export interface InvoiceExtractionProgress {
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  percent: number;
}

const EXPECTED_EXTRACTION_MS = 15_000;

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function invoiceExtractionTiming(
  run: Pick<
    InvoiceExtractionRunDto,
    "createdAt" | "startedAt" | "completedAt"
  >,
  now = Date.now(),
): InvoiceExtractionTiming {
  const createdAt = timestamp(run.createdAt) ?? now;
  const startedAt = timestamp(run.startedAt);
  const completedAt = timestamp(run.completedAt);
  const end = Math.max(createdAt, completedAt ?? now);
  const queueEnd = Math.max(createdAt, Math.min(startedAt ?? end, end));

  return {
    queueMs: queueEnd - createdAt,
    processingMs: startedAt === null ? null : end - queueEnd,
    totalMs: end - createdAt,
  };
}

export function formatExtractionSeconds(milliseconds: number | null): string {
  if (milliseconds === null) return "Not started";
  if (milliseconds < 100) return "<0.1 s";
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

export function invoiceExtractionProgress(
  status: InvoiceExtractionRunDto["status"],
  timing: InvoiceExtractionTiming,
): InvoiceExtractionProgress {
  const elapsedMs = timing.processingMs ?? timing.totalMs;
  if (status === "completed") {
    return { elapsedMs, estimatedRemainingMs: 0, percent: 100 };
  }
  if (status === "failed" || status === "canceled") {
    return { elapsedMs, estimatedRemainingMs: null, percent: 100 };
  }

  const ratio = elapsedMs / EXPECTED_EXTRACTION_MS;
  return {
    elapsedMs,
    estimatedRemainingMs:
      elapsedMs < EXPECTED_EXTRACTION_MS
        ? EXPECTED_EXTRACTION_MS - elapsedMs
        : null,
    percent: Math.min(95, Math.max(8, Math.round(ratio * 90))),
  };
}
