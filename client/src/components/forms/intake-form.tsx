import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { validateFiles } from "@/lib/file-upload";
import { CloudUpload, Plus, X, Truck, User, Wrench, AlertTriangle } from "lucide-react";
import { SERVICE_TYPES, TRUCK_TYPES } from "@shared/schema";

const intakeFormSchema = z.object({
  // Customer
  customerName: z.string().min(1, "Customer name is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  email: z.string().email().optional().or(z.literal("")),
  // Vehicle
  vehicleYear: z.string().min(1, "Year is required"),
  vehicleMake: z.string().min(1, "Make is required"),
  vehicleModel: z.string().min(1, "Model is required"),
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
});

type IntakeFormData = z.infer<typeof intakeFormSchema>;

interface IntakeFormProps {
  onSuccess?: () => void;
}

export default function IntakeForm({ onSuccess }: IntakeFormProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<IntakeFormData>({
    resolver: zodResolver(intakeFormSchema),
    defaultValues: {
      customerName: "",
      phoneNumber: "",
      email: "",
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
    },
  });

  const createWorkOrderMutation = useMutation({
    mutationFn: async (data: IntakeFormData & { files: File[] }) => {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (key !== "files" && value !== undefined && value !== null && value !== "") {
          if (typeof value === "boolean") {
            formData.append(key, value.toString());
          } else if (typeof value === "string") {
            formData.append(key, value);
          }
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/repair-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mechanics/workload"] });
      toast({ title: "Work order created", description: "Driver auto-assigned via load balancer." });
      form.reset();
      setSelectedFiles([]);
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

        {/* Client Information */}
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

        {/* Vehicle / Fleet Information */}
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
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="vin" render={({ field }) => (
                <FormItem>
                  <FormLabel>VIN</FormLabel>
                  <FormControl><Input placeholder="1FUJGLDR5CLBP8217" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="licensePlate" render={({ field }) => (
                <FormItem>
                  <FormLabel>License Plate</FormLabel>
                  <FormControl><Input placeholder="TRK-4521" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="trailerNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Trailer Number</FormLabel>
                  <FormControl><Input placeholder="TR-8821" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="odometerIn" render={({ field }) => (
                <FormItem>
                  <FormLabel>Odometer In (miles)</FormLabel>
                  <FormControl><Input type="number" placeholder="284500" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="color" render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl><Input placeholder="White" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </CardContent>
        </Card>

        {/* Service Details */}
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
                  <FormMessage />
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
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="laborRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Labor Rate ($/hr)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="125.00" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="scheduledDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Scheduled Date</FormLabel>
                  <FormControl><Input type="datetime-local" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="dotInspectionRequired" render={({ field }) => (
                <FormItem className="flex items-center space-x-3 space-y-0 pt-6">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal cursor-pointer">
                    DOT Inspection Required
                  </FormLabel>
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

        {/* Documentation / Photos */}
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

        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={createWorkOrderMutation.isPending} className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8">
            {createWorkOrderMutation.isPending ? "Creating..." : "Create Work Order"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
