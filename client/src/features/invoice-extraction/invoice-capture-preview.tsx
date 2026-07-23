import { forwardRef } from "react";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingInvoiceCapture } from "./capture-quality";

function formatBytes(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : `${(bytes / 1_048_576).toFixed(1)} MiB`;
}

interface InvoiceCapturePreviewProps {
  capture: PendingInvoiceCapture;
  uploading: boolean;
  retrying: boolean;
  onRetake: () => void;
  onRemove: () => void;
  onUse: () => void;
}

export const InvoiceCapturePreview = forwardRef<
  HTMLDivElement,
  InvoiceCapturePreviewProps
>(function InvoiceCapturePreview(
  { capture, uploading, retrying, onRetake, onRemove, onUse },
  ref,
) {
  const quality = capture.quality;
  const warnings = quality.status === "available" ? quality.warnings : [];
  const requiresReview =
    quality.status === "unavailable" || warnings.length > 0;
  const previewable =
    quality.status === "available" ||
    ["image/jpeg", "image/png"].includes(capture.file.type);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="space-y-3 rounded-lg border border-border p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Selected invoice document review"
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
        <div className="flex min-h-32 items-center justify-center overflow-hidden rounded bg-muted">
          {previewable ? (
            <img
              src={capture.objectUrl}
              alt="Local preview of selected invoice"
              className="max-h-52 w-full object-contain"
            />
          ) : (
            <FileText className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="break-words font-medium text-foreground">
            {capture.file.name || "invoice-source"}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatBytes(capture.file.size)}
            {quality.status === "available"
              ? ` · ${quality.width} × ${quality.height} pixels`
              : ""}
          </p>
          {quality.status === "checking" ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking image quality…
            </p>
          ) : quality.status === "unavailable" ? (
            <div role="status" className="flex gap-2 text-sm text-amber-500">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{quality.reason}</p>
            </div>
          ) : warnings.length ? (
            <div role="status" aria-label="Image quality warnings" className="space-y-2">
              {warnings.map((item) => (
                <div key={item.code} className="flex gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                  <p>
                    <span className="font-medium">{item.message}</span>{" "}
                    {item.action}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p role="status" className="flex gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
              No obvious image-quality problems were found.
            </p>
          )}
        </div>
      </div>

      <fieldset className="rounded border border-border p-3 text-sm">
        <legend className="px-1 font-medium">Complete review before upload</legend>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>All invoice edges and text are visible.</li>
          <li>The document is upright and readable.</li>
          <li>Every invoice page has been selected.</li>
        </ul>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-12" disabled={uploading} onClick={onRetake}>
          Retake
        </Button>
        <Button type="button" variant="ghost" className="min-h-12" disabled={uploading} onClick={onRemove}>
          Remove
        </Button>
        <Button
          type="button"
          className="min-h-12 bg-amber-500 text-white hover:bg-amber-600"
          disabled={uploading || quality.status === "checking"}
          onClick={onUse}
        >
          {uploading
            ? "Uploading…"
            : retrying
              ? "Retry upload"
            : requiresReview
              ? "Use document anyway"
              : "Use document"}
        </Button>
      </div>
    </div>
  );
});
