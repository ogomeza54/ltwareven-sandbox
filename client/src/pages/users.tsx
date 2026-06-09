import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UserPlus, Trash2, KeyRound, UserCog, Building2, Eye, EyeOff, Users } from "lucide-react";
import { useLocation } from "wouter";

interface UserRow {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  companyId: string;
  companyName?: string;
  createdAt?: string;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "accounting", label: "Accounting" },
  { value: "shop_user", label: "Shop User" },
  { value: "technician", label: "Technician" },
];

const roleBadgeClass = (role: string) => {
  switch (role) {
    case "super_admin": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    case "admin": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    case "accounting": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "shop_user": return "bg-green-500/10 text-green-400 border-green-500/20";
    default: return "bg-slate-700 text-slate-400 border-slate-600";
  }
};

export default function UsersPage() {
  const [, navigate] = useLocation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = currentUser?.role === "super_admin";

  // Redirect non-admins
  if (currentUser && !["admin", "super_admin"].includes(currentUser.role)) {
    navigate("/");
    return null;
  }

  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ["/api/users"],
  });

  const { data: companies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/admin/companies"],
    enabled: isSuperAdmin,
  });

  // Create user modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "", firstName: "", lastName: "", password: "", role: "shop_user", companyId: ""
  });
  const [showCreatePwd, setShowCreatePwd] = useState(false);

  // Reset password modal state
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPwd, setShowResetPwd] = useState(false);

  // Company filter for super_admin
  const [companyFilter, setCompanyFilter] = useState<string>("all");

  const displayedUsers = isSuperAdmin && companyFilter !== "all"
    ? users.filter((u) => u.companyId === companyFilter)
    : users;

  const createMutation = useMutation({
    mutationFn: async (data: typeof createForm) => {
      return await apiRequest("POST", "/api/users", {
        email: data.email,
        firstName: data.firstName || undefined,
        lastName: data.lastName || undefined,
        password: data.password,
        role: data.role,
        companyId: data.companyId || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "User created", description: "They can now sign in with their email and password." });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowCreate(false);
      setCreateForm({ email: "", firstName: "", lastName: "", password: "", role: "shop_user", companyId: "" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create user", description: err?.message ?? "Please try again.", variant: "destructive" });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      return await apiRequest("PATCH", `/api/users/${id}/role`, { role });
    },
    onSuccess: () => {
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update role", description: err?.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async ({ id, newPassword }: { id: string; newPassword: string }) => {
      return await apiRequest("POST", `/api/users/${id}/reset-password`, { newPassword });
    },
    onSuccess: () => {
      toast({ title: "Password reset", description: "User will be prompted to change it on next login." });
      setResetTarget(null);
      setResetPassword("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to reset password", description: err?.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/users/${id}`, undefined);
    },
    onSuccess: () => {
      toast({ title: "User removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete user", description: err?.message, variant: "destructive" });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (createForm.password.length < 6) {
      toast({ title: "Password too short", description: "Must be at least 6 characters.", variant: "destructive" });
      return;
    }
    createMutation.mutate(createForm);
  };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title="User Management" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {isSuperAdmin && companies.length > 0 && (
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="w-52 bg-slate-800 border-slate-700 text-slate-200 text-sm">
                    <Building2 className="w-4 h-4 mr-2 text-amber-400" />
                    <SelectValue placeholder="All companies" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="all" className="text-slate-200">All Companies</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-slate-200">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button
              onClick={() => setShowCreate(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Add User
            </Button>
          </div>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400" />
                {isSuperAdmin ? "All Users" : "Team Members"}
                <span className="ml-2 text-sm font-normal text-slate-400">({displayedUsers.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="text-center py-12 text-slate-500">Loading users...</div>
              ) : displayedUsers.length === 0 ? (
                <div className="text-center py-12 text-slate-500">No users found. Add one to get started.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="text-left px-4 py-3 font-medium">User</th>
                        {isSuperAdmin && <th className="text-left px-4 py-3 font-medium">Company</th>}
                        <th className="text-left px-4 py-3 font-medium">Role</th>
                        <th className="text-left px-4 py-3 font-medium">Auth</th>
                        <th className="text-right px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedUsers.map((u) => {
                        const isMe = u.id === currentUser?.id;
                        const isSuperAdminRow = u.role === "super_admin";
                        const canModify = !isMe && !isSuperAdminRow;
                        const isLocalUser = !!u.email && u.role !== "super_admin";

                        return (
                          <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                                  <span className="text-amber-400 text-xs font-semibold">
                                    {(u.firstName?.[0] || u.email?.[0] || "?").toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-white font-medium">
                                    {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                                    {isMe && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                                  </p>
                                  <p className="text-slate-500 text-xs">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            {isSuperAdmin && (
                              <td className="px-4 py-3 text-slate-400 text-xs">{u.companyName || "—"}</td>
                            )}
                            <td className="px-4 py-3">
                              {canModify ? (
                                <Select
                                  value={u.role}
                                  onValueChange={(role) => roleMutation.mutate({ id: u.id, role })}
                                  disabled={roleMutation.isPending}
                                >
                                  <SelectTrigger className="h-7 text-xs w-36 bg-slate-800 border-slate-700">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-slate-800 border-slate-700">
                                    {ROLE_OPTIONS.map((r) => (
                                      <SelectItem key={r.value} value={r.value} className="text-slate-200 text-xs">
                                        {r.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge variant="outline" className={`text-xs ${roleBadgeClass(u.role)}`}>
                                  {u.role.replace("_", " ")}
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                isLocalUser ? "bg-blue-500/10 text-blue-400" : "bg-slate-700 text-slate-400"
                              }`}>
                                {isLocalUser ? "Email" : "Replit"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                {canModify && isLocalUser && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
                                    onClick={() => { setResetTarget(u); setResetPassword(""); }}
                                    title="Reset password"
                                  >
                                    <KeyRound className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {canModify && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                                    onClick={() => {
                                      if (confirm(`Remove ${u.email}? This cannot be undone.`)) {
                                        deleteMutation.mutate(u.id);
                                      }
                                    }}
                                    title="Delete user"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Create User Modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-amber-400" />
              Add Team Member
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">First Name</Label>
                <Input
                  value={createForm.firstName}
                  onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                  placeholder="Jane"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">Last Name</Label>
                <Input
                  value={createForm.lastName}
                  onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                  placeholder="Smith"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">Email <span className="text-red-400">*</span></Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="jane@company.com"
                className="bg-slate-800 border-slate-600 text-white"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">Temporary Password <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Input
                  type={showCreatePwd ? "text" : "password"}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="At least 6 characters"
                  className="bg-slate-800 border-slate-600 text-white pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePwd(!showCreatePwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  {showCreatePwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-500">User will be required to change this on first login.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">Role <span className="text-red-400">*</span></Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v })}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="text-slate-200">{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isSuperAdmin && companies.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">Company</Label>
                <Select value={createForm.companyId} onValueChange={(v) => setCreateForm({ ...createForm, companyId: v })}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-200">
                    <SelectValue placeholder="Current company" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-slate-200">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreate(false)}
                className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold"
              >
                {createMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-400" />
              Reset Password
            </DialogTitle>
          </DialogHeader>
          {resetTarget && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-slate-400">
                Set a new temporary password for <strong className="text-white">{resetTarget.email}</strong>. 
                They'll be required to change it on their next login.
              </p>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-sm">New Temporary Password</Label>
                <div className="relative">
                  <Input
                    type={showResetPwd ? "text" : "password"}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="bg-slate-800 border-slate-600 text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPwd(!showResetPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                  >
                    {showResetPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setResetTarget(null)}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button
                  disabled={resetMutation.isPending || resetPassword.length < 6}
                  onClick={() => resetMutation.mutate({ id: resetTarget.id, newPassword: resetPassword })}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                >
                  {resetMutation.isPending ? "Saving..." : "Reset Password"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
