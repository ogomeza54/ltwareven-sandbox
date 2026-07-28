import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, LoaderCircle } from "lucide-react";
import type { InvoiceQualityCaseDetail } from "@shared/invoice-extraction/contracts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface InvoiceQualityDetailDialogProps {
  draftId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fieldLabel = (field: string) =>
  field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());

const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
};

const matchLabel = (decision: "accepted" | "corrected" | "added") => {
  if (decision === "accepted") return "Matched automatically";
  if (decision === "added") return "New stock item";
  return "Match changed during review";
};

export function InvoiceQualityDetailDialog({
  draftId,
  open,
  onOpenChange,
}: InvoiceQualityDetailDialogProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery<InvoiceQualityCaseDetail>({
    queryKey: [`/api/invoice-quality/${draftId}`],
    enabled: open && Boolean(draftId),
  });

  useEffect(() => {
    setSelectedAssetId(data?.assets[0]?.id ?? null);
  }, [data?.draftId]);

  const selectedAsset =
    data?.assets.find((asset) => asset.id === selectedAssetId) ?? data?.assets[0];
  const assetUrl =
    data && selectedAsset
      ? `/api/invoice-drafts/${data.draftId}/assets/${selectedAsset.id}`
      : null;
  const headerFields = data?.fields.filter((field) => field.subjectType === "header") ?? [];
  const lineGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        id: string;
        position: number;
        description: string | null;
        fields: InvoiceQualityCaseDetail["fields"];
      }
    >();
    for (const field of data?.fields ?? []) {
      if (field.subjectType !== "line" || !field.lineId || !field.linePosition) continue;
      const group = groups.get(field.lineId) ?? {
        id: field.lineId,
        position: field.linePosition,
        description: field.lineDescription,
        fields: [],
      };
      group.fields.push(field);
      groups.set(field.lineId, group);
    }
    return Array.from(groups.values()).sort((a, b) => a.position - b.position);
  }, [data?.fields]);

  const renderFields = (fields: InvoiceQualityCaseDetail["fields"]) => (
    <div className="overflow-x-auto rounded border border-slate-800">
      <table className="w-full min-w-[38rem] text-sm">
        <thead className="bg-slate-950/70 text-left text-slate-500">
          <tr>
            <th className="px-3 py-2">Field</th>
            <th className="px-3 py-2">Recognized</th>
            <th className="px-3 py-2">Final value</th>
            <th className="px-3 py-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={`${field.subjectType}-${field.lineId ?? "header"}-${field.field}`} className="border-t border-slate-800 text-slate-300">
              <td className="px-3 py-2 font-medium">{fieldLabel(field.field)}</td>
              <td className="max-w-56 break-words px-3 py-2 text-slate-400">{displayValue(field.proposal)}</td>
              <td className="max-w-56 break-words px-3 py-2">{displayValue(field.finalValue)}</td>
              <td className="px-3 py-2">
                <span className={field.result === "changed" ? "text-amber-400" : "text-emerald-400"}>
                  {field.result === "changed"
                    ? "Changed during review"
                    : field.origin === "system"
                      ? "Completed automatically"
                      : "Recognized automatically"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[calc(100vw-2rem)] max-w-7xl flex-col overflow-hidden border-slate-800 bg-slate-950 p-0 text-slate-100">
        <DialogHeader className="shrink-0 border-b border-slate-800 px-5 py-4 pr-14">
          <DialogTitle>{data?.supplier ?? "Invoice review details"}</DialogTitle>
          <DialogDescription className="text-slate-400">
            {data
              ? `Invoice ${data.invoiceNumber ?? "without number"} · ${data.invoiceDate ?? "date unavailable"} · ${data.engineVersion ?? "engine unavailable"}`
              : "Loading the document and review details…"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-400">
              <LoaderCircle className="h-5 w-5 animate-spin" /> Loading invoice details…
            </div>
          ) : error || !data ? (
            <p role="alert" className="text-red-400">Invoice details could not be loaded.</p>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(20rem,0.85fr)_minmax(0,1.4fr)]">
              <section className="space-y-4">
                <div className="grid grid-cols-2 gap-3 rounded border border-slate-800 bg-slate-900 p-4 text-sm">
                  <div><p className="text-slate-500">Automatically completed</p><p className="text-xl font-semibold text-emerald-400">{data.summary.automaticallyCompletedFields} / {data.summary.reviewedFields}</p></div>
                  <div><p className="text-slate-500">Changed during review</p><p className="text-xl font-semibold text-amber-400">{data.summary.changedFields} / {data.summary.reviewedFields}</p></div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">Original invoice</h3>
                    {assetUrl ? (
                      <a href={assetUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 text-sm text-amber-400 hover:text-amber-300">
                        Open document <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                  {data.assets.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                      {data.assets.map((asset) => (
                        <Button key={asset.id} type="button" size="sm" variant={asset.id === selectedAsset?.id ? "default" : "outline"} onClick={() => setSelectedAssetId(asset.id)}>
                          {asset.position}. {asset.displayName}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  {assetUrl && selectedAsset ? (
                    selectedAsset.detectedType.startsWith("image/") ? (
                      <img src={assetUrl} alt={`Original invoice ${selectedAsset.displayName}`} className="max-h-[64vh] w-full rounded border border-slate-800 bg-white object-contain" />
                    ) : selectedAsset.detectedType === "application/pdf" ? (
                      <iframe src={assetUrl} title={`Original invoice ${selectedAsset.displayName}`} className="h-[64vh] w-full rounded border border-slate-800 bg-white" />
                    ) : (
                      <a href={assetUrl} target="_blank" rel="noreferrer" className="flex min-h-48 flex-col items-center justify-center gap-3 rounded border border-slate-800 text-slate-400">
                        <FileText className="h-12 w-12" /> Open the original document
                      </a>
                    )
                  ) : (
                    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded border border-slate-800 text-slate-500">
                      <FileText className="h-12 w-12" /> The original document is no longer available.
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-5">
                <div className="space-y-2">
                  <h3 className="font-semibold">Invoice information</h3>
                  {renderFields(headerFields)}
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">Line items</h3>
                  {lineGroups.map((line) => (
                    <details key={line.id} open={line.fields.some((field) => field.result === "changed")} className="rounded border border-slate-800 bg-slate-900/50">
                      <summary className="cursor-pointer px-4 py-3 font-medium">
                        Line {line.position} · {line.description ?? "Unnamed item"}
                        {line.fields.some((field) => field.result === "changed") ? <span className="ml-2 text-xs text-amber-400">Changed</span> : <span className="ml-2 text-xs text-emerald-400">Automatic</span>}
                      </summary>
                      <div className="px-3 pb-3">{renderFields(line.fields)}</div>
                    </details>
                  ))}
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold">Stock matching</h3>
                  <div className="space-y-2">
                    {data.matches.map((match) => (
                      <div key={match.lineId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 px-3 py-2 text-sm">
                        <span>Line {match.linePosition} · {match.lineDescription ?? "Unnamed item"}</span>
                        <span className={match.decision === "corrected" ? "text-amber-400" : "text-emerald-400"}>{matchLabel(match.decision)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
