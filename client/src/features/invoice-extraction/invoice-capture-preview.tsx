import { forwardRef, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { AlertTriangle, CheckCircle2, FileText, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingInvoiceCapture } from "./capture-quality";

interface InvoiceCapturePreviewProps {
  capture: PendingInvoiceCapture;
  uploading: boolean;
  retrying: boolean;
  onRetake: () => void;
  onRemove: () => void;
  onUse: () => void;
  onAddAnotherPage?: () => void;
  useLabel?: string;
}

function LocalPdfPreview({ file }: { file: File }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [pageCount, setPageCount] = useState<number | null>(null);

  useEffect(() => {
    let disposed = false;
    let document: PDFDocumentProxy | null = null;
    let renderTask: RenderTask | null = null;

    const render = async () => {
      setStatus("loading");
      setPageCount(null);
      try {
        const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        GlobalWorkerOptions.workerSrc = workerModule.default;
        const loadingTask = getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
          isEvalSupported: false,
          useWorkerFetch: false,
          stopAtErrors: true,
        });
        document = await loadingTask.promise;
        if (disposed) return;
        const page = await document.getPage(1);
        const natural = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 640 / natural.width);
        const viewport = page.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const target = canvas.current;
        if (!target || disposed) return;
        target.width = Math.floor(viewport.width * outputScale);
        target.height = Math.floor(viewport.height * outputScale);
        target.style.width = `${Math.floor(viewport.width)}px`;
        target.style.height = `${Math.floor(viewport.height)}px`;
        const context = target.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas rendering is unavailable");
        renderTask = page.render({
          canvas: target,
          canvasContext: context,
          viewport,
          transform:
            outputScale === 1
              ? undefined
              : [outputScale, 0, 0, outputScale, 0, 0],
        });
        await renderTask.promise;
        if (!disposed) {
          setPageCount(document.numPages);
          setStatus("ready");
        }
        page.cleanup();
      } catch {
        if (!disposed) setStatus("failed");
      }
    };

    void render();
    return () => {
      disposed = true;
      renderTask?.cancel();
      void document?.destroy();
    };
  }, [file]);

  return (
    <div className="relative flex h-full min-h-44 w-full items-center justify-center overflow-hidden bg-slate-950/40">
      {status === "loading" ? (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          Preparing preview…
        </div>
      ) : null}
      <canvas
        ref={canvas}
        role="img"
        aria-label="Preview of the first invoice page"
        className={`max-h-72 max-w-full object-contain shadow-lg ${
          status === "ready" ? "block" : "hidden"
        }`}
      />
      {status === "ready" && pageCount ? (
        <span className="absolute bottom-2 right-2 rounded bg-slate-950/85 px-2 py-1 text-xs text-slate-100">
          Page 1 of {pageCount}
        </span>
      ) : null}
      {status === "failed" ? (
        <div className="flex flex-col items-center gap-2 px-3 text-center text-sm text-muted-foreground">
          <FileText className="h-12 w-12" aria-hidden="true" />
          <span>We could not show a preview of this document.</span>
        </div>
      ) : null}
    </div>
  );
}

export const InvoiceCapturePreview = forwardRef<
  HTMLDivElement,
  InvoiceCapturePreviewProps
>(function InvoiceCapturePreview(
  {
    capture,
    uploading,
    retrying,
    onRetake,
    onRemove,
    onUse,
    onAddAnotherPage,
    useLabel,
  },
  ref,
) {
  const quality = capture.quality;
  const warnings = quality.status === "available" ? quality.warnings : [];
  const portraitRetakeRequired =
    capture.source === "camera" &&
    warnings.some((warning) => warning.code === "landscape-orientation");
  const requiresReview =
    quality.status === "unavailable" || warnings.length > 0;
  const previewable =
    quality.status === "available" ||
    ["image/jpeg", "image/png"].includes(capture.file.type);
  const isPdf =
    capture.file.type === "application/pdf" ||
    /\.pdf$/i.test(capture.file.name);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="space-y-3 rounded-lg border border-border p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Selected invoice document review"
    >
      <div
        className={`grid gap-3 ${
          isPdf
            ? "sm:grid-cols-[minmax(18rem,40%)_1fr]"
            : "sm:grid-cols-[minmax(0,12rem)_1fr]"
        }`}
      >
        <div className="flex min-h-32 items-center justify-center overflow-hidden rounded bg-muted">
          {isPdf ? (
            <LocalPdfPreview file={capture.file} />
          ) : previewable ? (
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
            {quality.status === "available" && quality.pages
              ? `${quality.pages.length} ${quality.pages.length === 1 ? "page" : "pages"} ready to review`
              : "Ready to review"}
          </p>
          {quality.status === "checking" ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking that the invoice is clear…
            </p>
          ) : quality.status === "unavailable" ? (
            <div role="status" className="flex gap-2 text-sm text-amber-500">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{quality.reason}</p>
            </div>
          ) : warnings.length ? (
            <div role="status" aria-label="Image quality warnings" className="space-y-2">
              {warnings.map((item) => (
                <div key={`${item.page ?? 0}-${item.code}`} className="flex gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                  <p>
                    {item.page ? <span className="font-medium">Page {item.page}: </span> : null}
                    <span className="font-medium">{item.message}</span>{" "}
                    {item.action}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p role="status" className="flex gap-2 text-sm text-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
              {quality.pages
                ? `${quality.pages.length} ${quality.pages.length === 1 ? "page looks" : "pages look"} clear and readable.`
                : "The invoice looks clear and readable."}
            </p>
          )}
        </div>
      </div>

      <fieldset className="rounded border border-border p-3 text-sm">
        <legend className="px-1 font-medium">Before continuing</legend>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>All invoice edges and text are visible.</li>
          <li>The document is upright and readable.</li>
          <li>Every invoice page has been selected.</li>
        </ul>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-12" disabled={uploading} onClick={onRetake}>
          {portraitRetakeRequired ? "Retake in portrait" : "Retake"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-12" disabled={uploading} onClick={onRemove}>
          Remove
        </Button>
        {portraitRetakeRequired ? (
          <p role="alert" className="flex min-h-12 items-center text-sm font-medium text-amber-400">
            A portrait photo is required for document scanning.
          </p>
        ) : (
          <>
            {onAddAnotherPage ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-12"
                disabled={uploading || quality.status === "checking"}
                onClick={onAddAnotherPage}
              >
                Scan another page
              </Button>
            ) : null}
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
                  : useLabel ?? (requiresReview ? "Continue anyway" : "Continue")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
});
