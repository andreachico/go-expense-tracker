"use client";

// A modern, amber-themed date picker: a styled trigger that opens a calendar
// popover. `value`/`onChange` use ISO "YYYY-MM-DD" strings; `min` disables
// earlier days. Weeks start on Monday. Shared by the travel planner and the
// year-at-a-glance views so the date field looks and behaves identically.
import { useEffect, useRef, useState } from "react";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const fieldClass =
  "w-full rounded-xl border border-amber-900/15 bg-amber-50/40 px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-amber-900/30 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20";

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// The current "YYYY-MM" month.
const currentMonth = () => new Date().toISOString().slice(0, 7);

// Format a "YYYY-MM" key for display, e.g. "October 2026".
function monthLabel(month: string, opts: Intl.DateTimeFormatOptions): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleString("en-US", opts);
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width={18} height={18} {...iconProps}>
      {dir === "left" ? (
        <polyline points="15 18 9 12 15 6" />
      ) : (
        <polyline points="9 18 15 12 9 6" />
      )}
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width={18} height={18} {...iconProps}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export default function DatePicker({
  value,
  min,
  onChange,
  placeholder = "Select date",
}: {
  value: string;
  min?: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() =>
    value ? value.slice(0, 7) : currentMonth(),
  );
  const ref = useRef<HTMLDivElement>(null);

  // Keep the calendar on the selected month whenever it (re)opens.
  useEffect(() => {
    if (open) setView(value ? value.slice(0, 7) : currentMonth());
  }, [open, value]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const [vy, vm] = view.split("-").map(Number);
  const startWeekday = (new Date(vy, vm - 1, 1).getDay() + 6) % 7; // Mon-first
  const daysInMonth = new Date(vy, vm, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isoFor = (d: number) =>
    `${vy}-${String(vm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayIso = new Date().toISOString().slice(0, 10);

  const display = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

  function shiftMonth(delta: number) {
    const d = new Date(vy, vm - 1 + delta, 1);
    setView(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${fieldClass} flex items-center justify-between gap-2 text-left`}
      >
        <span className={display ? "text-zinc-900" : "text-amber-900/40"}>
          {display || placeholder}
        </span>
        <span className="text-amber-900/50">
          <CalendarIcon />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-amber-900/15 bg-white p-4 shadow-xl shadow-amber-900/10">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/70 transition-colors hover:bg-amber-900/5"
            >
              <Chevron dir="left" />
            </button>
            <span className="text-sm font-semibold text-amber-900">
              {monthLabel(view, { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/70 transition-colors hover:bg-amber-900/5"
            >
              <Chevron dir="right" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-amber-900/40">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={`e${i}`} />;
              const iso = isoFor(d);
              const selected = value === iso;
              const isToday = iso === todayIso;
              const disabled = min ? iso < min : false;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={`flex h-9 items-center justify-center rounded-lg text-sm transition-colors ${
                    selected
                      ? "bg-linear-to-br from-amber-800 to-amber-600 font-semibold text-amber-50 shadow-sm shadow-amber-900/20"
                      : isToday
                        ? "font-semibold text-amber-900 ring-1 ring-inset ring-amber-600/40 hover:bg-amber-900/5"
                        : "text-zinc-700 hover:bg-amber-900/5"
                  } disabled:cursor-not-allowed disabled:text-amber-900/20 disabled:hover:bg-transparent`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="mt-3 w-full rounded-lg py-1.5 text-xs font-medium text-amber-900/60 transition-colors hover:bg-amber-900/5 hover:text-amber-900"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
