import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Building2, Users, UserPlus, Shield } from "lucide-react";

interface Company {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  companyId: string;
  companyName?: string;
}

export default function SuperAdmin() {
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyPlan, setNewCompanyPlan] = useState("basic");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all companies
  const { data: companies = [], isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/admin/companies"],
  });

  // Fetch all users
  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  // Create company mutation
  const createCompanyMutation = useMutation({
    mutationFn: async (data: { name: string; plan: string }) => {
      return await apiRequest("POST", "/api/admin/companies", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Company created successfully",
      });
      setNewCompanyName("");
      setNewCompanyPlan("basic");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Assign admin mutation
  const assignAdminMutation = useMutation({
    mutationFn: async (data: { email: string; companyId: string }) => {
      return await apiRequest("POST", "/api/admin/assign-admin", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Admin assigned successfully",
      });
      setAdminEmail("");
      setSelectedCompany("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateCompany = () => {
    if (!newCompanyName.trim()) {
      toast({
        title: "Error",
        description: "Company name is required",
        variant: "destructive",
      });
      return;
    }
    createCompanyMutation.mutate({ name: newCompanyName, plan: newCompanyPlan });
  };

  const handleAssignAdmin = () => {
    if (!adminEmail.trim() || !selectedCompany) {
      toast({
        title: "Error",
        description: "Email and company are required",
        variant: "destructive",
      });
      return;
    }
    assignAdminMutation.mutate({ email: adminEmail, companyId: selectedCompany });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Create New Company */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Create New Company
            </CardTitle>
            <CardDescription>
              Add a new repair shop company to the platform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="Enter company name"
              />
            </div>
            <div>
              <Label htmlFor="companyPlan">Plan</Label>
              <Select value={newCompanyPlan} onValueChange={setNewCompanyPlan}>
                <SelectTrigger>
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleCreateCompany}
              disabled={createCompanyMutation.isPending}
              className="w-full"
            >
              {createCompanyMutation.isPending ? "Creating..." : "Create Company"}
            </Button>
          </CardContent>
        </Card>

        {/* Assign Admin */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Assign Company Admin
            </CardTitle>
            <CardDescription>
              Assign an admin to a company who can manage user access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="adminEmail">Admin Email</Label>
              <Input
                id="adminEmail"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="Enter admin email"
              />
            </div>
            <div>
              <Label htmlFor="companySelect">Company</Label>
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleAssignAdmin}
              disabled={assignAdminMutation.isPending}
              className="w-full"
            >
              {assignAdminMutation.isPending ? "Assigning..." : "Assign Admin"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Companies List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            All Companies
          </CardTitle>
        </CardHeader>
        <CardContent>
          {companiesLoading ? (
            <div>Loading companies...</div>
          ) : (
            <div className="space-y-2">
              {companies.map((company) => (
                <div key={company.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium">{company.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Plan: {company.plan} • Created: {new Date(company.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ID: {company.id}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div>Loading users...</div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium">{user.firstName} {user.lastName}</div>
                    <div className="text-sm text-muted-foreground">
                      {user.email} • Role: {user.role} • Company: {user.companyName}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ID: {user.id}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}