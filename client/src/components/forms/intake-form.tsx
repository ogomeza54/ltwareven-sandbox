import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { validateFiles } from "@/lib/file-upload";
import { CloudUpload, Plus, X, Truck, User, Wrench, AlertTriangle, Search, Building2, FileText } from "lucide-react";
import { SERVICE_TYPES, TRUCK_TYPES } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FleetVehicle {
  id: string;
  tractorNumber: string | null;
  year: number;
  make: string;
  model: string;
  vin: string | null;
  licensePlate: string | null;
  color: string | null;
  mileage: number | null;
  unitStatus: string | null;
  truckType: string | null;
}

// ── Form schema ───────────────────────────────────────────────────────────────

const intakeFormSchema = z.object({
  customerType: z.enum(["company-fleet", "owner-operator", "third-party"]),
  // Client info (Owner Operator / Third Party)
  customerName: z.string().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  // Fleet lookup (Company Fleet)
  fleetVehicleId: z.string().optional(),
  // Vehicle
  vehicleYear: z.string().optional(),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  vin: z.string().optional(),
  licensePlate: z.string().optional(),
  color: z.string().optional(),
  mileage: z.string().optional(),
  // Trucking-specific
  truckType: z.string().optional(),
  trailerNumber: z.string().optional(),
  odometerIn: z.string().optional(),
  serviceType: z.string().optional(),
  dotInspectionRequired: z.boolean().default(false),
  scheduledDate: z.string().optional(),
  estimatedHours: z.string().optional(),
  laborRate: z.string().optional(),
  // Work order
  repairDescription: z.string().min(1, "Description is required"),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  // Invoice
  createInvoice: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.customerType === "company-fleet") {
    if (!data.fleetVehicleId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please select a fleet vehicle", path: ["fleetVehicleId"] });
    }
  } else {
    if (!data.customerName || data.customerName.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Customer name is required", path: ["customerName"] });
    }
    if (!data.phoneNumber || data.phoneNumber.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Phone number is required", path: ["phoneNumber"] });
    }
    if (!data.vehicleYear || data.vehicleYear.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Year is required", path: ["vehicleYear"] });
    }
    if (!data.vehicleMake || data.vehicleMake.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Make is required", path: ["vehicleMake"] });
    }
    if (!data.vehicleModel || data.vehicleModel.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Model is required", path: ["vehicleModel"] });
    }
  }
});

type IntakeFormData = z.infer<typeof intakeFormSchema>;

interface IntakeFormProps {
  onSuccess?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IntakeForm({ onSuccess }: IntakeFormProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [fleetSearch, setFleetSearch] = useState("");
  const [selectedFleetVehicle, setSelectedFleetVehicle] = useState<FleetVehicle | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<IntakeFormData>({
    resolver: zodResolver(intakeFormSchema),
    defaultValues: {
      customerType: "company-fleet",
      customerName: "",
      phoneNumber: "",
      email: "",
      fleetVehicleId: "",
      vehicleYear: "",
      vehicleMake: "",
      vehicleModel: "",
      vin: "",
      licensePlate: "",
      color: "",
      mileage: "",
      truckType: "",
      trailerNumber: "",
      odometerIn: "",
      serviceType: "",
      dotInspectionRequired: false,
      scheduledDate: "",
      estimatedHours: "",
      laborRate: "",
      repairDescription: "",
      priority: "medium",
      createInvoice: false,
    },
  });

  const customerType = form.watch("customerType");
  const isFleet = customerType === "company-fleet";
  const needsCustomer = !isFleet;

  // Fleet search query
  const { data: fleetResults = [], isFetching: isSearching } = useQuery<FleetVehicle[]>({
    queryKey: ["/api/vehicles/fleet", fleetSearch],
    queryFn: async () => {
      if (!fleetSearch.trim()) return [];
      const res = await fetch(`/api/vehicles/fleet?search=${encodeURIComponent(fleetSearch)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: fleetSearch.length >= 2,
  });

  const showFleetDropdown = fleetSearch.length >= 2 && !selectedFleetVehicle;

  const selectFleetVehicle = (vehicle: FleetVehicle) => {
    setSelectedFleetVehicle(vehicle);
    setFleetSearch(vehicle.tractorNumber ? `Unit ${vehicle.tractorNumber}` : `${vehicle.year} ${vehicle.make} ${vehicle.model}`);
    form.setValue("fleetVehicleId", vehicle.id);
    form.setValue("vehicleYear", String(vehicle.year));
    form.setValue("vehicleMake", vehicle.make);
    form.setValue("vehicleModel", vehicle.model);
    form.setValue("vin", vehicle.vin || "");
    form.setValue("licensePlate", vehicle.licensePlate || "");
    form.setValue("color", vehicle.color || "");
    form.setValue("mileage", vehicle.mileage != null ? String(vehicle.mileage) : "");
    form.setValue("truckType", vehicle.truckType || "");
  };

  const clearFleetSelection = () => {
    setSelectedFleetVehicle(null);
    setFleetSearch("");
    form.setValue("fleetVehicleId", "");
    form.setValue("vehicleYear", "");
    form.setValue("vehicleMake", "");
    form.setValue("vehicleModel", "");
    form.setValue("vin", "");
    form.setValue("licensePlate", "");
    form.setValue("color", "");
    form.setValue("mileage", "");
  };

  const createWorkOrderMutation = useMutation({
    mutationFn: async (data: IntakeFormData & { files: File[] }) => {
      const formData = new FormData();
      const skip = new Set(["files"]);
      Object.entries(data).forEach(([key, value]) => {
        if (skip.has(key) || value === undefined || value === null || value === "") return;
        if (typeof value === "boolean") {
          formData.append(key, value.toString());
        } else if (typeof value === "string") {
          formData.append(key, value);
        }
      });
      data.files.forEach((file) => formData.append("damagePhotos", file));

      const response = await fetch("/api/repair-orders", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to create work order");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/repair-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mechanics/workload"] });
      const typeLabel =
        customerType === "company-fleet" ? "Fleet" :
        customerType === "owner-operator" ? "Owner Operator" : "Third Party";
      toast({
        title: "Work order created",
        description: `${typeLabel} job created and auto-assigned via load balancer.`,
      });
      if (data?.invoiceWarning) {
        toast({
          title: "Invoice note",
          description: data.invoiceWarning,
          variant: "destructive",
        });
      }
      form.reset();
      setSelectedFiles([]);
      setSelectedFleetVehicle(null);
      setFleetSearch("");
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create work order. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: IntakeFormData) => {
    createWorkOrderMutation.mutate({ ...data, files: selectedFiles });
  };

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    const errors = validateFiles(fileArray);
    if (errors.length > 0) {
      toast({ title: "File validation error", description: errors.join(" "), variant: "destructive" });
      return;
    }
    setSelectedFiles(prev => [...prev, ...fileArray]);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Customer Type ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-amber-400" />
              Job Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormField control={form.control} name="customerType" render={({ field }) => (
              <FormItem>
                <FormLabel>Customer Type *</FormLabel>
                <Select onValueChange={(val) => {
                  field.onChange(val);
                  clearFleetSelection();
                }} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="max-w-xs">
                      <SelectValue placeholder="Select customer type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="company-fleet">Company Fleet</SelectItem>
                    <SelectItem value="owner-operator">Owner Operator</SelectItem>
                    <SelectItem value="third-party">Third Party</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* ── Tractor Lookup (Company Fleet only) ──────────────────────────── */}
        {isFleet && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4 text-amber-400" />
                Fleet Tractor Lookup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="fleetVehicleId" render={() => (
                <FormItem>
                  <FormLabel>Search by Tractor #, VIN, Plate, or Make/Model *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        placeholder="e.g. T-042, Freightliner, 1FUJG..."
                        value={fleetSearch}
                        onChange={(e) => {
                          setFleetSearch(e.target.value);
                          if (selectedFleetVehicle) {
                            setSelectedFleetVehicle(null);
                            form.setValue("fleetVehicleId", "");
                          }
                        }}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />

                  {showFleetDropdown && (
                    <div className="mt-1 border border-border rounded-md bg-background shadow-lg overflow-hidden">
                      {isSearching ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
                      ) : fleetResults.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">No fleet vehicles found</p>
                      ) : (
                        fleetResults.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b border-border last:border-0"
                            onClick={() => selectFleetVehicle(v)}
                          >
                            <span className="font-medium text-sm">
                              {v.tractorNumber ? `Unit ${v.tractorNumber} — ` : ""}
                              {v.year} {v.make} {v.model}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {v.vin ? `VIN: …${v.vin.slice(-6)}` : ""}
                              {v.licensePlate ? ` · ${v.licensePlate}` : ""}
                            </span>
                            {v.unitStatus && (
                              <Badge variant="outline" className="ml-2 text-xs capitalize">{v.unitStatus}</Badge>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {selectedFleetVehicle && (
                    <div className="mt-2 flex items-center justify-between p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
                      <div>
                        <p className="text-sm font-medium text-amber-400">
                          {selectedFleetVehicle.tractorNumber ? `Unit ${selectedFleetVehicle.tractorNumber} · ` : ""}
                          {selectedFleetVehicle.year} {selectedFleetVehicle.make} {selectedFleetVehicle.model}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {selectedFleetVehicle.vin ? `VIN: ${selectedFleetVehicle.vin}` : ""}
                          {selectedFleetVehicle.licensePlate ? ` · Plate: ${selectedFleetVehicle.licensePlate}` : ""}
                        </p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={clearFleetSelection}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </FormItem>
              )} />

              {selectedFleetVehicle && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 opacity-70 pointer-events-none">
                    <FormField control={form.control} name="vehicleYear" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Year</FormLabel>
                        <FormControl><Input {...field} readOnly className="bg-muted/40" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="vehicleMake" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Make</FormLabel>
                        <FormControl><Input {...field} readOnly className="bg-muted/40" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="vehicleModel" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Model</FormLabel>
                        <FormControl><Input {...field} readOnly className="bg-muted/40" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 opacity-70 pointer-events-none">
                    <FormField control={form.control} name="vin" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">VIN</FormLabel>
                        <FormControl><Input {...field} readOnly className="bg-muted/40 font-mono text-xs" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="licensePlate" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">License Plate</FormLabel>
                        <FormControl><Input {...field} readOnly className="bg-muted/40" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="mileage" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Mileage</FormLabel>
                        <FormControl><Input {...field} readOnly className="bg-muted/40" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>
              )}

              {/* Fleet-specific fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="truckType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Truck Type
                      {selectedFleetVehicle && <span className="ml-1 text-xs text-muted-foreground">(auto-filled)</span>}
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!!selectedFleetVehicle}
                    >
                      <FormControl>
                        <SelectTrigger className={selectedFleetVehicle ? "opacity-70 pointer-events-none" : ""}>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRUCK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="trailerNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trailer Number</FormLabel>
                    <FormControl><Input placeholder="TR-8821" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="odometerIn" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Odometer In (miles)</FormLabel>
                    <FormControl><Input type="number" placeholder="284500" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Client Information (Owner Operator / Third Party) ─────────────── */}
        {needsCustomer && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-amber-400" />
                Client Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="customerName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client / Company Name *</FormLabel>
                    <FormControl><Input placeholder="ABC Freight Inc." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number *</FormLabel>
                    <FormControl><Input placeholder="(555) 123-4567" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input placeholder="contact@abcfreight.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Vehicle Information (Owner Operator / Third Party) ─────────────── */}
        {needsCustomer && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4 text-amber-400" />
                Vehicle Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="vehicleYear" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year *</FormLabel>
                    <FormControl><Input placeholder="2022" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="vehicleMake" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Make *</FormLabel>
                    <FormControl><Input placeholder="Freightliner" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="vehicleModel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model *</FormLabel>
                    <FormControl><Input placeholder="Cascadia" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="truckType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Truck Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select truck type" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRUCK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="vin" render={({ field }) => (
                  <FormItem>
                    <FormLabel>VIN</FormLabel>
                    <FormControl><Input placeholder="1FUJGLDR5CLBP8217" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="licensePlate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>License Plate</FormLabel>
                    <FormControl><Input placeholder="TRK-4521" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="trailerNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trailer Number</FormLabel>
                    <FormControl><Input placeholder="TR-8821" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="odometerIn" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Odometer In (miles)</FormLabel>
                    <FormControl><Input type="number" placeholder="284500" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="color" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl><Input placeholder="White" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Service Details ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-amber-400" />
              Service Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="serviceType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select service type" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="priority" render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority Level *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="low">Low — Routine maintenance</SelectItem>
                      <SelectItem value="medium">Medium — Standard repair</SelectItem>
                      <SelectItem value="high">High — Safety critical</SelectItem>
                      <SelectItem value="urgent">Urgent — Immediate attention</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="estimatedHours" render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated Hours</FormLabel>
                  <FormControl><Input type="number" step="0.5" placeholder="4.0" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="laborRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Labor Rate ($/hr)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="125.00" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="scheduledDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Scheduled Date</FormLabel>
                  <FormControl><Input type="datetime-local" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="dotInspectionRequired" render={({ field }) => (
                <FormItem className="flex items-center space-x-3 space-y-0 pt-6">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal cursor-pointer">DOT Inspection Required</FormLabel>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="repairDescription" render={({ field }) => (
              <FormItem>
                <FormLabel>Description of Work / Issue *</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Describe the issue, requested service, or damage in detail..."
                    className="h-28"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* ── Documentation / Photos ────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CloudUpload className="h-4 w-4 text-amber-400" />
              Damage / Condition Photos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragOver ? "drag-over" : "border-border hover:border-primary"
              }`}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            >
              <CloudUpload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium mb-1">Drop photos here or click to browse</p>
              <p className="text-sm text-muted-foreground">JPG, PNG up to 10MB each</p>
              <input
                type="file"
                className="hidden"
                multiple
                accept="image/*"
                onChange={(e) => handleFileSelect(e.target.files)}
                id="file-upload"
              />
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Photos
              </Button>
            </div>

            {selectedFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">Selected ({selectedFiles.length}):</p>
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded-md">
                    <span className="text-sm text-muted-foreground truncate">{file.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() =>
                      setSelectedFiles(prev => prev.filter((_, i) => i !== index))
                    }>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Draft Invoice (Owner Operator / Third Party only) ─────────────── */}
        {needsCustomer && (
          <Card className="border-amber-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-amber-400" />
                Billing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormField control={form.control} name="createInvoice" render={({ field }) => (
                <FormItem className="flex items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div>
                    <FormLabel className="font-medium cursor-pointer">Create Draft Invoice</FormLabel>
                    <p className="text-xs text-muted-foreground mt-1">
                      A draft invoice will be generated from the estimated hours and labor rate above.
                      You can review and send it from the work order detail later.
                    </p>
                  </div>
                </FormItem>
              )} />
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="submit"
            disabled={createWorkOrderMutation.isPending}
            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8"
          >
            {createWorkOrderMutation.isPending ? "Creating..." : "Create Work Order"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
