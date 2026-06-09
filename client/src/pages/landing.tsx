import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, Users, BarChart3, Shield, Package, CheckCircle2, ArrowRight, Route, Eye, EyeOff, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

export default function Landing() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/auth/local/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Login failed", description: data.message ?? "Invalid email or password.", variant: "destructive" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } catch {
      toast({ title: "Login failed", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsLoggingIn(false);
    }
  };

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
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Sign in with Replit
          </Button>
        </div>
      </nav>

      {/* Hero + Login */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-3xl" />

        <div className="relative container mx-auto px-6 py-16 md:py-24">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Marketing copy */}
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-sm text-amber-400 font-medium mb-8">
                <Route className="h-4 w-4" />
                Built for the Trucking Industry
              </div>

              <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-tight mb-6">
                Fleet Management
                <span className="block text-amber-400">That Keeps You Moving</span>
              </h1>

              <p className="text-xl text-slate-400 max-w-xl mb-8 leading-relaxed">
                HaulMaster Pro gives trucking companies the tools they need to manage work orders,
                track inventory, assign drivers, and run smarter operations — all in one platform.
              </p>

              <div className="flex flex-wrap gap-4">
                {["Work Order Tracking", "Fleet Management", "Driver Assignment", "Parts Inventory"].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-slate-400 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Login card */}
            <div className="w-full max-w-md mx-auto lg:mx-0 lg:ml-auto">
              <Card className="bg-slate-900 border-slate-700 shadow-2xl">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-center">
                      <LogIn className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-white text-lg">Sign In</CardTitle>
                      <CardDescription className="text-slate-500 text-xs">Access your HaulMaster account</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Email/Password Form */}
                  <form onSubmit={handleEmailLogin} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-sm">Email</Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-sm">Password</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={isLoggingIn}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                    >
                      {isLoggingIn ? "Signing in..." : "Sign In"}
                      {!isLoggingIn && <ArrowRight className="h-4 w-4 ml-2" />}
                    </Button>
                  </form>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t border-slate-700" />
                    <span className="text-xs text-slate-500">or</span>
                    <div className="flex-1 border-t border-slate-700" />
                  </div>

                  {/* Replit Sign In */}
                  <Button
                    type="button"
                    onClick={() => window.location.href = '/api/login'}
                    variant="outline"
                    className="w-full border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
                  >
                    <Shield className="w-4 h-4 mr-2 text-amber-400" />
                    Sign in with Replit
                  </Button>

                  <p className="text-xs text-slate-600 text-center">
                    Team members use email login. Shop owners use Replit.
                  </p>
                </CardContent>
              </Card>
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
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Admin, accounting & shop roles</li>
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
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Real-time status updates</li>
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
                Track every nut and bolt with real-time stock levels and smart reorder alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-slate-500 space-y-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Live stock level monitoring</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Landed cost calculation</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Physical count & variance tracking</li>
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
                Business intelligence to keep your operation running at peak efficiency
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-slate-500 space-y-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Revenue & cost reports</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Technician performance</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Inventory variance audit</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 transition-colors">
            <CardHeader>
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
                <Shield className="h-5 w-5 text-amber-400" />
              </div>
              <CardTitle className="text-white">Role-Based Access</CardTitle>
              <CardDescription className="text-slate-400">
                Every team member sees only what they need — nothing more
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-slate-500 space-y-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Admin, Accounting, Shop User roles</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Admin-managed team access</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Secure password management</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 hover:border-amber-500/40 transition-colors">
            <CardHeader>
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center mb-3">
                <Users className="h-5 w-5 text-amber-400" />
              </div>
              <CardTitle className="text-white">Customer & Fleet CRM</CardTitle>
              <CardDescription className="text-slate-400">
                Full customer history and fleet records in one organized place
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-slate-500 space-y-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Vehicle service history</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Customer profiles</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-amber-500" /> Fleet photo catalog</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-slate-800 bg-slate-900/30">
        <div className="container mx-auto px-6 py-16 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to streamline your operation?</h2>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">
            Sign in above to access your HaulMaster Pro dashboard.
          </p>
          <Button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-8 py-6 h-auto text-base"
            size="lg"
          >
            Get Started
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        </div>
      </section>
    </div>
  );
}
