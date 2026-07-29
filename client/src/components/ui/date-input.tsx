import { useEffect, useRef, useState } from "react";
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

function formatUsDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value;
}

function parseUsDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function DateInput({ type = "date", value, onChange, className, id }: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayValue, setDisplayValue] = useState(() => formatUsDate(value));

  useEffect(() => {
    if (type === "date") setDisplayValue(formatUsDate(value));
  }, [type, value]);

  if (type === "datetime-local") {
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

  const commitDisplayValue = () => {
    const parsed = parseUsDate(displayValue);
    if (parsed) onChange(parsed);
    else setDisplayValue(formatUsDate(value));
  };

  return (
    <div className={cn("relative flex items-center h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-within:ring-1 focus-within:ring-ring", className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="MM/DD/YYYY"
        value={displayValue}
        onChange={(event) => {
          const next = event.target.value;
          setDisplayValue(next);
          const parsed = parseUsDate(next);
          if (parsed) onChange(parsed);
        }}
        onBlur={commitDisplayValue}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitDisplayValue();
            event.currentTarget.blur();
          }
        }}
        aria-label="Date in month, day, year format"
        className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute h-px w-px opacity-0"
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
