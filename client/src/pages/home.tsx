import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import { 
  Truck, 
  Users, 
  ClipboardList, 
  Package, 
  BarChart3,
  LogOut,
  Gauge,
  Wrench,
  UserCircle
} from "lucide-react";

export default function Home() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 bg-amber-500 rounded-xl flex items-center justify-center animate-pulse">
            <Truck className="h-7 w-7 text-white" />
          </div>
          <p className="text-slate-400 text-sm">Loading HaulMaster Pro...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
                <Truck className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">HaulMaster Pro</h1>
                <p className="text-sm text-slate-400">
                  Welcome back, {user?.firstName || user?.email}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Avatar className="border-2 border-amber-500/30">
                <AvatarImage src={user?.profileImageUrl ?? undefined} />
                <AvatarFallback className="bg-amber-500/10 text-amber-400 font-bold">
                  {(user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <Button 
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                onClick={() => window.location.href = '/api/logout'}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-10">
        <div className="mb-10">
          <h2 className="text-3xl font-bold text-white mb-1">Fleet Dashboard</h2>
          <p className="text-slate-400">Select a module to get started with your operations</p>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          <Link href="/dashboard">
            <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5 transition-all cursor-pointer group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                  Dashboard
                </CardTitle>
                <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                  <Gauge className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-500">
                  View analytics and key metrics
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/intake-form">
            <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5 transition-all cursor-pointer group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                  New Job Intake
                </CardTitle>
                <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                  <ClipboardList className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-500">
                  Create a new work order
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/repair-orders">
            <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5 transition-all cursor-pointer group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                  Work Orders
                </CardTitle>
                <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                  <Wrench className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-500">
                  Manage active jobs
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/inventory">
            <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5 transition-all cursor-pointer group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                  Parts & Inventory
                </CardTitle>
                <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                  <Package className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-500">
                  Track parts and supplies
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/mechanics">
            <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5 transition-all cursor-pointer group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                  Technicians
                </CardTitle>
                <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                  <Users className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-500">
                  Manage your team
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/customers">
            <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5 transition-all cursor-pointer group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                  Owner Operators
                </CardTitle>
                <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                  <UserCircle className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-500">
                  Manage owner operator database
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/vehicles">
            <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5 transition-all cursor-pointer group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                  Fleet
                </CardTitle>
                <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                  <Truck className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-500">
                  View and manage vehicles
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/reports">
            <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5 transition-all cursor-pointer group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                  Reports
                </CardTitle>
                <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                  <BarChart3 className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-slate-500">
                  Analytics and summaries
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Account Info */}
        <Card className="mt-8 bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Account Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Role</label>
                <p className="capitalize text-slate-200 mt-1">{user?.role}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Email</label>
                <p className="text-slate-200 mt-1">{user?.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
