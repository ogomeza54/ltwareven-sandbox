import { useRef } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface DateInputProps {
  type?: "date" | "datetime-local";
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}

export function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowLocalValue(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  return now.toISOString().slice(0, 16);
}

export default function DateInput({ type = "date", value, onChange, className, id }: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn("flex items-center h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-within:ring-1 focus-within:ring-ring", className)}>
      <input
        ref={inputRef}
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-transparent outline-none text-foreground [color-scheme:dark] min-w-0"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => {
          try { inputRef.current?.showPicker(); } catch { inputRef.current?.focus(); }
        }}
        className="ml-1 shrink-0 text-muted-foreground hover:text-amber-400 transition-colors"
        aria-label="Open calendar"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
    </div>
  );
}
