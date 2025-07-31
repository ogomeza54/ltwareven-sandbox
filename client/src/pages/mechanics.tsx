import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, UserPlus, Wrench, Clock, DollarSign } from "lucide-react";

export default function Mechanics() {
  const { data: mechanics, isLoading } = useQuery({
    queryKey: ["/api/mechanics"],
  });

  const availableMechanics = mechanics?.filter((mechanic: any) => mechanic.isAvailable);
  const busyMechanics = mechanics?.filter((mechanic: any) => !mechanic.isAvailable);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar
          title="Mechanics Management"
          subtitle="Manage your team and assignments"
        />

        <div className="p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Mechanics</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {isLoading ? "..." : mechanics?.length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users className="text-primary text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Available</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {isLoading ? "..." : availableMechanics?.length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Wrench className="text-green-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Busy</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {isLoading ? "..." : busyMechanics?.length || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Clock className="text-yellow-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Avg. Rate</p>
                    <p className="text-3xl font-bold text-gray-900">
                      ${isLoading ? "..." : mechanics?.length > 0 
                        ? Math.round(mechanics.reduce((sum: number, m: any) => sum + Number(m.hourlyRate), 0) / mechanics.length)
                        : 0}/hr
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="text-purple-600 text-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Add Mechanic Button */}
          <div className="mb-6 flex justify-end">
            <Button className="bg-primary text-white hover:bg-blue-700">
              <UserPlus className="w-4 h-4 mr-2" />
              Add Mechanic
            </Button>
          </div>

          {/* Mechanics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-gray-500">Loading mechanics...</p>
                </CardContent>
              </Card>
            ) : !mechanics || mechanics.length === 0 ? (
              <div className="col-span-full">
                <Card>
                  <CardContent className="p-6">
                    <div className="text-center py-8">
                      <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No mechanics found</h3>
                      <p className="text-gray-500 mb-4">
                        Start by adding your first mechanic to the team.
                      </p>
                      <Button className="bg-primary text-white hover:bg-blue-700">
                        <UserPlus className="w-4 h-4 mr-2" />
                        Add First Mechanic
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              mechanics.map((mechanic: any) => (
                <Card key={mechanic.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4 mb-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-primary text-white">
                          {mechanic.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{mechanic.name}</h3>
                        <p className="text-sm text-gray-600">{mechanic.specialization}</p>
                      </div>
                      <Badge 
                        variant={mechanic.isAvailable ? "default" : "secondary"}
                        className={mechanic.isAvailable ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
                      >
                        {mechanic.isAvailable ? "Available" : "Busy"}
                      </Badge>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Hourly Rate:</span>
                        <span className="font-medium">${Number(mechanic.hourlyRate)}/hr</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Current Workload:</span>
                        <span className="font-medium">
                          {mechanic.currentWorkload}/{mechanic.maxWorkload} jobs
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            mechanic.currentWorkload / mechanic.maxWorkload > 0.8 
                              ? "bg-red-500" 
                              : mechanic.currentWorkload / mechanic.maxWorkload > 0.6
                              ? "bg-yellow-500"
                              : "bg-green-500"
                          }`}
                          style={{ 
                            width: `${Math.min(100, (mechanic.currentWorkload / mechanic.maxWorkload) * 100)}%` 
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex space-x-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        View Schedule
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1">
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
