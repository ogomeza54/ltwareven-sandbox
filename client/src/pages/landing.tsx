import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wrench, Users, BarChart3, Shield } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <Wrench className="h-12 w-12 text-blue-600 mr-3" />
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              RepairFlow Pro
            </h1>
          </div>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Streamline your repair shop operations with comprehensive management tools, 
            inventory tracking, and automated workflow optimization.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <Card>
            <CardHeader>
              <Users className="h-8 w-8 text-blue-600 mb-2" />
              <CardTitle>Multi-Tenant Platform</CardTitle>
              <CardDescription>
                Complete data isolation between companies with role-based access control
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                <li>• Secure company data separation</li>
                <li>• Admin, manager, and technician roles</li>
                <li>• Team collaboration tools</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Wrench className="h-8 w-8 text-green-600 mb-2" />
              <CardTitle>Smart Workflow</CardTitle>
              <CardDescription>
                Automated mechanic assignment and repair order management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                <li>• Auto-assign based on workload</li>
                <li>• Priority-based scheduling</li>
                <li>• Progress tracking</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <BarChart3 className="h-8 w-8 text-purple-600 mb-2" />
              <CardTitle>Inventory Control</CardTitle>
              <CardDescription>
                Real-time parts tracking with low stock alerts and usage analytics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                <li>• Live inventory levels</li>
                <li>• Automatic reorder alerts</li>
                <li>• Parts usage tracking</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <Shield className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <CardTitle>Ready to Get Started?</CardTitle>
              <CardDescription>
                Sign in to access your repair shop management dashboard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => window.location.href = '/api/login'}
                className="w-full"
                size="lg"
              >
                Sign In to Continue
              </Button>
              <p className="text-xs text-gray-500 mt-4">
                Secure authentication powered by Replit
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}