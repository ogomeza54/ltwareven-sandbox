import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import {
  Plug,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Settings,
  Lock,
} from "lucide-react";

interface IntegrationConfig {
  id: string;
  companyId: string;
  provider: string;
  isEnabled: boolean;
  qbTransactionType: string | null;
  qbDebitAccount: string | null;
  qbCreditAccount: string | null;
  oauthRealmId: string | null;
  updatedAt: string;
}

const QB_DEFAULTS = {
  qbTransactionType: "bill",
  qbDebitAccount: "Inventory Asset",
  qbCreditAccount: "Accounts Payable",
};

function StatusBadge({ isEnabled, hasOAuth }: { isEnabled: boolean; hasOAuth?: boolean }) {
  if (isEnabled && hasOAuth) {
    return (
      <Badge className="bg-green-500/10 text-green-400 border-green-500/20 gap-1.5 text-xs">
        <CheckCircle2 className="w-3 h-3" />
        Connected
      </Badge>
    );
  }
  if (isEnabled) {
    return (
      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1.5 text-xs">
        <Settings className="w-3 h-3" />
        Configured
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-700 text-slate-400 border-slate-600 gap-1.5 text-xs">
      <XCircle className="w-3 h-3" />
      Not configured
    </Badge>
  );
}

function QuickBooksCard({ config }: { config: IntegrationConfig | undefined }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    qbTransactionType: config?.qbTransactionType ?? QB_DEFAULTS.qbTransactionType,
    qbDebitAccount: config?.qbDebitAccount ?? QB_DEFAULTS.qbDebitAccount,
    qbCreditAccount: config?.qbCreditAccount ?? QB_DEFAULTS.qbCreditAccount,
    isEnabled: config?.isEnabled ?? false,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      return await apiRequest("PUT", "/api/integrations/quickbooks", data);
    },
    onSuccess: () => {
      toast({ title: "QuickBooks settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.qbTransactionType || !form.qbDebitAccount || !form.qbCreditAccount) {
      toast({
        title: "All fields are required",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate({ ...form, isEnabled: true });
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-green-400 font-bold text-sm">QB</span>
            </div>
            <div>
              <CardTitle className="text-white text-base">QuickBooks</CardTitle>
              <CardDescription className="text-slate-400 text-sm mt-0.5">
                Intuit QuickBooks Online accounting integration
              </CardDescription>
            </div>
          </div>
          <StatusBadge isEnabled={config?.isEnabled ?? false} hasOAuth={!!config?.oauthRealmId} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {config?.isEnabled && (
          <div className="rounded-md bg-slate-800 border border-slate-700 px-4 py-3 text-xs text-slate-300 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Transaction type</span>
              <span className="font-medium">{config.qbTransactionType || QB_DEFAULTS.qbTransactionType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Debit account</span>
              <span className="font-medium">{config.qbDebitAccount || QB_DEFAULTS.qbDebitAccount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Credit account</span>
              <span className="font-medium">{config.qbCreditAccount || QB_DEFAULTS.qbCreditAccount}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(!open)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            Configure
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled
            className="border-slate-700 text-slate-500 gap-1.5 cursor-not-allowed opacity-60"
            title="OAuth connection coming soon"
          >
            <Lock className="w-3.5 h-3.5" />
            Connect to QuickBooks
            <Badge className="bg-slate-700 text-slate-400 border-0 text-xs py-0 px-1.5 ml-1">Soon</Badge>
          </Button>
        </div>

        {open && (
          <form onSubmit={handleSave} className="space-y-4 pt-2 border-t border-slate-800">
            <p className="text-xs text-slate-400">
              These values are written to every new receiving invoice so your QuickBooks export is pre-populated.
              Leave blank to use the defaults.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">Transaction Type</Label>
                <Input
                  value={form.qbTransactionType}
                  onChange={(e) => setForm({ ...form, qbTransactionType: e.target.value })}
                  placeholder={QB_DEFAULTS.qbTransactionType}
                  className="bg-slate-800 border-slate-600 text-white text-sm"
                />
                <p className="text-xs text-slate-500">e.g. bill, expense, check</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">Debit Account</Label>
                <Input
                  value={form.qbDebitAccount}
                  onChange={(e) => setForm({ ...form, qbDebitAccount: e.target.value })}
                  placeholder={QB_DEFAULTS.qbDebitAccount}
                  className="bg-slate-800 border-slate-600 text-white text-sm"
                />
                <p className="text-xs text-slate-500">Account that gets debited</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">Credit Account</Label>
                <Input
                  value={form.qbCreditAccount}
                  onChange={(e) => setForm({ ...form, qbCreditAccount: e.target.value })}
                  placeholder={QB_DEFAULTS.qbCreditAccount}
                  className="bg-slate-800 border-slate-600 text-white text-sm"
                />
                <p className="text-xs text-slate-500">Account that gets credited</p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saveMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
              >
                {saveMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function ComingSoonCard({ name, description, initial }: { name: string; description: string; initial: string }) {
  return (
    <Card className="bg-slate-900 border-slate-800 opacity-60">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
              <span className="text-slate-500 font-bold text-sm">{initial}</span>
            </div>
            <div>
              <CardTitle className="text-slate-400 text-base">{name}</CardTitle>
              <CardDescription className="text-slate-500 text-sm mt-0.5">{description}</CardDescription>
            </div>
          </div>
          <Badge className="bg-slate-800 text-slate-500 border-slate-700 text-xs">Coming soon</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          size="sm"
          disabled
          className="border-slate-700 text-slate-600 cursor-not-allowed"
        >
          <Lock className="w-3.5 h-3.5 mr-1.5" />
          Not yet available
        </Button>
      </CardContent>
    </Card>
  );
}

export default function IntegrationsPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  if (user && !["admin", "super_admin"].includes(user.role)) {
    navigate("/");
    return null;
  }

  const { data: integrations = [], isLoading } = useQuery<IntegrationConfig[]>({
    queryKey: ["/api/integrations"],
  });

  const qbConfig = integrations.find((i) => i.provider === "quickbooks");

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="Integrations" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h2 className="text-white text-lg font-semibold flex items-center gap-2">
                <Plug className="w-5 h-5 text-amber-400" />
                Accounting Software
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Connect HaulMaster Pro to your accounting software so receiving invoices can be exported directly.
                Each company has its own settings.
              </p>
            </div>

            {isLoading ? (
              <div className="text-center py-12 text-slate-500">Loading integrations...</div>
            ) : (
              <div className="space-y-4">
                <QuickBooksCard config={qbConfig} />
                <ComingSoonCard
                  name="Xero"
                  description="Xero cloud accounting integration"
                  initial="X"
                />
                <ComingSoonCard
                  name="FreshBooks"
                  description="FreshBooks small-business accounting"
                  initial="FB"
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
