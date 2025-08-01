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
import { useToast } from "@/hooks/use-toast";
import { validateFiles } from "@/lib/file-upload";
import { CloudUpload, Plus, X } from "lucide-react";

const intakeFormSchema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  email: z.string().email().optional().or(z.literal("")),
  licensePlate: z.string().optional(),
  vehicleYear: z.string().min(1, "Year is required"),
  vehicleMake: z.string().min(1, "Make is required"),
  vehicleModel: z.string().min(1, "Model is required"),
  vin: z.string().optional(),
  mileage: z.string().optional(),
  color: z.string().optional(),
  repairDescription: z.string().min(1, "Repair description is required"),
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
      licensePlate: "",
      vehicleYear: "",
      vehicleMake: "",
      vehicleModel: "",
      vin: "",
      mileage: "",
      color: "",
      repairDescription: "",
      priority: "medium",
    },
  });

  const createRepairOrderMutation = useMutation({
    mutationFn: async (data: IntakeFormData & { files: File[] }) => {
      const formData = new FormData();
      
      // Append form fields
      Object.entries(data).forEach(([key, value]) => {
        if (key !== "files" && value && typeof value === "string") {
          formData.append(key, value);
        }
      });

      // Append files
      data.files.forEach((file) => {
        formData.append("damagePhotos", file);
      });

      const response = await fetch("/api/repair-orders", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to create repair order");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/repair-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Success",
        description: "Repair order created successfully and mechanic assigned!",
      });
      form.reset();
      setSelectedFiles([]);
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create repair order. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: IntakeFormData) => {
    createRepairOrderMutation.mutate({ ...data, files: selectedFiles });
  };

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;
    
    const fileArray = Array.from(files);
    const errors = validateFiles(fileArray);
    
    if (errors.length > 0) {
      toast({
        title: "File validation error",
        description: errors.join(" "),
        variant: "destructive",
      });
      return;
    }

    setSelectedFiles(prev => [...prev, ...fileArray]);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter customer name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="customer@email.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="licensePlate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>License Plate</FormLabel>
                    <FormControl>
                      <Input placeholder="ABC-1234" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Vehicle Information */}
        <Card>
          <CardHeader>
            <CardTitle>Vehicle Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="vehicleYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year *</FormLabel>
                    <FormControl>
                      <Input placeholder="2020" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vehicleMake"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Make *</FormLabel>
                    <FormControl>
                      <Input placeholder="Honda" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vehicleModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model *</FormLabel>
                    <FormControl>
                      <Input placeholder="Civic" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VIN</FormLabel>
                    <FormControl>
                      <Input placeholder="1HGBH41JXMN109186" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mileage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mileage</FormLabel>
                    <FormControl>
                      <Input placeholder="45000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <Input placeholder="Silver" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Damage Documentation */}
        <Card>
          <CardHeader>
            <CardTitle>Damage Documentation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Image Upload Area */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Damage Photos</label>
              <div 
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  dragOver ? "drag-over" : "border-gray-300 hover:border-primary"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <CloudUpload className="text-4xl text-gray-400 mb-4 mx-auto" />
                <p className="text-lg font-medium text-gray-900 mb-2">Drop photos here or click to browse</p>
                <p className="text-sm text-gray-500">Support for JPG, PNG files up to 10MB each</p>
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
                  className="mt-4"
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Photos
                </Button>
              </div>
              
              {/* Selected Files */}
              {selectedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">Selected Files:</p>
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm text-gray-600">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Repair Description */}
            <FormField
              control={form.control}
              name="repairDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Repair Description *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe the damage and required repairs in detail..."
                      className="h-32"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Priority Level */}
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority Level</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="low">Low - Routine maintenance</SelectItem>
                      <SelectItem value="medium">Medium - Standard repair</SelectItem>
                      <SelectItem value="high">High - Safety critical</SelectItem>
                      <SelectItem value="urgent">Urgent - Immediate attention</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
          <Button type="button" variant="outline">
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={createRepairOrderMutation.isPending}
            className="bg-primary text-white hover:bg-blue-700"
          >
            {createRepairOrderMutation.isPending ? "Creating..." : "Create Repair Order"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
