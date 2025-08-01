import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { z } from "zod";

const mechanicFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  specialization: z.string().min(1, "Specialization is required"),
  hourlyRate: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
    message: "Hourly rate must be a positive number"
  }),
  maxWorkload: z.number().min(1, "Max workload must be at least 1").max(50, "Max workload cannot exceed 50"),
});

type MechanicFormData = z.infer<typeof mechanicFormSchema>;

interface MechanicFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MechanicFormModal({ open, onOpenChange }: MechanicFormModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<MechanicFormData>({
    resolver: zodResolver(mechanicFormSchema),
    defaultValues: {
      name: "",
      specialization: "",
      hourlyRate: "25.00",
      maxWorkload: 5,
    },
  });

  const createMechanicMutation = useMutation({
    mutationFn: async (data: MechanicFormData) => {
      const response = await apiRequest("POST", "/api/mechanics", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mechanics"] });
      toast({
        title: "Success",
        description: "Mechanic added successfully",
      });
      form.reset();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to add mechanic",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: MechanicFormData) => {
    createMechanicMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Mechanic</DialogTitle>
          <DialogDescription>
            Add a new mechanic to your team. Fill in their details below.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="specialization"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Specialization</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select specialization" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="General Mechanic">General Mechanic</SelectItem>
                      <SelectItem value="Engine Specialist">Engine Specialist</SelectItem>
                      <SelectItem value="Transmission Specialist">Transmission Specialist</SelectItem>
                      <SelectItem value="Brake Specialist">Brake Specialist</SelectItem>
                      <SelectItem value="Electrical Specialist">Electrical Specialist</SelectItem>
                      <SelectItem value="Body Work Specialist">Body Work Specialist</SelectItem>
                      <SelectItem value="Paint Specialist">Paint Specialist</SelectItem>
                      <SelectItem value="Senior Technician">Senior Technician</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hourlyRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hourly Rate ($)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01"
                      placeholder="25.00" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxWorkload"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maximum Concurrent Jobs</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min="1"
                      max="20"
                      placeholder="5" 
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 5)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createMechanicMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMechanicMutation.isPending}
                className="bg-primary text-white hover:bg-blue-700"
              >
                {createMechanicMutation.isPending ? "Adding..." : "Add Mechanic"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}