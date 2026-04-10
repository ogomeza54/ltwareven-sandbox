import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { z } from "zod";

const mechanicFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  specialization: z.string().min(1, "Specialization is required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  cdlClass: z.string().optional(),
  hourlyRate: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
    message: "Hourly rate must be a positive number"
  }),
  maxWorkload: z.number().min(1).max(200),
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
      phone: "",
      email: "",
      cdlClass: "",
      hourlyRate: "65.00",
      maxWorkload: 40,
    },
  });

  const createMechanicMutation = useMutation({
    mutationFn: async (data: MechanicFormData) => {
      const response = await apiRequest("POST", "/api/mechanics", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mechanics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mechanics/workload"] });
      toast({ title: "Technician added successfully" });
      form.reset();
      onOpenChange(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to add technician", variant: "destructive" }),
  });

  const onSubmit = (data: MechanicFormData) => {
    createMechanicMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-slate-950 border-slate-800">
        <DialogHeader>
          <DialogTitle>Add Technician / Driver</DialogTitle>
          <DialogDescription>Add a new technician to your team.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl><Input placeholder="John Smith" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="specialization" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Specialization *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select specialization" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="General Mechanic">General Mechanic</SelectItem>
                      <SelectItem value="Engine Specialist">Engine Specialist</SelectItem>
                      <SelectItem value="Transmission Specialist">Transmission Specialist</SelectItem>
                      <SelectItem value="Brake Specialist">Brake Specialist</SelectItem>
                      <SelectItem value="Electrical Specialist">Electrical Specialist</SelectItem>
                      <SelectItem value="Diesel Specialist">Diesel Specialist</SelectItem>
                      <SelectItem value="DOT Inspection Specialist">DOT Inspection Specialist</SelectItem>
                      <SelectItem value="Body Work Specialist">Body Work Specialist</SelectItem>
                      <SelectItem value="Senior Technician">Senior Technician</SelectItem>
                      <SelectItem value="Lead Technician">Lead Technician</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl><Input placeholder="(555) 123-4567" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="tech@company.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="cdlClass" render={({ field }) => (
                <FormItem>
                  <FormLabel>CDL Class</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select CDL class" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="N/A">N/A — No CDL</SelectItem>
                      <SelectItem value="Class A">Class A — Combination</SelectItem>
                      <SelectItem value="Class B">Class B — Heavy Straight</SelectItem>
                      <SelectItem value="Class C">Class C — Small Vehicle</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="hourlyRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Hourly Rate ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="65.00" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="maxWorkload" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Max Active Hours Capacity</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" max="200" placeholder="40" {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 40)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMechanicMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMechanicMutation.isPending} className="bg-amber-500 hover:bg-amber-600 text-white">
                {createMechanicMutation.isPending ? "Adding..." : "Add Technician"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
