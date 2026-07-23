import { Camera, FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useInvoiceSources } from "./use-invoice-sources";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1_048_576).toFixed(1)} MiB`;
}

export function InvoiceSourceUpload({ open }: { open: boolean }) {
  const { assets, uploadingNames, error, loading, busy, upload, remove } =
    useInvoiceSources(open);
  const totalPages = assets.reduce(
    (sum, asset) => sum + (asset.pageCount ?? 0),
    0,
  );
  const atLimit = totalPages >= 10;
  const blocked = atLimit || busy;

  return (
    <section className="space-y-2" aria-labelledby="invoice-source-label">
      <Label
        id="invoice-source-label"
        className="text-foreground font-medium flex items-center gap-1.5"
      >
        <Camera className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Invoice Photo
        <span className="text-muted-foreground font-normal text-xs">
          (optional — JPEG, PNG, HEIC/HEIF or PDF; 10 MiB each; 10 pages total)
        </span>
      </Label>

      <div className="space-y-2" aria-live="polite" aria-busy={uploadingNames.length > 0}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Restoring saved invoice sources…</p>
        ) : null}
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="flex items-center gap-3 rounded border border-border px-3 py-2 text-sm"
          >
            <FileText className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-foreground">{asset.displayName}</p>
              <p className="text-xs text-muted-foreground">
                {asset.detectedType ?? "Validating type"} ·{" "}
                {asset.byteSize ? formatBytes(asset.byteSize) : "Validating size"} ·{" "}
                {asset.pageCount ?? "Validating"}{" "}
                {asset.pageCount === 1 ? "page" : "pages"}
                {asset.position ? ` · position ${asset.position}` : ""} ·{" "}
                {asset.state}
              </p>
            </div>
            {asset.state === "Saved" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                disabled={busy}
                onClick={() => void remove(asset)}
                aria-label={`Remove ${asset.displayName}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ))}
        {uploadingNames.map((name, index) => (
          <div
            key={`${name}-${index}`}
            className="rounded border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
          >
            {name} · Uploading
          </div>
        ))}
      </div>

      <label
        className={`flex min-h-11 w-fit items-center gap-2 rounded border border-dashed border-border px-3 py-2 text-sm transition-colors ${
          blocked
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer text-muted-foreground hover:border-amber-500/60 hover:text-foreground"
        }`}
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        {atLimit
          ? "10-page limit reached"
          : busy
            ? "Invoice sources are being restored or saved"
            : "Choose invoice photos or PDF"}
        <input
          type="file"
          multiple
          disabled={blocked}
          accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif,application/pdf"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length) void upload(files);
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {totalPages} of 10 pages saved. Files are validated before private storage.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
