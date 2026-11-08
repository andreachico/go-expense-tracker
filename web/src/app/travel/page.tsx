"use client";

// Travel fund plan: a self-contained view for planning upcoming trips. Each
// destination holds a list of plan items (accommodation, flights, food, …) with
// a budget and status. The page derives how much is already paid and how much to
// set aside each month to reach every trip on time. Everything persists to
// localStorage, so no backend round-trip is needed.
import { useEffect, useRef, useState } from "react";
import { getBudgetBreakdown, getBudgetPlan } from "@/lib/api";
import DatePicker from "../date-picker";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

// Where a single plan item stands. Only "paid" counts toward "already paid".
type ItemStatus = "todo" | "booked" | "bookedpaid" | "paid";

type TripItem = {
  id: string;
  label: string;
  note?: string;
  budget: number;
  status: ItemStatus;
  // Flights are excluded from the "without flights" subtotal, which is handy
  // when flights are booked separately or paid from a different pot.
  flight?: boolean;
};

type Destination = {
  id: string;
  city: string;
  country: string;
  month: string; // "YYYY-MM"
  from?: string; // ISO "YYYY-MM-DD" start date
  to?: string; // ISO "YYYY-MM-DD" end date
  dates?: string; // derived label, e.g. "25.03 – 29.03 · 5 days 4 nights"
  items: TripItem[];
};

const STORAGE_KEY = "travel-plan-destinations";

// Badge label + colour per status. These semantic colours stay as-is; the brown
// theme applies to the surrounding chrome.
const STATUS_META: Record<ItemStatus, { label: string; cls: string }> = {
  todo: { label: "Todo", cls: "bg-red-50 text-red-600" },
  booked: { label: "Booked – not paid", cls: "bg-amber-100 text-amber-800" },
  bookedpaid: { label: "Booked – paid", cls: "bg-sky-100 text-sky-700" },
  paid: { label: "Paid", cls: "bg-emerald-100 text-emerald-700" },
};

const STATUS_ORDER: ItemStatus[] = ["todo", "booked", "bookedpaid", "paid"];

// Seed shown on first load (before anything is saved to localStorage).
const SEED: Destination[] = [
  {
    id: "paris",
    city: "Paris",
    country: "France",
    month: "2027-03",
    dates: "25.03 – 29.03 · 5 days 4 nights",
    items: [
      { id: "p1", label: "Accommodation", note: "~ €464 total", budget: 232, status: "booked" },
      { id: "p2", label: "Flights", budget: 200, status: "todo", flight: true },
      { id: "p3", label: "Allowance / Food", budget: 200, status: "todo" },
      { id: "p4", label: "Tourist attractions entrance", budget: 122, status: "todo" },
    ],
  },
  {
    id: "lisbon",
    city: "Lisbon",
    country: "Portugal",
    month: "2027-05",
    dates: "12.05 – 16.05 · 5 days 4 nights",
    items: [
      { id: "l1", label: "Accommodation", budget: 300, status: "todo" },
      { id: "l2", label: "Flights", budget: 180, status: "todo", flight: true },
      { id: "l3", label: "Food & drinks", budget: 150, status: "todo" },
    ],
  },
  {
    id: "barcelona",
    city: "Barcelona",
    country: "Spain",
    month: "2027-09",
    dates: "03.09 – 08.09 · 6 days 5 nights",
    items: [
      { id: "b1", label: "Accommodation", budget: 350, status: "todo" },
      { id: "b2", label: "Flights", budget: 160, status: "todo", flight: true },
      { id: "b3", label: "Activities", budget: 145, status: "todo" },
    ],
  },
];

// The current "YYYY-MM" month.
const currentMonth = () => new Date().toISOString().slice(0, 7);

// Format a "YYYY-MM" key for display, e.g. "October" or "October 2026".
function monthLabel(month: string, opts: Intl.DateTimeFormatOptions): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleString("en-US", opts);
}

// Whole months from `from` to `to` (negative if `to` is in the past).
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// A short "how far away" badge for a destination relative to the picked month.
function untilLabel(delta: number): string {
  if (delta > 1) return `in ${delta} mo`;
  if (delta === 1) return "in 1 mo";
  if (delta === 0) return "this month";
  return "past";
}

const uid = () => crypto.randomUUID().slice(0, 8);

// Derived numbers for one destination. `eingezahlt` is how much has already been
// paid into this trip's sinking fund (read from the budget sheet).
function statsFor(dest: Destination, refMonth: string, eingezahlt: number) {
  const total = dest.items.reduce((s, i) => s + i.budget, 0);
  const withoutFlights = dest.items
    .filter((i) => !i.flight)
    .reduce((s, i) => s + i.budget, 0);
  const remaining = Math.max(0, total - eingezahlt);
  const monthsDelta = monthsBetween(refMonth, dest.month);
  // Spread what's left over the months until the trip; if it's due now (or past)
  // the whole remaining amount is needed.
  const perMonth =
    remaining <= 0 ? 0 : monthsDelta > 0 ? remaining / monthsDelta : remaining;
  return { total, withoutFlights, remaining, monthsDelta, perMonth, eingezahlt };
}

export default function TravelPage() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refYear, setRefYear] = useState(() => String(new Date().getFullYear()));
  // Sinking-fund deposits from the budget sheet, flattened for name matching.
  const [funds, setFunds] = useState<{ match: string; total: number }[]>([]);

  // Add/edit destination modal, and add/edit item modal.
  const [destModal, setDestModal] = useState<
    { mode: "add" } | { mode: "edit"; dest: Destination } | null
  >(null);
  const [itemModal, setItemModal] = useState<
    { destId: string; item?: TripItem } | null
  >(null);

  // Load once on mount. Same initial empty value on server & client avoids a
  // hydration mismatch; the flag then gates the save effect.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setDestinations(raw ? (JSON.parse(raw) as Destination[]) : SEED);
    } catch {
      setDestinations(SEED);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(destinations));
  }, [destinations, loaded]);

  // Load how much has already been paid into each trip's sinking fund from the
  // budget sheet. Amounts are summed across every saved month; labels come from
  // the current month's plan so trips can be matched by city name. If the
  // backend is unreachable we simply show 0.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [breakdown, plan] = await Promise.all([
          getBudgetBreakdown(),
          getBudgetPlan(currentMonth()),
        ]);
        const rows: { match: string; total: number }[] = [];
        for (const [key, months] of Object.entries(breakdown)) {
          if (!key.startsWith("sinking:")) continue;
          const total = Object.values(months).reduce((s, n) => s + n, 0);
          const label = plan[key]?.category ?? "";
          rows.push({ match: `${key} ${label}`.toLowerCase(), total });
        }
        if (active) setFunds(rows);
      } catch {
        if (active) setFunds([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Total deposited into sinking-fund rows whose key/label mentions the city.
  const eingezahltFor = (city: string) => {
    const needle = city.trim().toLowerCase();
    if (!needle) return 0;
    return funds
      .filter((f) => f.match.includes(needle))
      .reduce((s, f) => s + f.total, 0);
  };

  // --- Destination mutations ---
  function saveDestination(data: {
    city: string;
    country: string;
    month: string;
    from: string;
    to: string;
    dates: string;
  }) {
    if (destModal?.mode === "edit") {
      const id = destModal.dest.id;
      setDestinations((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...data } : d)),
      );
    } else {
      setDestinations((prev) => [
        ...prev,
        { id: uid(), ...data, items: [] },
      ]);
    }
    setDestModal(null);
  }

  function deleteDestination(id: string) {
    setDestinations((prev) => prev.filter((d) => d.id !== id));
  }

  // --- Item mutations ---
  function saveItem(data: {
    label: string;
    note: string;
    budget: number;
    status: ItemStatus;
    flight: boolean;
  }) {
    if (!itemModal) return;
    const { destId, item } = itemModal;
    setDestinations((prev) =>
      prev.map((d) => {
        if (d.id !== destId) return d;
        if (item) {
          return {
            ...d,
            items: d.items.map((it) =>
              it.id === item.id ? { ...it, ...data } : it,
            ),
          };
        }
        return { ...d, items: [...d.items, { id: uid(), ...data }] };
      }),
    );
    setItemModal(null);
  }

  function deleteItem(destId: string, itemId: string) {
    setDestinations((prev) =>
      prev.map((d) =>
        d.id === destId
          ? { ...d, items: d.items.filter((it) => it.id !== itemId) }
          : d,
      ),
    );
  }

  // Cycle an item's status on click (todo → booked → paid → todo).
  function cycleStatus(destId: string, itemId: string) {
    setDestinations((prev) =>
      prev.map((d) =>
        d.id !== destId
          ? d
          : {
              ...d,
              items: d.items.map((it) =>
                it.id !== itemId
                  ? it
                  : {
                      ...it,
                      status:
                        STATUS_ORDER[
                          (STATUS_ORDER.indexOf(it.status) + 1) %
                            STATUS_ORDER.length
                        ],
                    },
              ),
            },
      ),
    );
  }

  // --- Aggregate summary for the selected year ---
  // Saving math is always relative to the current month, not the picked year.
  const now = currentMonth();
  const yearDestinations = destinations.filter(
    (d) => d.month.slice(0, 4) === refYear,
  );
  const totalPlan = yearDestinations.reduce(
    (s, d) => s + statsFor(d, now, eingezahltFor(d.city)).total,
    0,
  );
  const alreadyPaid = yearDestinations.reduce(
    (s, d) => s + eingezahltFor(d.city),
    0,
  );
  const coveredPct = totalPlan > 0 ? alreadyPaid / totalPlan : 0;
  const saveThisMonth = yearDestinations.reduce((s, d) => {
    const st = statsFor(d, now, eingezahltFor(d.city));
    return s + (st.monthsDelta >= 0 ? st.perMonth : 0);
  }, 0);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
            Your travel fund plan.
          </h1>
          <p className="mt-2 text-base text-amber-900/70">
            A clearer picture of where your money goes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Year picker: shows every trip planned for the selected year. */}
          <div className="flex items-center gap-1 rounded-xl border border-amber-900/20 bg-white px-2 py-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setRefYear((y) => String(Number(y) - 1))}
              aria-label="Previous year"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/70 transition-colors hover:bg-amber-900/5"
            >
              <Chevron dir="left" />
            </button>
            <span className="min-w-20 text-center text-sm font-semibold text-zinc-900">
              {refYear}
            </span>
            <button
              type="button"
              onClick={() => setRefYear((y) => String(Number(y) + 1))}
              aria-label="Next year"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/70 transition-colors hover:bg-amber-900/5"
            >
              <Chevron dir="right" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setDestModal({ mode: "add" })}
            className="flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-amber-900 to-amber-700 px-4 py-3 text-sm font-semibold text-amber-50 shadow-md shadow-amber-900/20 transition-all hover:from-amber-800 hover:to-amber-600"
          >
            <PlusIcon />
            Add destination
          </button>
        </div>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Total travel plan"
          value={currency.format(totalPlan)}
          footer={`${yearDestinations.length} destination${yearDestinations.length === 1 ? "" : "s"} in ${refYear}`}
          icon={<PlaneIcon />}
        />
        <div className="rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <span className="text-sm text-amber-900/70">Already paid</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <PiggyIcon />
            </span>
          </div>
          <div className="mt-4 text-4xl font-semibold tracking-tight tabular-nums text-zinc-900">
            {currency.format(alreadyPaid)}
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-amber-900/10">
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{ width: `${Math.min(100, coveredPct * 100)}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-amber-900/60">
            {Math.round(coveredPct * 100)}% of all trips covered
          </p>
        </div>
        <SummaryCard
          label="Save each month"
          value={currency.format(saveThisMonth)}
          footer="To reach every upcoming trip on time"
          icon={<CalendarIcon />}
        />
      </div>

      {/* Destination cards for the selected year */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {yearDestinations.map((dest) => (
          <DestinationCard
            key={dest.id}
            dest={dest}
            stats={statsFor(dest, now, eingezahltFor(dest.city))}
            onEdit={() => setDestModal({ mode: "edit", dest })}
            onDelete={() => deleteDestination(dest.id)}
            onAddItem={() => setItemModal({ destId: dest.id })}
            onEditItem={(item) => setItemModal({ destId: dest.id, item })}
            onDeleteItem={(itemId) => deleteItem(dest.id, itemId)}
            onCycleStatus={(itemId) => cycleStatus(dest.id, itemId)}
          />
        ))}

        {/* Empty-state / add-another card */}
        <button
          type="button"
          onClick={() => setDestModal({ mode: "add" })}
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-amber-900/20 bg-white/40 px-6 py-14 text-center transition-colors hover:border-amber-700/40 hover:bg-amber-900/5"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <PlusIcon size={24} />
          </span>
          <span className="text-lg font-bold text-zinc-900">
            Add destination
          </span>
          <span className="text-sm text-amber-900/60">
            Start a new travel plan
          </span>
        </button>
      </div>

      {destModal && (
        <DestinationModal
          initial={destModal.mode === "edit" ? destModal.dest : undefined}
          defaultMonth={`${refYear}-01`}
          onClose={() => setDestModal(null)}
          onSubmit={saveDestination}
        />
      )}

      {itemModal && (
        <ItemModal
          initial={itemModal.item}
          onClose={() => setItemModal(null)}
          onSubmit={saveItem}
        />
      )}
    </main>
  );
}

// --- Destination card ---

function DestinationCard({
  dest,
  stats,
  onEdit,
  onDelete,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onCycleStatus,
}: {
  dest: Destination;
  stats: ReturnType<typeof statsFor>;
  onEdit: () => void;
  onDelete: () => void;
  onAddItem: () => void;
  onEditItem: (item: TripItem) => void;
  onDeleteItem: (itemId: string) => void;
  onCycleStatus: (itemId: string) => void;
}) {
  const pct = stats.total > 0 ? stats.eingezahlt / stats.total : 0;
  const dateLine = [dest.dates, monthLabel(dest.month, { month: "long", year: "numeric" })]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-900/20 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <PinIcon />
          </span>
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              {dest.city}
              {dest.country && (
                <span className="font-normal text-amber-900/60">
                  , {dest.country}
                </span>
              )}
            </h2>
            <p className="text-sm text-amber-900/70">{dateLine}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
            {untilLabel(stats.monthsDelta)}
          </span>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${dest.city}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-amber-900/5 hover:text-amber-900"
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${dest.city}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="flex flex-col gap-2 px-6 pb-4 sm:flex-row sm:items-center">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-900/10">
          <div
            className="h-full rounded-full bg-amber-700"
            style={{ width: `${Math.min(100, pct * 100)}%` }}
          />
        </div>
        <p className="text-sm text-amber-900/60">
          {currency.format(stats.eingezahlt)} of {currency.format(stats.total)}{" "}
          saved · save {currency.format(stats.perMonth)}/mo
        </p>
      </div>

      {/* Eingezahlt: total already paid into this trip's sinking fund (budget sheet) */}
      <div className="flex items-center justify-between border-t border-amber-900/10 bg-amber-50/60 px-6 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-amber-900/70">
          bereits eingezahlt
        </span>
        <span className="text-sm font-semibold tabular-nums text-emerald-700">
          {currency.format(stats.eingezahlt)}
        </span>
      </div>

      {/* Plan table */}
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col />
          <col className="w-32" />
          <col className="w-44" />
          <col className="w-16" />
        </colgroup>
        <thead>
          <tr className="bg-[#f1e8d9] text-xs font-bold uppercase tracking-wide text-amber-900">
            <th className="px-6 py-2 text-left">Plan for {dest.city}</th>
            <th className="px-3 py-2 text-center">Budget</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-900/10">
          {dest.items.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-6 py-6 text-center text-sm text-amber-900/50"
              >
                No items yet — add your first one below.
              </td>
            </tr>
          ) : (
            dest.items.map((item) => (
              <tr key={item.id} className="group hover:bg-amber-900/5">
                <td className="px-6 py-3">
                  <div className="font-medium text-zinc-900">{item.label}</div>
                  {item.note && (
                    <div className="text-xs text-amber-900/50">{item.note}</div>
                  )}
                </td>
                <td className="px-3 py-3 text-center font-semibold tabular-nums text-zinc-900">
                  {currency.format(item.budget)}
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onCycleStatus(item.id)}
                    title="Click to change status"
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${STATUS_META[item.status].cls}`}
                  >
                    {STATUS_META[item.status].label}
                  </button>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => onEditItem(item)}
                      aria-label={`Edit ${item.label}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-amber-900/5 hover:text-amber-900"
                    >
                      <PencilIcon size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteItem(item.id)}
                      aria-label={`Delete ${item.label}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
          {/* Add item row */}
          <tr>
            <td colSpan={4} className="p-0">
              <button
                type="button"
                onClick={onAddItem}
                className="flex w-full items-center gap-2 border-t border-dashed border-amber-900/15 px-6 py-3 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-900/5"
              >
                <PlusIcon size={16} />
                Add item
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr className="bg-amber-50 text-sm">
            <td className="px-6 py-3">
              <div className="font-bold text-zinc-900">Total</div>
              <div className="text-xs text-amber-900/60">
                Without flights {currency.format(stats.withoutFlights)}
              </div>
            </td>
            <td className="px-3 py-3 text-center font-bold tabular-nums text-amber-900">
              {currency.format(stats.total)}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

// --- Summary card ---

function SummaryCard({
  label,
  value,
  footer,
  icon,
}: {
  label: string;
  value: string;
  footer: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <span className="text-sm text-amber-900/70">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
          {icon}
        </span>
      </div>
      <div className="mt-4 text-4xl font-semibold tracking-tight tabular-nums text-zinc-900">
        {value}
      </div>
      <p className="mt-4 text-sm text-amber-900/60">{footer}</p>
    </div>
  );
}

// --- Modals ---

const fieldClass =
  "w-full rounded-xl border border-amber-900/15 bg-amber-50/40 px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-amber-900/30 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20";

// Build the "dd.mm – dd.mm · X days Y nights" label from an ISO date range.
function tripDates(from: string, to: string): string {
  if (!from) return "";
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${d}.${m}`;
  };
  if (!to) return fmt(from);
  const nights = Math.max(
    0,
    Math.round(
      (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000,
    ),
  );
  const days = nights + 1;
  return `${fmt(from)} – ${fmt(to)} · ${days} day${
    days !== 1 ? "s" : ""
  } ${nights} night${nights !== 1 ? "s" : ""}`;
}

function DestinationModal({
  initial,
  defaultMonth,
  onClose,
  onSubmit,
}: {
  initial?: Destination;
  defaultMonth?: string;
  onClose: () => void;
  onSubmit: (data: {
    city: string;
    country: string;
    month: string;
    from: string;
    to: string;
    dates: string;
  }) => void;
}) {
  const [city, setCity] = useState(initial?.city ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [month, setMonth] = useState(
    initial?.month ?? defaultMonth ?? currentMonth(),
  );
  const [from, setFrom] = useState(initial?.from ?? "");
  const [to, setTo] = useState(initial?.to ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit = city.trim() !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      city: city.trim(),
      country: country.trim(),
      month,
      from,
      to,
      dates: tripDates(from, to),
    });
  }

  return (
    <ModalShell
      title={initial ? "Edit destination" : "New destination"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="City">
            <input
              type="text"
              autoFocus
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Lisbon"
              className={fieldClass}
            />
          </Field>
          <Field label="Country">
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Portugal"
              className={fieldClass}
            />
          </Field>
          <Field label="Travel month">
            <MonthPicker
              value={month}
              onChange={setMonth}
              placeholder="Pick a month"
            />
          </Field>
          <Field label="Start date">
            <DatePicker
              value={from}
              onChange={setFrom}
              placeholder="Pick a start date"
            />
          </Field>
          <Field label="End date">
            <DatePicker
              value={to}
              min={from || undefined}
              onChange={setTo}
              placeholder="Pick an end date"
            />
          </Field>
        </div>
        <SubmitButton
          disabled={!canSubmit}
          label={initial ? "Save destination" : "Add destination"}
        />
      </form>
    </ModalShell>
  );
}

function ItemModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial?: TripItem;
  onClose: () => void;
  onSubmit: (data: {
    label: string;
    note: string;
    budget: number;
    status: ItemStatus;
    flight: boolean;
  }) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [budget, setBudget] = useState(
    initial ? String(initial.budget) : "",
  );
  const [status, setStatus] = useState<ItemStatus>(initial?.status ?? "todo");
  const [flight, setFlight] = useState(initial?.flight ?? false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit = label.trim() !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      label: label.trim(),
      note: note.trim(),
      budget: Number(budget) || 0,
      status,
      flight,
    });
  }

  return (
    <ModalShell title={initial ? "Edit item" : "New item"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Item">
              <input
                type="text"
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Accommodation"
                className={fieldClass}
              />
            </Field>
          </div>
          <Field label="Budget (€)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="0.00"
              className={fieldClass}
            />
          </Field>
          <Field label="Status">
            <StatusPicker value={status} onChange={setStatus} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Note (optional)">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="~ €464 total"
                className={fieldClass}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2.5 sm:col-span-2">
            <input
              type="checkbox"
              checked={flight}
              onChange={(e) => setFlight(e.target.checked)}
              className="h-4 w-4 rounded border-amber-900/30 text-amber-700 focus:ring-amber-600/20"
            />
            <span className="text-sm text-zinc-900">
              Counts as flights (excluded from the “without flights” total)
            </span>
          </label>
        </div>
        <SubmitButton
          disabled={!canSubmit}
          label={initial ? "Save item" : "Add item"}
        />
      </form>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
        aria-label={title}
      >
        <div className="mb-6 flex items-start justify-between">
          <h3 className="text-2xl font-bold tracking-tight text-zinc-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-amber-900/5 hover:text-amber-900"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-900">{label}</span>
      {children}
    </label>
  );
}

// A modern, amber-themed month picker: a styled trigger that opens a popover
// with a year navigator and a 3×4 grid of months. `value`/`onChange` use
// "YYYY-MM" strings.
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function MonthPicker({
  value,
  onChange,
  placeholder = "Select month",
}: {
  value: string;
  onChange: (month: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() =>
    Number((value || currentMonth()).slice(0, 4)),
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setYear(Number((value || currentMonth()).slice(0, 4)));
  }, [open, value]);

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

  const selYear = value ? Number(value.slice(0, 4)) : null;
  const selMonth = value ? Number(value.slice(5, 7)) : null;
  const display = value
    ? monthLabel(value, { month: "long", year: "numeric" })
    : "";

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
              onClick={() => setYear((y) => y - 1)}
              aria-label="Previous year"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/70 transition-colors hover:bg-amber-900/5"
            >
              <Chevron dir="left" />
            </button>
            <span className="text-sm font-semibold text-amber-900">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Next year"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/70 transition-colors hover:bg-amber-900/5"
            >
              <Chevron dir="right" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {MONTHS_SHORT.map((m, i) => {
              const selected = selYear === year && selMonth === i + 1;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onChange(`${year}-${String(i + 1).padStart(2, "0")}`);
                    setOpen(false);
                  }}
                  className={`rounded-lg py-2 text-sm transition-colors ${
                    selected
                      ? "bg-linear-to-br from-amber-800 to-amber-600 font-semibold text-amber-50 shadow-sm shadow-amber-900/20"
                      : "text-zinc-700 hover:bg-amber-900/5"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// A modern, amber-themed status picker: a trigger showing the current status
// badge that opens a popover of all statuses, each rendered as its coloured pill.
function StatusPicker({
  value,
  onChange,
}: {
  value: ItemStatus;
  onChange: (status: ItemStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${fieldClass} flex items-center justify-between gap-2 text-left`}
      >
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_META[value].cls}`}
        >
          {STATUS_META[value].label}
        </span>
        <span className="text-amber-900/50">
          <svg width={18} height={18} {...iconProps}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-2 rounded-2xl border border-amber-900/15 bg-white p-1.5 shadow-xl shadow-amber-900/10">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-amber-900/5 ${
                value === s ? "bg-amber-50" : ""
              }`}
            >
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_META[s].cls}`}
              >
                {STATUS_META[s].label}
              </span>
              {value === s && (
                <span className="text-amber-700">
                  <svg width={16} height={16} {...iconProps}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SubmitButton({
  disabled,
  label,
}: {
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-amber-900 to-amber-700 px-4 py-3 text-sm font-semibold text-amber-50 shadow-md shadow-amber-900/20 transition-all hover:from-amber-800 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </button>
  );
}

// --- Icons ---

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function PlusIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...iconProps}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
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

function PencilIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...iconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...iconProps}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={20} height={20} {...iconProps}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width={20} height={20} {...iconProps}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PlaneIcon() {
  return (
    <svg width={18} height={18} {...iconProps}>
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3.5s-2.5 0-4 1.5L13.5 8.5 5.3 6.7c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L8 12l-2 2H4l-1 1 3 2 2 3 1-1v-2l2-2 3.5 3.8c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z" />
    </svg>
  );
}

function PiggyIcon() {
  return (
    <svg width={18} height={18} {...iconProps}>
      <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5Z" />
      <line x1="16" y1="10" x2="16" y2="10" />
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
