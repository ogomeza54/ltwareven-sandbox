import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { InvoiceQualityDashboard } from "@shared/invoice-extraction/contracts";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceQualityDetailDialog } from "@/features/invoice-extraction/invoice-quality-detail-dialog";
import { AlertTriangle, ChevronRight, Gauge, ScanLine, WandSparkles } from "lucide-react";

const percent = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const completionRate = (
  accepted: number,
  systemAdded: number,
  reviewed: number,
) => (reviewed === 0 ? null : (accepted + systemAdded) / reviewed);
const duration = (seconds: number | null) => {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  return `${(seconds / 60).toFixed(1)} min`;
};
export default function InvoiceQuality() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [subjectType, setSubjectType] = useState("");
  const [decision, setDecision] = useState("");
  const [engineVersion, setEngineVersion] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const filters = {
    from: from ? new Date(`${from}T00:00:00.000Z`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
    supplier: supplier || undefined,
    subjectType: subjectType || undefined,
    decision: decision || undefined,
    engineVersion: engineVersion || undefined,
  };
  const { data, isLoading, error } = useQuery<InvoiceQualityDashboard>({
    queryKey: ["/api/invoice-quality", filters],
  });

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          title="Invoice AI Quality"
          subtitle="Operational review feedback and extraction performance"
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
              <input aria-label="From date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" />
              <input aria-label="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" />
              <input aria-label="Supplier filter" placeholder="Supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" />
              <select aria-label="Field type filter" value={subjectType} onChange={(event) => setSubjectType(event.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                <option value="">All fields</option>
                <option value="document">Document</option>
                <option value="header">Header</option>
                <option value="line">Line</option>
                <option value="match">Part match</option>
              </select>
              <select aria-label="Decision filter" value={decision} onChange={(event) => setDecision(event.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                <option value="">All outcomes</option>
                <option value="accepted">Accepted</option>
                <option value="corrected">Corrected</option>
                <option value="added">Added</option>
                <option value="removed">Removed</option>
                <option value="rejected">Rejected</option>
              </select>
              <input aria-label="Engine version filter" placeholder="Engine version" value={engineVersion} onChange={(event) => setEngineVersion(event.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" />
            </CardContent>
          </Card>

          {isLoading && <p className="text-slate-400">Loading quality metrics…</p>}
          {error && <p role="alert" className="text-red-400">Quality metrics could not be loaded.</p>}
          {data && (
            <>
              {data.totals.reviewedEvents === 0 ? (
                <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300">
                  No reviewed invoices yet. Quality results will appear after the next confirmed invoice.
                </div>
              ) : data.totals.lowSample ? (
                <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-200">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <p className="text-sm">
                    Low sample: {data.totals.reviewedEvents} reviewed observations. Rates remain directional until at least {data.totals.sampleFloor}.
                  </p>
                </div>
              ) : null}
              <p className="text-sm text-slate-400">
                Automatically completed combines values read correctly from the invoice with values safely completed using inventory data or business rules. Stock matching is measured separately.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  ["Invoices reviewed", String(data.totals.documents), `${data.totals.runs} scans`, ScanLine],
                  ["Automatically completed", percent(completionRate(data.totals.acceptedEvents, data.totals.automaticEnrichmentEvents, data.totals.reviewedEvents)), `${data.totals.acceptedEvents + data.totals.automaticEnrichmentEvents} / ${data.totals.reviewedEvents} fields`, WandSparkles],
                  ["Changed during review", percent(data.totals.correctionRate), `${data.totals.correctedEvents} / ${data.totals.reviewedEvents} fields`, AlertTriangle],
                  ["Average review", duration(data.totals.averageReviewSeconds), "Confirmed and rejected invoices", Gauge],
                ].map(([label, value, note, Icon]) => (
                  <Card key={String(label)} className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-5">
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-400">{String(label)}</p>
                          <p className="text-2xl font-bold text-white">{String(value)}</p>
                          <p className="text-xs text-slate-500 mt-1">{String(note)}</p>
                        </div>
                        <Icon className="w-5 h-5 text-amber-400" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader><CardTitle className="text-white">Review results</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Automatically completed</span>
                      <span className="text-slate-400">{data.totals.acceptedEvents + data.totals.automaticEnrichmentEvents} / {data.totals.reviewedEvents} · {percent(completionRate(data.totals.acceptedEvents, data.totals.automaticEnrichmentEvents, data.totals.reviewedEvents))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Changed during review</span>
                      <span className="text-slate-400">{data.totals.correctedEvents} / {data.totals.reviewedEvents} · {percent(data.totals.correctionRate)}</span>
                    </div>
                    <p className="border-t border-slate-800 pt-3 text-xs text-slate-500">
                      Technical detail: {data.totals.acceptedEvents} extracted values accepted unchanged · {data.totals.automaticEnrichmentEvents} values completed from inventory data or rules.
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader><CardTitle className="text-white">Stock matching</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {data.byMatchDecision.length === 0 ? (
                      <p className="text-sm text-slate-500">No stock matches reviewed yet.</p>
                    ) : data.byMatchDecision.map((item) => (
                      <div key={item.key} className="flex justify-between text-sm">
                        <span className="text-slate-300">{item.key === "accepted" ? "Matched automatically" : item.key === "added" ? "New stock item" : "Changed during review"}</span>
                        <span className="text-slate-400">{item.count} / {item.denominator} · {percent(item.rate)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader><CardTitle className="text-white">Engine operations</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-slate-500"><tr><th className="pb-2">Version</th><th>Runs</th><th>Failures</th><th>Retries</th><th>Automatically completed</th><th>Changed</th></tr></thead>
                      <tbody>{data.engines.map((engine) => (
                        <tr key={engine.engineVersion} className="border-t border-slate-800 text-slate-300">
                          <td className="py-3">{engine.engineVersion}</td><td>{engine.runs}</td><td>{engine.failedRuns}</td><td>{engine.retryAttempts}</td><td>{percent(engine.reviewedEvents === 0 ? null : (engine.reviewedEvents - engine.correctedEvents) / engine.reviewedEvents)}</td><td>{percent(engine.correctionRate)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">Invoice review history</CardTitle>
                  <p className="text-sm text-slate-400">Select an invoice to see the original document, the recognized values and every change made during review.</p>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-slate-500"><tr><th className="pb-2">Invoice</th><th>Status</th><th>Engine</th><th>Automatically completed</th><th>Changed</th><th>Review</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{data.cases.map((item) => (
                      <tr key={item.draftId} className="group border-t border-slate-800 text-slate-300 hover:bg-slate-800/40">
                        <td className="py-3 pr-4">
                          <button type="button" onClick={() => setSelectedDraftId(item.draftId)} className="min-h-10 text-left font-medium text-slate-100 underline-offset-4 hover:text-amber-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                            {item.supplier ?? "Unknown supplier"}
                            <span className="mt-0.5 block text-xs font-normal text-slate-500">View the original invoice and review details</span>
                          </button>
                        </td><td>{item.status}</td><td>{item.engineVersion ?? "—"}</td><td>{item.reviewedEvents - item.correctedEvents} / {item.reviewedEvents}</td><td>{item.correctedEvents} / {item.reviewedEvents}</td><td>{duration(item.reviewSeconds)}</td><td>{new Date(item.updatedAt).toLocaleDateString()}</td>
                        <td><button type="button" aria-label={`View details for ${item.supplier ?? "invoice"}`} onClick={() => setSelectedDraftId(item.draftId)} className="flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"><ChevronRight className="h-5 w-5" /></button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>
      <InvoiceQualityDetailDialog
        draftId={selectedDraftId}
        open={selectedDraftId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelectedDraftId(null);
        }}
      />
    </div>
  );
}
