import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/top-bar";
import IntakeForm from "@/components/forms/intake-form";
import { useLocation } from "wouter";

export default function IntakeFormPage() {
  const [, navigate] = useLocation();

  const handleSuccess = () => {
    navigate("/repairs");
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <TopBar
          title="New Intake Form"
          subtitle="Document vehicle damage and create repair order"
        />
        <div className="p-6">
          <IntakeForm onSuccess={handleSuccess} />
        </div>
      </main>
    </div>
  );
}
