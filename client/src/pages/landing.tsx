import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, Users, BarChart3, Shield, Package, MapPin, CheckCircle2, ArrowRight, Route } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Top Nav */}
      <nav className="border-b border-slate-800 px-6 py-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
              <Truck className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">HaulMaster Pro</span>
          </div>
          <Button
            onClick={() => window.location.href = '/api/login'}
            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
          >
            Sign In
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-3xl" />

        <div className="relative container mx-auto px-6 py-24 md:py-36">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-sm text-amber-400 font-medium mb-8">
              <Route className="h-4 w-4" />
              Built for the Trucking Industry
            </div>

            <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-tight mb-6">
              Fleet Management
              <span className="block text-amber-400">That Keeps You Moving</span>
            </h1>

            <p className="text-xl text-slate-400 max-w-xl mb-10 leading-relaxed">
              HaulMaster Pro gives trucking companies the tools they need to manage work orders, 
              track inventory, assign drivers, and run smarter operations — all in one platform.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={() => window.location.href = '/api/login'}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-base px-8 py-6 h-auto"
                size="lg"
              >
                Get Started
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-6 mt-10">
              {["Work Order Tracking", "Fleet Management", "Driver Assignment", "Parts Inventory"].map((item) => (
                <div key={item} className="flex items-center gap-2 text-slate-400 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-amber-500" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats Banner */}
      <section className="border-y border-slate-800 bg-slate-900/50">
        <div className="container mx-auto px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "100%", label: "Multi-Tenant Ready" },
              { value: "Real-Time", label: "Job Tracking" },
              { value: "Auto", label: "Driver Assignment" },
              { value: "Live", label: "Inventory Alerts" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl font-bold text-amber-400 mb-1">{stat.value}</div>
                <div className="text-sm text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Everything your fleet operation needs</h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            From intake to delivery, HaulMaster Pro handles every step of the job lifecycle.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 transition-colors">
            <CardHeader>
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
                <Users className="h-5 w-5 text-amber-400" />
              </div>
              <CardTitle className="text-white">Multi-Tenant Platform</CardTitle>
              <CardDescription className="text-slate-400">
                Complete data isolation between trucking companies with role-based access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-slate-500 space-y-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Secure company data separation</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Admin, manager & driver roles</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Team collaboration tools</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 transition-colors">
            <CardHeader>
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
                <Truck className="h-5 w-5 text-amber-400" />
              </div>
              <CardTitle className="text-white">Smart Job Dispatch</CardTitle>
              <CardDescription className="text-slate-400">
                Automated driver assignment and work order management from intake to close
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-slate-500 space-y-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Auto-assign based on workload</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Priority-based scheduling</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Real-time progress tracking</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 transition-colors">
            <CardHeader>
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
                <Package className="h-5 w-5 text-amber-400" />
              </div>
              <CardTitle className="text-white">Parts & Inventory</CardTitle>
              <CardDescription className="text-slate-400">
                Real-time parts tracking with low-stock alerts and usage analytics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-slate-500 space-y-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Live inventory levels</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Automatic reorder alerts</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Parts usage tracking</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 transition-colors">
            <CardHeader>
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
                <MapPin className="h-5 w-5 text-amber-400" />
              </div>
              <CardTitle className="text-white">Fleet Tracking</CardTitle>
              <CardDescription className="text-slate-400">
                Keep tabs on every vehicle in your fleet with complete service histories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-slate-500 space-y-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Full vehicle profiles</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Maintenance history</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Customer linkage</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 transition-colors">
            <CardHeader>
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
                <BarChart3 className="h-5 w-5 text-amber-400" />
              </div>
              <CardTitle className="text-white">Analytics & Reports</CardTitle>
              <CardDescription className="text-slate-400">
                Understand your operation with revenue reports, driver performance, and more
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-slate-500 space-y-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Revenue dashboards</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Driver performance</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Job status analytics</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 transition-colors">
            <CardHeader>
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
                <Shield className="h-5 w-5 text-amber-400" />
              </div>
              <CardTitle className="text-white">Enterprise Security</CardTitle>
              <CardDescription className="text-slate-400">
                Bank-level security with full audit trails and access controls
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-slate-500 space-y-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Role-based permissions</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Secure authentication</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Full audit logging</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-slate-800 bg-slate-900/50">
        <div className="container mx-auto px-6 py-24 text-center">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <Truck className="h-8 w-8 text-amber-400" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Ready to haul smarter?</h2>
          <p className="text-slate-400 max-w-md mx-auto mb-8">
            Sign in to access your HaulMaster Pro dashboard and take control of your fleet operations.
          </p>
          <Button
            onClick={() => window.location.href = '/api/login'}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-base px-10 py-6 h-auto"
            size="lg"
          >
            Sign In to Continue
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
          <p className="text-xs text-slate-600 mt-4">
            Secure authentication powered by Replit
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-6">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-semibold">HaulMaster Pro</span>
          </div>
          <p className="text-xs text-slate-600">Fleet management built for the road.</p>
        </div>
      </footer>
    </div>
  );
}
