"use client";

// Year at a Glance: a calendar overview of the whole year showing public
// holidays, birthdays and vacation days at once. German public holidays are
// computed per year (including Easter-based movable dates); the user can add
// their own birthdays and vacation days, which persist to localStorage.
import { useEffect, useMemo, useState } from "react";
import BudgetDropdown from "../budget-dropdown";
import DatePicker from "../date-picker";

// The kinds of day a user can mark. Public holidays are seeded automatically;
// the others are user-added.
type EventType = "holiday" | "birthday" | "vacation" | "sick";

// Which year's vacation allowance a vacation day is drawn from. In Germany,
// leftover days from the previous year ("Resturlaub") may usually be taken until
// the end of March of the following year.
type Allowance = "current" | "previous";

type CalEvent = {
  id: string;
  date: string; // ISO "YYYY-MM-DD"
  type: EventType;
  label: string;
  // Only meaningful for vacation; defaults to the day's own calendar year.
  allowance?: Allowance;
};

const STORAGE_KEY = "year-overview:events";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Single-letter weekday labels, indexed by Date.getDay() (0 = Sunday).
const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

// A distinct accent per month column: a soft pastel header with a dark, same-hue
// month name, plus a matching tint used to shade that column's weekend cells.
const MONTH_THEMES = [
  { header: "bg-rose-700", text: "text-rose-100", weekend: "bg-rose-50" },
  { header: "bg-teal-700", text: "text-teal-100", weekend: "bg-teal-50" },
  { header: "bg-amber-700", text: "text-amber-100", weekend: "bg-amber-50" },
  { header: "bg-blue-700", text: "text-blue-100", weekend: "bg-blue-50" },
  { header: "bg-lime-700", text: "text-lime-100", weekend: "bg-lime-50" },
  { header: "bg-fuchsia-700", text: "text-fuchsia-100", weekend: "bg-fuchsia-50" },
  { header: "bg-emerald-700", text: "text-emerald-100", weekend: "bg-emerald-50" },
  { header: "bg-orange-700", text: "text-orange-100", weekend: "bg-orange-50" },
  { header: "bg-indigo-700", text: "text-indigo-100", weekend: "bg-indigo-50" },
  { header: "bg-pink-700", text: "text-pink-100", weekend: "bg-pink-50" },
  { header: "bg-cyan-700", text: "text-cyan-100", weekend: "bg-cyan-50" },
  { header: "bg-violet-700", text: "text-violet-100", weekend: "bg-violet-50" },
];

// Colours per event type. `cell`/`text` are the light tint + saturated text used
// for the legend, summary cards and modal; `cellStrong`/`textStrong` are the dark
// background + pastel text used for an event's day inside the calendar grid.
const EVENT_STYLES: Record<
  EventType,
  {
    label: string;
    dot: string;
    text: string;
    cell: string;
    cellStrong: string;
    textStrong: string;
  }
> = {
  holiday: {
    label: "Holiday",
    dot: "bg-red-500",
    text: "text-red-600",
    cell: "bg-red-50",
    cellStrong: "bg-red-300",
    textStrong: "text-red-700",
  },
  birthday: {
    label: "Birthday",
    dot: "bg-sky-500",
    text: "text-sky-600",
    cell: "bg-sky-50",
    cellStrong: "bg-sky-300",
    textStrong: "text-sky-700",
  },
  vacation: {
    label: "Vacation",
    dot: "bg-orange-400",
    text: "text-orange-600",
    cell: "bg-orange-50",
    cellStrong: "bg-orange-200",
    textStrong: "text-orange-700",
  },
  sick: {
    label: "Sick",
    dot: "bg-purple-500",
    text: "text-purple-600",
    cell: "bg-purple-50",
    cellStrong: "bg-purple-300",
    textStrong: "text-purple-700",
  },
};

const EVENT_ORDER: EventType[] = ["holiday", "birthday", "vacation", "sick"];

// Order of the event types offered in the Add-event modal's Type dropdown.
const TYPE_OPTIONS: EventType[] = ["birthday", "vacation", "sick"];

// Labels for the vacation "allowance year" dropdown.
const ALLOWANCE_ORDER: Allowance[] = ["current", "previous"];
const ALLOWANCE_LABELS: Record<Allowance, string> = {
  current: "This year's vacation",
  previous: "Last year's vacation (carryover)",
};

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;
const daysInMonth = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();
// True when an ISO "YYYY-MM-DD" date falls on a Saturday or Sunday.
const isWeekendISO = (iso: string) => {
  const day = new Date(`${iso}T00:00:00`).getDay();
  return day === 0 || day === 6;
};
// The year whose vacation allowance a day is charged to. Days marked as
// "previous" count toward the year before the one they fall in (carryover).
const allowanceYearOf = (e: CalEvent) =>
  Number(e.date.slice(0, 4)) - (e.allowance === "previous" ? 1 : 0);

// Easter Sunday for a given year (Meeus/Jones/Butcher Gregorian algorithm).
// Returns the 0-based month and the day, used to derive movable German holidays.
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month: month - 1, day };
}

// Public holidays in Berlin for the year, as seeded calendar events. Movable
// feast days are derived from Easter, so this stays correct for any year.
function berlinHolidays(year: number): CalEvent[] {
  const e = easterSunday(year);
  const easter = new Date(year, e.month, e.day);
  const offset = (days: number) => {
    const d = new Date(easter);
    d.setDate(d.getDate() + days);
    return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const fixed = (month: number, day: number) => isoDate(year, month, day);
  const items: Array<{ date: string; label: string }> = [
    { date: fixed(0, 1), label: "Neujahr" },
    { date: offset(-2), label: "Karfreitag" },
    { date: offset(1), label: "Ostermontag" },
    { date: fixed(4, 1), label: "Tag der Arbeit" },
    { date: offset(39), label: "Christi Himmelfahrt" },
    { date: offset(50), label: "Pfingstmontag" },
    { date: fixed(9, 3), label: "Tag der Deutschen Einheit" },
    { date: fixed(11, 25), label: "1. Weihnachtstag" },
    { date: fixed(11, 26), label: "2. Weihnachtstag" },
  ];
  // Internationaler Frauentag is a public holiday in Berlin since 2019.
  if (year >= 2019) {
    items.push({ date: fixed(2, 8), label: "Internationaler Frauentag" });
  }
  return items.map((it) => ({
    id: `holiday-${it.date}`,
    date: it.date,
    type: "holiday" as const,
    label: it.label,
  }));
}

export default function YearOverview() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  // The day whose modal is open (ISO date), or "" for a blank Add-event modal,
  // or null when closed.
  const [modalDate, setModalDate] = useState<string | null>(null);

  // Load persisted user events once on the client, after mount. Starting empty
  // on both server and client keeps the initial render identical.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setEvents(JSON.parse(stored));
    } catch {
      // Ignore malformed/unavailable storage.
    }
    setLoaded(true);
  }, []);

  // Save user events whenever they change.
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch {
      // Ignore storage errors (e.g. private mode / quota).
    }
  }, [events, loaded]);

  // Seeded holidays for the selected year, combined with the user's own events.
  const holidays = useMemo(() => berlinHolidays(year), [year]);
  const yearPrefix = `${year}-`;
  const userEventsThisYear = events.filter((e) => e.date.startsWith(yearPrefix));
  const allEvents = useMemo(
    () => [...holidays, ...userEventsThisYear],
    [holidays, userEventsThisYear],
  );

  // Index events by date for quick cell lookups.
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of allEvents) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [allEvents]);

  const holidayCount = allEvents.filter((e) => e.type === "holiday").length;
  const birthdayCount = allEvents.filter((e) => e.type === "birthday").length;
  // Vacation is charged to its allowance year (carryover days count toward the
  // previous year), so this looks at every event, not just this year's dates.
  const vacationCount = events.filter(
    (e) =>
      e.type === "vacation" &&
      !isWeekendISO(e.date) &&
      allowanceYearOf(e) === year,
  ).length;
  const sickCount = allEvents.filter(
    (e) => e.type === "sick" && !isWeekendISO(e.date),
  ).length;

  function addEvent(
    date: string,
    type: EventType,
    label: string,
    allowance?: Allowance,
  ) {
    const ev: CalEvent = {
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      date,
      type,
      label: label.trim(),
      ...(type === "vacation" ? { allowance: allowance ?? "current" } : {}),
    };
    setEvents((prev) => [...prev, ev]);
  }

  function deleteEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  // This view is entirely client-driven (localStorage events + the current
  // date), so we render a static shell during SSR and the first client render,
  // then swap in the real calendar once mounted. Keeping both initial renders
  // identical avoids any hydration mismatch.
  if (!loaded) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
        <div className="h-64 animate-pulse rounded-2xl bg-amber-900/5" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-amber-800 to-amber-600 text-amber-50 shadow-md shadow-amber-900/20">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              My year at a glance.
            </h1>
            <p className="text-sm text-amber-900/70">
              A clearer picture of the year ahead.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Year picker, matching the prev/next control used elsewhere. */}
          <div className="flex items-center gap-1 rounded-xl border border-amber-900/20 bg-white px-2 py-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              aria-label="Previous year"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/70 transition-colors hover:bg-amber-900/5"
            >
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="min-w-20 text-center text-sm font-semibold text-zinc-900">
              {year}
            </span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Next year"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/70 transition-colors hover:bg-amber-900/5"
            >
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setModalDate("")}
            className="flex items-center gap-2 rounded-xl bg-linear-to-r from-amber-900 to-amber-700 px-4 py-2.5 text-sm font-semibold text-amber-50 shadow-md shadow-amber-900/20 transition-all hover:from-amber-800 hover:to-amber-600"
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add event
          </button>
        </div>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          type="holiday"
          title="Holidays"
          value={holidayCount}
          caption={`Public holidays in ${year}`}
        />
        <SummaryCard
          type="birthday"
          title="Birthdays"
          value={birthdayCount}
          caption="Don't forget a gift"
        />
        <SummaryCard
          type="vacation"
          title="Vacation days"
          value={vacationCount}
          caption="Planned days off"
        />
        <SummaryCard
          type="sick"
          title="Sick days"
          value={sickCount}
          caption="Days off sick"
        />
      </div>

      {/* Calendar grid */}
      <section className="rounded-2xl border border-amber-900/15 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">
              {year} at a glance
            </h2>
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Click a day to add an event
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {EVENT_ORDER.map((t) => (
              <span key={t} className="flex items-center gap-1.5 text-sm">
                <span className={`h-2.5 w-2.5 rounded-sm ${EVENT_STYLES[t].dot}`} />
                <span className={`font-bold ${EVENT_STYLES[t].text}`}>
                  {EVENT_STYLES[t].label}
                </span>
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-sm">
              <span className="h-2.5 w-2.5 rounded-sm bg-violet-200" />
              <span className="text-violet-500">Weekend</span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {MONTHS.map((m, mi) => (
                  <th
                    key={m}
                    className={`min-w-28 border border-white px-3 py-2 text-center text-xs font-extrabold uppercase tracking-wide ${MONTH_THEMES[mi].header} ${MONTH_THEMES[mi].text}`}
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 31 }, (_, row) => {
                const day = row + 1;
                return (
                  <tr key={day}>
                    {MONTHS.map((_, mi) => {
                      if (day > daysInMonth(year, mi)) {
                        return (
                          <td
                            key={mi}
                            className="border border-amber-900/5 bg-zinc-50/50"
                          />
                        );
                      }
                      const date = isoDate(year, mi, day);
                      const weekday = new Date(year, mi, day).getDay();
                      const isWeekend = weekday === 0 || weekday === 6;
                      const dayEvents = eventsByDate.get(date) ?? [];
                      const primary = dayEvents[0];
                      // Weekends keep their own tint even when an event is set;
                      // only weekday events get the strong event background.
                      const cellTint = isWeekend
                        ? MONTH_THEMES[mi].weekend
                        : primary
                          ? EVENT_STYLES[primary.type].cellStrong
                          : "";
                      return (
                        <td
                          key={mi}
                          onClick={() => setModalDate(date)}
                          className={`cursor-pointer border border-amber-900/5 px-2 py-1.5 align-top transition-colors ${primary ? "" : "hover:bg-amber-900/5"} ${cellTint}`}
                        >
                          <div className="flex items-baseline gap-1">
                            <span
                              className={`font-medium ${primary ? "text-zinc-800" : "text-zinc-700"}`}
                            >
                              {day}
                            </span>
                            <span
                              className={`text-[10px] uppercase ${primary ? EVENT_STYLES[primary.type].textStrong : "text-zinc-400"}`}
                            >
                              {WEEKDAY_LETTER[weekday]}
                            </span>
                            {primary && (
                              <span
                                className={`ml-1 truncate text-xs font-bold ${EVENT_STYLES[primary.type].textStrong}`}
                                title={dayEvents.map((e) => e.label).join(", ")}
                              >
                                {primary.label}
                                {dayEvents.length > 1
                                  ? ` +${dayEvents.length - 1}`
                                  : ""}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {modalDate !== null && (
        <DayModal
          date={modalDate}
          events={modalDate ? (eventsByDate.get(modalDate) ?? []) : []}
          onAdd={addEvent}
          onDelete={deleteEvent}
          onClose={() => setModalDate(null)}
        />
      )}
    </main>
  );
}

function SummaryCard({
  type,
  title,
  value,
  caption,
}: {
  type: EventType;
  title: string;
  value: number;
  caption: string;
}) {
  const style = EVENT_STYLES[type];
  return (
    <div
      className={`rounded-2xl border border-amber-900/10 p-6 shadow-sm ${style.cell}`}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-amber-900/70">
        <span className={`h-2.5 w-2.5 rounded-sm ${style.dot}`} />
        {title}
      </p>
      <p className="mt-1 text-4xl font-bold tracking-tight text-zinc-900">
        {value}
      </p>
      <p className="mt-3 text-sm text-amber-900/50">{caption}</p>
    </div>
  );
}

// Modal to view/add/delete events for a day. When opened from the "Add event"
// button the date starts blank and the user picks it; when opened from a cell it
// is prefilled and shows that day's existing events with delete buttons.
function DayModal({
  date,
  events,
  onAdd,
  onDelete,
  onClose,
}: {
  date: string;
  events: CalEvent[];
  onAdd: (
    date: string,
    type: EventType,
    label: string,
    allowance?: Allowance,
  ) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [formDate, setFormDate] = useState(date);
  const [endDate, setEndDate] = useState(date);
  const [type, setType] = useState<EventType>("birthday");
  const [label, setLabel] = useState("");
  const [allowance, setAllowance] = useState<Allowance>("current");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isRange = type === "vacation" || type === "sick";
  const canSubmit =
    formDate.trim() !== "" &&
    label.trim() !== "" &&
    (!isRange || (endDate.trim() !== "" && endDate >= formDate));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const allow = type === "vacation" ? allowance : undefined;
    if (isRange) {
      // Add a vacation entry for every day from "von" to "bis" (inclusive).
      const start = new Date(`${formDate}T00:00:00`);
      const end = new Date(`${endDate}T00:00:00`);
      for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
        onAdd(
          isoDate(d.getFullYear(), d.getMonth(), d.getDate()),
          type,
          label,
          allow,
        );
      }
    } else {
      onAdd(formDate, type, label, allow);
    }
    setLabel("");
  }

  const fieldClass =
    "w-full rounded-xl border border-amber-900/15 bg-amber-50/40 px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-amber-900/30 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20";

  const heading = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Add event";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Day events"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-zinc-900">
              {heading}
            </h3>
            <p className="mt-0.5 text-sm text-amber-900/60">
              Vacation, birthdays &amp; sickness
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-amber-900/5 hover:text-amber-900"
          >
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {events.length > 0 && (
          <ul className="mb-5 flex flex-col gap-2">
            {events.map((ev) => (
              <li
                key={ev.id}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${EVENT_STYLES[ev.type].cell}`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-sm ${EVENT_STYLES[ev.type].dot}`}
                  />
                  <span className="text-sm font-medium text-zinc-800">
                    {ev.label}
                  </span>
                  {ev.type === "vacation" && ev.allowance === "previous" && (
                    <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900/60">
                      Carryover {allowanceYearOf(ev)}
                    </span>
                  )}
                </span>
                {ev.type === "holiday" ? (
                  <span className="text-xs text-amber-900/40">Public holiday</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDelete(ev.id)}
                    aria-label={`Delete ${ev.label}`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-amber-900/40 transition-colors hover:bg-white hover:text-red-600"
                  >
                    <svg
                      width={16}
                      height={16}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900">
                {isRange ? "From (von)" : "Date"}
              </span>
              <DatePicker
                value={formDate}
                onChange={(iso) => {
                  setFormDate(iso);
                  if (endDate < iso) setEndDate(iso);
                }}
                placeholder={isRange ? "Pick a start date" : "Pick a date"}
              />
            </label>

            {isRange && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-zinc-900">
                  To (bis)
                </span>
                <DatePicker
                  value={endDate}
                  min={formDate || undefined}
                  onChange={setEndDate}
                  placeholder="Pick an end date"
                />
              </label>
            )}

            <label
              className={`flex flex-col gap-1.5 ${isRange ? "sm:col-span-2" : ""}`}
            >
              <span className="text-sm font-medium text-zinc-900">Type</span>
              <BudgetDropdown
                value={EVENT_STYLES[type].label}
                options={TYPE_OPTIONS.map((t) => EVENT_STYLES[t].label)}
                onChange={(label) => {
                  const found = TYPE_OPTIONS.find(
                    (t) => EVENT_STYLES[t].label === label,
                  );
                  if (found) setType(found);
                }}
                placeholder="Select a type"
                ariaLabel="Type"
              />
            </label>

            {type === "vacation" && (
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-sm font-medium text-zinc-900">
                  Deduct from
                </span>
                <BudgetDropdown
                  value={ALLOWANCE_LABELS[allowance]}
                  options={ALLOWANCE_ORDER.map((a) => ALLOWANCE_LABELS[a])}
                  onChange={(lbl) => {
                    const found = ALLOWANCE_ORDER.find(
                      (a) => ALLOWANCE_LABELS[a] === lbl,
                    );
                    if (found) setAllowance(found);
                  }}
                  placeholder="Select vacation year"
                  ariaLabel="Vacation allowance year"
                />
              </label>
            )}

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-zinc-900">Label</span>
              <input
                type="text"
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Mum's birthday"
                className={fieldClass}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-amber-900 to-amber-700 px-4 py-3 text-sm font-semibold text-amber-50 shadow-md shadow-amber-900/20 transition-all hover:from-amber-800 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add event
          </button>
        </form>
      </div>
    </div>
  );
}
