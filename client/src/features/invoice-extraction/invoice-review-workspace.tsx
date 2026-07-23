import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  InvoiceFinalHeader,
  InvoiceHeaderField,
  InvoiceReviewWorkspaceDto,
} from "@shared/invoice-extraction/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getInvoiceReview,
  privateInvoiceAssetUrl,
  rejectInvoiceReview,
  updateInvoiceHeaderReview,
  updateInvoiceLinesReview,
} from "./invoice-source-api";

const fields: ReadonlyArray<{ key: InvoiceHeaderField; label: string }> = [
  { key: "vendorName", label: "Vendor / Supplier" },
  { key: "invoiceNumber", label: "Invoice number" },
  { key: "invoiceDate", label: "Invoice date" },
  { key: "currency", label: "Currency" },
  { key: "subtotal", label: "Subtotal" },
  { key: "tax", label: "Tax" },
  { key: "freight", label: "Delivery / Freight" },
  { key: "total", label: "Invoice total" },
];

function issueField(path: string): InvoiceHeaderField | null {
  const key = path.replace(/^header\./, "").split(".")[0];
  return fields.some((field) => field.key === key)
    ? (key as InvoiceHeaderField)
    : null;
}

interface Props {
  draftId: string;
  readOnly?: boolean;
  onDraftChanged?: () => Promise<unknown>;
}

export function InvoiceReviewWorkspace({
  draftId,
  readOnly = false,
  onDraftChanged,
}: Props) {
  const [workspace, setWorkspace] = useState<InvoiceReviewWorkspaceDto | null>(null);
  const workspaceRef = useRef<InvoiceReviewWorkspaceDto | null>(null);
  const [header, setHeader] = useState<InvoiceFinalHeader | null>(null);
  const headerRef = useRef<InvoiceFinalHeader | null>(null);
  const [reviewed, setReviewed] = useState<InvoiceHeaderField[]>([]);
  const reviewedRef = useRef<InvoiceHeaderField[]>([]);
  const dirty = useRef(false);
  const saving = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeAsset, setActiveAsset] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [issueIndex, setIssueIndex] = useState(0);
  const [rejectionReason, setRejectionReason] = useState("");
  const [lines, setLines] = useState<InvoiceReviewWorkspaceDto["lines"]>([]);
  const linesRef = useRef<InvoiceReviewWorkspaceDto["lines"]>([]);
  const lineDirty = useRef(false);
  const lineSaving = useRef(false);

  useEffect(() => {
    let current = true;
    void getInvoiceReview(draftId)
      .then((value) => {
        if (!current) return;
        workspaceRef.current = value;
        headerRef.current = value.finalHeader;
        reviewedRef.current = value.reviewedFields;
        setWorkspace(value);
        setHeader(value.finalHeader);
        setReviewed(value.reviewedFields);
        linesRef.current = value.lines;
        setLines(value.lines);
      })
      .catch((caught) =>
        current
          ? setError(caught instanceof Error ? caught.message : "Review could not be loaded.")
          : undefined,
      );
    return () => {
      current = false;
    };
  }, [draftId]);

  const flush = async (
    decision: "draft" | "approved" = "draft",
  ): Promise<boolean> => {
    if (saving.current) {
      dirty.current = true;
      return false;
    }
    saving.current = true;
    setSaveState("saving");
    setError(null);
    try {
      do {
        dirty.current = false;
        const current = workspaceRef.current;
        const values = headerRef.current;
        if (!current || !values) return false;
        const saved = await updateInvoiceHeaderReview(
          current,
          values,
          reviewedRef.current,
          decision,
        );
        workspaceRef.current = saved;
        setWorkspace(saved);
        if (!lineDirty.current) {
          linesRef.current = saved.lines;
          setLines(saved.lines);
        }
        setSaveState("saved");
      } while (dirty.current && decision === "draft");
      await onDraftChanged?.();
      return true;
    } catch (caught) {
      dirty.current = true;
      setSaveState("error");
      setError(
        caught instanceof Error
          ? `${caught.message} Your edits remain on screen.`
          : "Review could not be saved. Your edits remain on screen.",
      );
      return false;
    } finally {
      saving.current = false;
    }
  };

  useEffect(() => {
    if (!workspace || readOnly || !dirty.current) return;
    const timer = window.setTimeout(() => void flush(), 600);
    return () => window.clearTimeout(timer);
  }, [header, reviewed, readOnly, workspace?.draftRevision]);

  const markReviewed = (field: InvoiceHeaderField): void => {
    if (reviewedRef.current.includes(field)) return;
    const next = [...reviewedRef.current, field];
    reviewedRef.current = next;
    setReviewed(next);
    dirty.current = true;
    setSaveState("idle");
  };

  const flushLines = async (
    decision: "draft" | "approved" = "draft",
  ): Promise<boolean> => {
    if (lineSaving.current) {
      lineDirty.current = true;
      return false;
    }
    lineSaving.current = true;
    setSaveState("saving");
    setError(null);
    try {
      do {
        lineDirty.current = false;
        const current = workspaceRef.current;
        if (!current) return false;
        const saved = await updateInvoiceLinesReview(
          current,
          linesRef.current.map((line) => ({
            id: line.id.startsWith("new-") ? null : line.id,
            description: line.description,
            vendorPartNumber: line.vendorPartNumber,
            quantity: line.quantity,
            unitCost: line.unitCost,
            classification: line.classification,
          })),
          decision,
        );
        workspaceRef.current = saved;
        setWorkspace(saved);
        linesRef.current = saved.lines;
        setLines(saved.lines);
        setSaveState("saved");
      } while (lineDirty.current && decision === "draft");
      await onDraftChanged?.();
      return true;
    } catch (caught) {
      lineDirty.current = true;
      setSaveState("error");
      setError(
        caught instanceof Error
          ? `${caught.message} Your line edits remain on screen.`
          : "Invoice lines could not be saved. Your edits remain on screen.",
      );
      return false;
    } finally {
      lineSaving.current = false;
    }
  };

  useEffect(() => {
    if (!workspace || readOnly || !lineDirty.current) return;
    const timer = window.setTimeout(() => void flushLines(), 600);
    return () => window.clearTimeout(timer);
  }, [lines, readOnly, workspace?.draftRevision]);

  const changeLine = (
    id: string,
    patch: Partial<InvoiceReviewWorkspaceDto["lines"][number]>,
  ): void => {
    const next = linesRef.current.map((line) =>
      line.id === id ? { ...line, ...patch } : line,
    );
    linesRef.current = next;
    setLines(next);
    lineDirty.current = true;
    setSaveState("idle");
  };

  const change = (field: InvoiceHeaderField, value: string | null): void => {
    if (!headerRef.current) return;
    const next = { ...headerRef.current, [field]: value };
    headerRef.current = next;
    setHeader(next);
    dirty.current = true;
    setSaveState("idle");
  };

  const issues = workspace?.issues ?? [];
  const activeIssue = issues[Math.min(issueIndex, Math.max(0, issues.length - 1))];
  const currentAsset = workspace?.source.assets[activeAsset];
  const proposed = workspace?.proposedHeader;
  const proposedSummary = useMemo(
    () =>
      proposed
        ? Object.fromEntries(
            fields.map(({ key }) => [
              key,
              proposed[key].normalized ?? proposed[key].observed,
            ]),
          )
        : null,
    [proposed],
  );

  const goToIssue = (direction: -1 | 1): void => {
    const currentWorkspace = workspace;
    if (!issues.length || !currentWorkspace) return;
    const next = (issueIndex + direction + issues.length) % issues.length;
    setIssueIndex(next);
    const field = issueField(issues[next].path);
    if (field) {
      const sourceAssetId = currentWorkspace.proposedHeader[field].sourceAssetId;
      const sourceIndex = currentWorkspace.source.assets.findIndex(
        (asset) => asset.id === sourceAssetId,
      );
      if (sourceIndex >= 0) setActiveAsset(sourceIndex);
      requestAnimationFrame(() =>
        document.getElementById(`invoice-review-${field}`)?.focus(),
      );
    }
  };

  if (error && !workspace) {
    return <p role="alert" className="text-sm text-destructive">{error}</p>;
  }
  if (!workspace || !header || !proposedSummary) {
    return <p className="text-sm text-muted-foreground">Loading invoice review…</p>;
  }

  return (
    <section className="space-y-4 rounded-lg border border-amber-500/40 p-3" aria-label="Invoice review workspace">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Review invoice before receiving</h3>
          <p className="text-xs text-muted-foreground">
            Source, AI proposal and your final values remain separate. No stock has changed.
          </p>
        </div>
        <p className="text-xs" aria-live="polite">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : "Draft"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Private source</p>
            <div className="flex gap-1">
              <Button type="button" size="icon" variant="ghost" className="min-h-11 min-w-11" aria-label="Zoom out document" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="min-h-11 min-w-11" aria-label="Fit document" onClick={() => setZoom(1)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="min-h-11 min-w-11" aria-label="Zoom in document" onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex min-h-72 items-center justify-center overflow-auto rounded bg-slate-950 p-2">
            {currentAsset?.state === "Saved" && currentAsset.detectedType.startsWith("image/") ? (
              <img
                src={privateInvoiceAssetUrl(draftId, currentAsset.id)}
                alt={`Invoice source ${activeAsset + 1} of ${workspace.source.assets.length}`}
                className="max-w-full origin-center object-contain"
                style={{ transform: `scale(${zoom})` }}
              />
            ) : currentAsset?.state === "Saved" ? (
              <iframe
                title={`Invoice PDF ${activeAsset + 1} of ${workspace.source.assets.length}`}
                src={privateInvoiceAssetUrl(draftId, currentAsset.id)}
                className="h-96 w-full bg-white"
              />
            ) : (
              <p className="text-sm text-white">Source unavailable.</p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Button type="button" size="icon" variant="ghost" className="min-h-11 min-w-11" disabled={activeAsset === 0} aria-label="Previous source page" onClick={() => { setActiveAsset((value) => value - 1); setZoom(1); }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs">Document {activeAsset + 1} of {workspace.source.assets.length}</span>
            <Button type="button" size="icon" variant="ghost" className="min-h-11 min-w-11" disabled={activeAsset === workspace.source.assets.length - 1} aria-label="Next source page" onClick={() => { setActiveAsset((value) => value + 1); setZoom(1); }}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded border border-border p-2" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{issues.length} items need review</p>
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="ghost" className="min-h-11 min-w-11" disabled={!issues.length} aria-label="Previous review issue" onClick={() => goToIssue(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" className="min-h-11" disabled={!issues.length} onClick={() => goToIssue(1)}>
                  Next issue
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
            {activeIssue ? <p className="mt-1 text-xs text-amber-500">{activeIssue.message}</p> : <p className="mt-1 text-xs text-green-500">Header review is complete.</p>}
          </div>

          {fields.map(({ key, label }) => {
            const proposal = proposedSummary[key] as string | null;
            const provenance = workspace.proposedHeader[key];
            const provenanceAssetIndex = workspace.source.assets.findIndex(
              (asset) => asset.id === provenance.sourceAssetId,
            );
            const needsAttention = issues.some((issue) => issueField(issue.path) === key);
            return (
              <div key={key} className={`rounded border p-2 ${needsAttention ? "border-amber-500/70" : "border-border"}`}>
                <Label htmlFor={`invoice-review-${key}`}>{label}</Label>
                <Input
                  id={`invoice-review-${key}`}
                  value={header[key] ?? ""}
                  disabled={readOnly || workspace.decision === "rejected"}
                  aria-describedby={`invoice-review-${key}-meta`}
                  onChange={(event) => change(key, event.target.value || null)}
                  onBlur={() => {
                    markReviewed(key);
                    void flush();
                  }}
                />
                <div id={`invoice-review-${key}-meta`} className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    AI proposed: {proposal ?? "Not detected"} · {provenance.confidence === null ? "confidence unavailable" : `${Math.round(provenance.confidence * 100)}% confidence`}
                    {provenanceAssetIndex >= 0
                      ? ` · source ${provenanceAssetIndex + 1}${provenance.sourcePage ? `, page ${provenance.sourcePage}` : ""}`
                      : " · source location unavailable"}
                  </span>
                  {!readOnly ? (
                    <span className="flex gap-1">
                      <Button type="button" variant="ghost" className="min-h-10 px-2 text-xs" onClick={() => { change(key, proposal); markReviewed(key); }}>Accept proposal</Button>
                      <Button type="button" variant="ghost" className="min-h-10 px-2 text-xs" onClick={() => { change(key, null); markReviewed(key); }}>Clear</Button>
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-medium">Invoice lines</h4>
            <p className="text-xs text-muted-foreground">
              Line totals are recalculated by the server. Proposed values remain visible.
            </p>
          </div>
          {!readOnly ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                const id = `new-${Date.now()}-${linesRef.current.length}`;
                const next = [
                  ...linesRef.current,
                  {
                    id,
                    sourceLineIndex: null,
                    position: linesRef.current.length + 1,
                    description: null,
                    vendorPartNumber: null,
                    quantity: null,
                    unitCost: null,
                    calculatedLineTotal: null,
                    classification: "unknown" as const,
                    proposed: null,
                  },
                ];
                linesRef.current = next;
                setLines(next);
                lineDirty.current = true;
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add line
            </Button>
          ) : null}
        </div>
        <div className="space-y-3">
          {lines.map((line, index) => (
            <article
              key={line.id}
              className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-2 lg:grid-cols-6"
              aria-label={`Invoice line ${index + 1}`}
            >
              <div className="lg:col-span-2">
                <Label htmlFor={`review-line-${line.id}-description`}>Description</Label>
                <Input id={`review-line-${line.id}-description`} value={line.description ?? ""} disabled={readOnly} onChange={(event) => changeLine(line.id, { description: event.target.value || null })} onBlur={() => void flushLines()} />
                <p className="mt-1 text-xs text-muted-foreground">AI proposed: {line.proposed?.description.normalized ?? line.proposed?.description.observed ?? "Manually added"}</p>
              </div>
              <div>
                <Label htmlFor={`review-line-${line.id}-part`}>Vendor part #</Label>
                <Input id={`review-line-${line.id}-part`} value={line.vendorPartNumber ?? ""} disabled={readOnly} onChange={(event) => changeLine(line.id, { vendorPartNumber: event.target.value || null })} onBlur={() => void flushLines()} />
              </div>
              <div>
                <Label htmlFor={`review-line-${line.id}-quantity`}>Quantity</Label>
                <Input id={`review-line-${line.id}-quantity`} inputMode="decimal" value={line.quantity ?? ""} disabled={readOnly} onChange={(event) => changeLine(line.id, { quantity: event.target.value || null })} onBlur={() => void flushLines()} />
              </div>
              <div>
                <Label htmlFor={`review-line-${line.id}-cost`}>Unit cost</Label>
                <Input id={`review-line-${line.id}-cost`} inputMode="decimal" value={line.unitCost ?? ""} disabled={readOnly} onChange={(event) => changeLine(line.id, { unitCost: event.target.value || null })} onBlur={() => void flushLines()} />
                <p className="mt-1 text-xs text-muted-foreground">Server line total: {line.calculatedLineTotal ?? "Incomplete"}</p>
              </div>
              <div>
                <Label htmlFor={`review-line-${line.id}-type`}>Type</Label>
                <select
                  id={`review-line-${line.id}-type`}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={line.classification}
                  disabled={readOnly}
                  onChange={(event) => changeLine(line.id, { classification: event.target.value as typeof line.classification })}
                  onBlur={() => void flushLines()}
                >
                  <option value="inventory">Inventory</option>
                  <option value="consumable">Consumable</option>
                  <option value="unknown">Needs review</option>
                </select>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-1 min-h-11 min-w-11"
                    aria-label={`Remove invoice line ${index + 1}`}
                    onClick={() => {
                      if (line.sourceLineIndex !== null && !window.confirm("Remove this extracted invoice line?")) return;
                      const next = linesRef.current.filter((item) => item.id !== line.id);
                      linesRef.current = next;
                      setLines(next);
                      lineDirty.current = true;
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <div className="rounded-lg border border-border p-3">
          <h4 className="font-medium">Reconciliation</h4>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Calculated subtotal</dt><dd>{workspace.reconciliation.calculatedSubtotal ?? "Incomplete"}</dd></div>
            <div><dt className="text-muted-foreground">Tax</dt><dd>{workspace.reconciliation.calculatedTax ?? "Incomplete"}</dd></div>
            <div><dt className="text-muted-foreground">Freight</dt><dd>{workspace.reconciliation.calculatedFreight ?? "Incomplete"}</dd></div>
            <div><dt className="text-muted-foreground">Calculated total</dt><dd>{workspace.reconciliation.calculatedTotal ?? "Incomplete"}</dd></div>
            <div><dt className="text-muted-foreground">Invoice total</dt><dd>{workspace.reconciliation.observedTotal ?? "Missing"}</dd></div>
            <div><dt className="text-muted-foreground">Difference</dt><dd>{workspace.reconciliation.difference ?? "Unknown"}</dd></div>
          </dl>
          <p className={`mt-2 text-sm ${workspace.reconciliation.withinTolerance ? "text-green-500" : "text-amber-500"}`} role="status">
            {workspace.reconciliation.withinTolerance
              ? "Amounts reconcile within the configured tolerance."
              : "Correct missing values or the amount difference before approval."}
          </p>
          {!readOnly ? (
            <Button type="button" className="mt-3 min-h-11" disabled={!workspace.reconciliation.withinTolerance || lineSaving.current} onClick={() => void flushLines("approved")}>
              Approve lines & totals
            </Button>
          ) : null}
        </div>
      </div>

      {!readOnly && workspace.decision !== "rejected" ? (
        <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <Label htmlFor="invoice-rejection-reason">Reject reason</Label>
            <Input id="invoice-rejection-reason" value={rejectionReason} placeholder="Required only when rejecting" onChange={(event) => setRejectionReason(event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" className="min-h-11" disabled={rejectionReason.trim().length < 3 || saving.current} onClick={async () => {
              try {
                if (dirty.current && !(await flush())) return;
                const current = workspaceRef.current;
                if (!current) return;
                const rejected = await rejectInvoiceReview(current, rejectionReason);
                workspaceRef.current = rejected;
                setWorkspace(rejected);
                await onDraftChanged?.();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Invoice could not be rejected.");
              }
            }}>Reject invoice</Button>
            <Button type="button" className="min-h-11" disabled={issues.length > 0 || saving.current} onClick={() => void flush("approved")}>
              <Check className="mr-2 h-4 w-4" />
              Approve header
            </Button>
          </div>
        </div>
      ) : null}
      {workspace.decision === "rejected" ? (
        <p className="rounded border border-destructive p-2 text-sm">
          Rejected: {workspace.rejectionReason}
        </p>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
