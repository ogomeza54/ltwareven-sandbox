import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  FileText,
  Image as ImageIcon,
  Trash2,
  Upload,
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
import { privateInvoiceAssetUrl } from "./invoice-source-api";
import { useInvoiceSources } from "./use-invoice-sources";

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
    move,
  } = useInvoiceSources(open);
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
  const totalPages = assets.reduce(
    (sum, asset) => sum + (asset.pageCount ?? 0),
    0,
  );
  const atLimit = totalPages >= 10;
  const blocked = (atLimit && !replacementAsset) || busy;

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
  }, [companyId]);

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
                  disabled={busy || index === 0}
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
                  disabled={busy || index === assets.length - 1}
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
                      disabled={busy}
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
                      onClick={() => void remove(asset)}
                      aria-label={`Remove saved page ${index + 1}`}
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
