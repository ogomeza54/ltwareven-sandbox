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
    <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="relative p-2 text-slate-400 hover:text-slate-200 transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              3
            </span>
          </button>
          <Button
            onClick={handleNewIntake}
            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Intake
          </Button>
        </div>
      </div>
    </header>
  );
}
