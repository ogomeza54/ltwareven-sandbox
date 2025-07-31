import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import IntakeForm from "@/components/forms/intake-form";

interface IntakeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function IntakeFormModal({ open, onOpenChange }: IntakeFormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vehicle Intake Form</DialogTitle>
          <p className="text-sm text-gray-500">Document initial inspection and damage</p>
        </DialogHeader>
        <IntakeForm onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
