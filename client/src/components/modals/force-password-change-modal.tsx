import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Lock, Eye, EyeOff } from "lucide-react";

interface ForcePasswordChangeModalProps {
  open: boolean;
}

export default function ForcePasswordChangeModal({ open }: ForcePasswordChangeModalProps) {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", { newPassword });
      toast({ title: "Password updated!", description: "You're all set." });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch (err: any) {
      toast({
        title: "Failed to update password",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Lock className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Set Your Password</h2>
            <p className="text-sm text-slate-400">Choose a new password to continue</p>
          </div>
        </div>

        <p className="text-sm text-slate-400 mb-5 bg-amber-500/5 border border-amber-500/20 rounded px-3 py-2">
          Your account was created with a temporary password. Please set a new one before continuing.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-sm">New Password</Label>
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="bg-slate-800 border-slate-600 text-white pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-300 text-sm">Confirm Password</Label>
            <div className="relative">
              <Input
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                className="bg-slate-800 border-slate-600 text-white pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold"
          >
            {isSubmitting ? "Saving..." : "Set Password & Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
