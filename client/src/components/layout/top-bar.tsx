import { Button } from "@/components/ui/button";
import { Bell, Plus } from "lucide-react";
import { useLocation } from "wouter";

interface TopBarProps {
  title: string;
  subtitle: string;
  onNewIntake?: () => void;
}

export default function TopBar({ title, subtitle, onNewIntake }: TopBarProps) {
  const [, navigate] = useLocation();

  const handleNewIntake = () => {
    if (onNewIntake) {
      onNewIntake();
    } else {
      navigate("/intake");
    }
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="flex items-center space-x-4">
          <button className="relative p-2 text-gray-400 hover:text-gray-600">
            <Bell className="text-lg" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              3
            </span>
          </button>
          <Button onClick={handleNewIntake} className="bg-primary text-white hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            New Intake
          </Button>
        </div>
      </div>
    </header>
  );
}
