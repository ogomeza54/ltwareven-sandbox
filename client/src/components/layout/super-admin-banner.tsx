import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building2, X } from "lucide-react";

const BANNER_HEIGHT = 36;

export default function SuperAdminBanner() {
  const { user } = useAuth();
  // Banner shows only when a super admin is genuinely viewing a different company
  const isSwitched =
    user?.role === "super_admin" &&
    !!user.activeCompanyName &&
    user.companyId !== user.ownCompanyId;

  useEffect(() => {
    if (isSwitched) {
      document.body.style.paddingTop = `${BANNER_HEIGHT}px`;
    } else {
      document.body.style.paddingTop = "";
    }
    return () => {
      document.body.style.paddingTop = "";
    };
  }, [isSwitched]);

  const exitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/switch-company", { companyId: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  if (!isSwitched) return null;

  return (
    <div
      style={{ height: BANNER_HEIGHT }}
      className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-slate-950 flex items-center justify-between px-4 text-sm font-medium shadow-md"
    >
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 shrink-0" />
        <span>
          Viewing as: <span className="font-bold">{user!.activeCompanyName}</span>
        </span>
        <span className="text-slate-700 text-xs hidden sm:inline">— all data is scoped to this company</span>
      </div>
      <button
        onClick={() => exitMutation.mutate()}
        disabled={exitMutation.isPending}
        className="flex items-center gap-1 rounded bg-slate-950/15 hover:bg-slate-950/25 px-2 py-0.5 text-xs font-semibold transition-colors disabled:opacity-50"
      >
        <X className="h-3 w-3" />
        {exitMutation.isPending ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}
