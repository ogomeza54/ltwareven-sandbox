import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Clock3,
  FileText,
  Image as ImageIcon,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/hooks/use-company";
import {
  analyzeInvoiceFile,
  type PendingInvoiceCapture,
  replacePendingCapture,
} from "./capture-quality";
import { InvoiceCapturePreview } from "./invoice-capture-preview";
import {
  getInvoiceExtractionRun,
  privateInvoiceAssetUrl,
  startInvoiceExtraction,
} from "./invoice-source-api";
import type { InvoiceExtractionRunDto } from "@shared/invoice-extraction/contracts";
import { useInvoiceSources } from "./use-invoice-sources";
import { InvoiceReviewWorkspace } from "./invoice-review-workspace";
import {
  formatExtractionSeconds,
  invoiceExtractionTiming,
} from "./extraction-timing";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1_048_576).toFixed(1)} MiB`;
}

interface InvoiceSourceUploadProps {
  open: boolean;
  onEnterManual: () => void;
  onBusyChange?: (busy: boolean) => void;
}

export function InvoiceSourceUpload({
  open,
  onEnterManual,
  onBusyChange,
}: InvoiceSourceUploadProps) {
  const { companyId } = useCompany();
  const {
    draft,
    assets,
    uploadingNames,
    status,
    error,
    loading,
    mutating,
    busy,
    upload,
    remove,
    discard,
    move,
    refresh,
  } = useInvoiceSources(open);
  const [extraction, setExtraction] = useState<InvoiceExtractionRunDto | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [startingExtraction, setStartingExtraction] = useState(false);
  const [timingClock, setTimingClock] = useState(() => Date.now());
  const [pending, setPendingState] = useState<PendingInvoiceCapture | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [replacementAsset, setReplacementAsset] = useState<
    (typeof assets)[number] | null
  >(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingInvoiceCapture | null>(null);
  const displayedDraftId = useRef<string | null>(null);
  const totalPages = assets.reduce(
    (sum, asset) => sum + (asset.pageCount ?? 0),
    0,
  );
  const atLimit = totalPages >= 10;
  const extractionBusy =
    startingExtraction ||
    extraction?.status === "queued" ||
    extraction?.status === "processing";
  const extractionTiming = extraction
    ? invoiceExtractionTiming(extraction, timingClock)
    : null;
  const blocked = (atLimit && !replacementAsset) || busy || extractionBusy;
  const sourceReviewLocked = draft?.status === "needs_review";

  const setPending = (next: PendingInvoiceCapture | null): void => {
    pendingRef.current = replacePendingCapture(pendingRef.current, next);
    setPendingState(next);
  };

  useEffect(
    () => () => {
      replacePendingCapture(pendingRef.current, null);
      pendingRef.current = null;
    },
    [],
  );

  useEffect(() => {
    onBusyChange?.(mutating);
    return () => onBusyChange?.(false);
  }, [mutating, onBusyChange]);

  useEffect(() => {
    setReplacementAsset(null);
    setUploadFailed(false);
    setLocalError(null);
    setPending(null);
    setExtraction(null);
    setExtractionError(null);
  }, [companyId]);

  useEffect(() => {
    if (!draft?.id || displayedDraftId.current === draft.id) return;
    const replacedPreviousDraft = displayedDraftId.current !== null;
    displayedDraftId.current = draft.id;
    if (!replacedPreviousDraft) return;
    setReplacementAsset(null);
    setUploadFailed(false);
    setLocalError(null);
    setExtraction(null);
    setExtractionError(null);
  }, [draft?.id]);

  useEffect(() => {
    if (!draft?.activeRunId || extraction?.id === draft.activeRunId) return;
    void getInvoiceExtractionRun(draft.activeRunId)
      .then(setExtraction)
      .catch(() => setExtractionError("The extraction status could not be restored."));
  }, [draft?.activeRunId, extraction?.id]);

  useEffect(() => {
    if (!open || !extraction || !["queued", "processing"].includes(extraction.status)) {
      return;
    }
    const poll = () => {
      void getInvoiceExtractionRun(extraction.id)
        .then(async (next) => {
          setExtraction(next);
          if (["completed", "failed", "canceled"].includes(next.status)) {
            await refresh().catch(() => null);
          }
        })
        .catch(() => setExtractionError("Extraction status is temporarily unavailable."));
    };
    poll();
    const timer = window.setInterval(poll, 1_000);
    return () => window.clearInterval(timer);
  }, [extraction?.id, extraction?.status, open]);

  useEffect(() => {
    if (!extraction || !["queued", "processing"].includes(extraction.status)) return;
    setTimingClock(Date.now());
    const timer = window.setInterval(() => setTimingClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [extraction?.id, extraction?.status]);

  const analyze = async (): Promise<void> => {
    if (!draft || assets.length === 0) return;
    setStartingExtraction(true);
    setExtractionError(null);
    try {
      setExtraction(await startInvoiceExtraction(draft));
      await refresh().catch(() => null);
    } catch (caught) {
      setExtractionError(
        caught instanceof Error ? caught.message : "Invoice analysis could not be started.",
      );
    } finally {
      setStartingExtraction(false);
    }
  };

  const selectFile = async (
    file: File | undefined,
    source: "camera" | "file",
  ): Promise<void> => {
    if (!file) return;
    setLocalError(null);
    setUploadFailed(false);
    if (file.size > 10_485_760) {
      setLocalError("Each invoice file must be 10 MiB or smaller.");
      return;
    }
    if (atLimit && !replacementAsset) {
      setLocalError("The saved document already has the maximum of 10 pages.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const next: PendingInvoiceCapture = {
      file,
      objectUrl,
      source,
      quality: { status: "checking" },
    };
    setPending(next);
    requestAnimationFrame(() => preview.current?.focus());
    const quality = await analyzeInvoiceFile(file);
    if (pendingRef.current?.objectUrl !== objectUrl) return;
    const checked = { ...next, quality };
    pendingRef.current = checked;
    setPendingState(checked);
  };

  const useDocument = async (): Promise<void> => {
    const selected = pendingRef.current;
    if (!selected) return;
    const savedAsset = await upload(
      selected.file,
      replacementAsset ?? undefined,
    );
    setUploadFailed(!savedAsset);
    if (!savedAsset) return;
    setReplacementAsset(null);
    setLocalError(null);
    setPending(null);
  };

  const retakeSaved = (asset: (typeof assets)[number]): void => {
    setReplacementAsset(asset);
    const isImage = asset.detectedType?.startsWith("image/");
    requestAnimationFrame(() => {
      (isImage ? cameraInput : fileInput).current?.click();
    });
  };

  const removeOrDiscard = async (
    asset: (typeof assets)[number],
  ): Promise<void> => {
    if (!sourceReviewLocked) {
      await remove(asset);
      return;
    }
    if (
      !window.confirm(
        "Discard this invoice and start over? The extracted review will be closed and no stock will be changed.",
      )
    ) {
      return;
    }
    if (!(await discard())) return;
    displayedDraftId.current = null;
    setReplacementAsset(null);
    setUploadFailed(false);
    setLocalError(null);
    setPending(null);
    setExtraction(null);
    setExtractionError(null);
  };

  return (
    <section className="space-y-3" aria-labelledby="invoice-source-label">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Label
          id="invoice-source-label"
          className="flex items-center gap-1.5 font-medium text-foreground"
        >
          <Camera className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Invoice Photo
        </Label>
        <Button
          type="button"
          variant="link"
          className="min-h-12 px-2 text-amber-500"
          onClick={onEnterManual}
        >
          Enter manually
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Optional. JPEG, PNG, HEIC/HEIF or PDF; 10 MiB per file; up to 10
        ordered pages/photos. The original is uploaded only after your review.
      </p>
      {assets.length > 0 ? (
        <div className="rounded border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">AI-assisted invoice reading</p>
              <p className="text-xs text-muted-foreground">
                The result is always reviewed before any stock update.
              </p>
            </div>
            <Button
              type="button"
              className="min-h-12"
              disabled={busy || extractionBusy || draft?.status === "needs_review"}
              onClick={() => void analyze()}
            >
              <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              {extractionBusy
                ? "Analyzing…"
                : extraction?.status === "failed"
                  ? "Retry analysis"
                  : "Analyze invoice"}
            </Button>
          </div>
          {extraction ? (
            <div className="mt-3 space-y-2" role="status" aria-label="Invoice analysis progress">
              <p className="text-sm">
                Status: <span className="font-medium">{extraction.status}</span>
                {extraction.status === "completed" && extraction.proposal
                  ? ` · ${extraction.proposal.lines.length} line items proposed for review`
                  : ""}
                {extraction.status === "failed"
                  ? " · No inventory was changed. You can retry or enter the invoice manually."
                  : ""}
              </p>
              {extractionTiming ? (
                <dl className="grid grid-cols-3 gap-2 rounded border border-border bg-background/50 p-2 text-xs">
                  <div>
                    <dt className="flex items-center gap-1 text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      Queue
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-medium">
                      {formatExtractionSeconds(extractionTiming.queueMs)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">AI processing</dt>
                    <dd className="mt-1 font-mono text-sm font-medium">
                      {formatExtractionSeconds(extractionTiming.processingMs)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Total</dt>
                    <dd className="mt-1 font-mono text-sm font-medium">
                      {formatExtractionSeconds(extractionTiming.totalMs)}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>
          ) : null}
          {extractionError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {extractionError}
            </p>
          ) : null}
        </div>
      ) : null}
      {draft && ["needs_review", "rejected"].includes(draft.status) ? (
        <InvoiceReviewWorkspace
          key={draft.id}
          draftId={draft.id}
          readOnly={draft.status === "rejected"}
          onDraftChanged={refresh}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <label
          className={`relative flex min-h-12 cursor-pointer items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-ring ${
            blocked ? "pointer-events-none opacity-50" : "hover:bg-accent"
          }`}
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          Take photo
          <input
            ref={cameraInput}
            type="file"
            disabled={blocked}
            accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif"
            capture="environment"
            aria-label="Take invoice photo with rear camera"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void selectFile(file, "camera");
            }}
          />
        </label>
        <label
          className={`relative flex min-h-12 cursor-pointer items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-ring ${
            blocked ? "pointer-events-none opacity-50" : "hover:bg-accent"
          }`}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Choose file
          <input
            ref={fileInput}
            type="file"
            disabled={blocked}
            accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif,application/pdf"
            aria-label="Choose invoice image or PDF"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void selectFile(file, "file");
            }}
          />
        </label>
      </div>

      {pending ? (
        <InvoiceCapturePreview
          ref={preview}
          capture={pending}
          uploading={uploadingNames.length > 0}
          retrying={uploadFailed}
          onRetake={() =>
            (pending.source === "camera" ? cameraInput : fileInput).current?.click()
          }
          onRemove={() => {
            setUploadFailed(false);
            setReplacementAsset(null);
            setPending(null);
            (pending.source === "camera" ? cameraInput : fileInput).current?.focus();
          }}
          onUse={() => void useDocument()}
        />
      ) : null}
      {replacementAsset ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-sm text-muted-foreground"
        >
          <p>
            The saved page {replacementAsset.position ?? ""} remains available
            until its replacement is uploaded successfully.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={busy}
            onClick={() => {
              setReplacementAsset(null);
            }}
          >
            Cancel replacement
          </Button>
        </div>
      ) : null}

      <div
        className="space-y-2"
        aria-live="polite"
        aria-busy={uploadingNames.length > 0}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Restoring saved invoice sources…
          </p>
        ) : null}
        {assets.map((asset, index) => {
          const isImage = asset.detectedType?.startsWith("image/");
          return (
            <article
              key={asset.id}
              className="grid gap-3 rounded border border-border p-3 text-sm sm:grid-cols-[5rem_minmax(0,1fr)_auto]"
              aria-label={`Saved page ${index + 1}: ${asset.displayName}`}
            >
              <div className="flex h-20 items-center justify-center overflow-hidden rounded bg-muted">
                {asset.state === "Saved" && isImage && draft ? (
                  <img
                    src={privateInvoiceAssetUrl(draft.id, asset.id)}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                ) : isImage ? (
                  <ImageIcon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <FileText className="h-7 w-7 text-amber-500" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="break-words text-foreground">{asset.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {asset.detectedType ?? "Validating type"} ·{" "}
                  {asset.byteSize
                    ? formatBytes(asset.byteSize)
                    : "Validating size"}{" "}
                  · {asset.pageCount ?? "Validating"}{" "}
                  {asset.pageCount === 1 ? "page" : "pages"} · position{" "}
                  {asset.position ?? index + 1} of {assets.length} · {asset.state}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="min-h-12 min-w-12"
                  disabled={busy || sourceReviewLocked || index === 0}
                  onClick={() => void move(asset, -1)}
                  aria-label={`Move saved page ${index + 1} earlier`}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="min-h-12 min-w-12"
                  disabled={
                    busy || sourceReviewLocked || index === assets.length - 1
                  }
                  onClick={() => void move(asset, 1)}
                  aria-label={`Move saved page ${index + 1} later`}
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                {asset.state === "Saved" ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-12"
                      disabled={busy || sourceReviewLocked}
                      onClick={() => retakeSaved(asset)}
                      aria-label={`Retake saved page ${index + 1}`}
                    >
                      Retake
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="min-h-12 min-w-12"
                      disabled={busy}
                      onClick={() => void removeOrDiscard(asset)}
                      aria-label={
                        sourceReviewLocked
                          ? "Discard invoice and start over"
                          : `Remove saved page ${index + 1}`
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
        {uploadingNames.map((name, index) => (
          <div
            key={`${name}-${index}`}
            className="rounded border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
          >
            {name} · Uploading
          </div>
        ))}
        {status ? <p role="status" className="text-sm">{status}</p> : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {totalPages} of 10 pages saved. Saved pages resume from private storage;
        a selected local file is available only in this tab until upload succeeds.
      </p>
      {localError || error ? (
        <p role="alert" className="text-sm text-destructive">
          {localError ?? error}
        </p>
      ) : null}
    </section>
  );
}
