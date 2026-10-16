"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BudgetPlan, Expense } from "@/lib/types";
import { getIncome, saveBudgetPlan } from "@/lib/api";
import SpendingCharts, { type OverviewBucket } from "../spending-charts";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

// Format a "YYYY-MM" month key for display, e.g. "October" or "October 2026".
function monthLabel(month: string, opts: Intl.DateTimeFormatOptions): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleString("en-US", opts);
}

// Shift a "YYYY-MM" month key by a number of months.
function addMonths(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Shared props for the small summary-card icons.
const cardIcon = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

// A single planned line item. `budget`/`soll` are the seed defaults; the amounts
// are editable and persisted. `due` is an optional Fälligkeitsdatum label.
type Row = {
  id: string;
  type: string;
  category: string;
  amount: string;
  due?: string;
};

// Section definitions. Every section shares the Type / Category / Budget columns;
// those with `showDue` also render a Fälligkeitsdatum column.
type Section = {
  id: string;
  title: string;
  showDue: boolean;
  rows: Row[];
};

const FIXKOSTEN: Row[] = [
  { id: "miete", type: "Wohnen", category: "Miete", amount: "595.00", due: "03/01/2027" },
  { id: "strom", type: "Wohnen", category: "Strom", amount: "42.00", due: "07/01/2027" },
  { id: "wlan", type: "Wohnen", category: "Vodafone WLAN", amount: "10.00", due: "14/01/2027" },
  { id: "ph", type: "Family", category: "PH", amount: "400.00", due: "" },
  { id: "simkarte", type: "Phone", category: "Simkarte", amount: "12.00", due: "17/01/2027" },
  { id: "applecloud", type: "Abonnement", category: "Apple Cloud", amount: "9.99", due: "03/01/2027" },
  { id: "urbansports", type: "Abonnement", category: "Urban Sports Club", amount: "", due: "" },
  { id: "fitx", type: "Abonnement", category: "FitX", amount: "24.00", due: "01/01/2027" },
  { id: "zahnzusatz", type: "Versicherungen", category: "Zahnzusatz", amount: "20.40", due: "04/01/2027" },
  { id: "fahrkarte", type: "Abonnement", category: "Fahrkarte", amount: "59.85", due: "01/01/2027" },
];

const SINKING_FUNDS: Row[] = [
  { id: "hausrat", type: "Insurances & Bill", category: "Hausratversicherung", amount: "" },
  { id: "haftpflicht", type: "Insurances & Bill", category: "Haftpflichtversicherung", amount: "" },
  { id: "rundfunk", type: "Insurances & Bill", category: "Rundfunkbeitrag", amount: "28.00" },
  { id: "stromrechnung", type: "Insurances & Bill", category: "Strom Rechnungsbetrag", amount: "" },
  { id: "aircon", type: "PH Home", category: "Aircon 2.5HP PH", amount: "390.00" },
  { id: "newyeargift", type: "Geschenk", category: "New year gift", amount: "30.00" },
  { id: "homeph2027", type: "PH Home", category: "Home PH 2027", amount: "190.00" },
  { id: "homeph2028", type: "PH Home", category: "Home PH 2028", amount: "100.00" },
  { id: "paris", type: "Travel", category: "Paris 03/2027", amount: "" },
  { id: "goethe", type: "Alyssa in DE", category: "Alyssa Goethe Institut", amount: "" },
  { id: "alyssa2028", type: "Alyssa in DE", category: "Alyssa Germany 2028", amount: "" },
  { id: "phplane2028", type: "Travel", category: "PH plane ticket 2028", amount: "" },
  { id: "phxmas", type: "Geschenk", category: "PH Christmas Gift", amount: "" },
  { id: "dexmas", type: "Geschenk", category: "DE Christmas Gift", amount: "" },
];

const RATENZAHLUNGEN: Row[] = [
  { id: "bcn", type: "Travel", category: "BCN Flugticket", amount: "45.00", due: "24/12/2026" },
  { id: "sony", type: "Credit", category: "Sony A6400", amount: "69.87", due: "27/12/2026" },
  { id: "macbook", type: "Credit", category: 'Macbook Pro 14"', amount: "54.00", due: "25/01/2027" },
  { id: "iphone", type: "Credit", category: "iPhone", amount: "31.00", due: "24/01/2027" },
];

const BIRTHDAYS: Row[] = [
  { id: "mamadaddy", type: "Geschenk", category: "Mama/Daddy Geburtstag", amount: "" },
  { id: "monika", type: "Geschenk", category: "Monika Geburtstag", amount: "" },
  { id: "aldred", type: "Geschenk", category: "Aldred Geburtstag", amount: "" },
  { id: "joni", type: "Geschenk", category: "Joni Geburtstag", amount: "" },
  { id: "luise", type: "Geschenk", category: "Luise Geburtstag", amount: "" },
  { id: "steffi", type: "Geschenk", category: "Steffi Geburtstag", amount: "" },
];

const INVESTMENTS: Row[] = [
  { id: "sp500", type: "Investment", category: "S&P", amount: "0.00" },
  { id: "ethereum", type: "Investment", category: "Ethereum", amount: "0.00" },
  { id: "xrp", type: "Investment", category: "XRP", amount: "0.00" },
  { id: "emergency", type: "Investment", category: "Emergency Fund", amount: "0.00" },
];

const SECTIONS: Section[] = [
  { id: "fix", title: "Fixkosten", showDue: true, rows: FIXKOSTEN },
  { id: "investments", title: "Investments", showDue: false, rows: INVESTMENTS },
  { id: "sinking", title: "Sinking Funds", showDue: false, rows: SINKING_FUNDS },
  { id: "raten", title: "Ratenzahlungen", showDue: true, rows: RATENZAHLUNGEN },
  { id: "birthdays", title: "Birthdays", showDue: false, rows: BIRTHDAYS },
  { id: "others", title: "Others", showDue: false, rows: [] },
];

// Variable Kosten has its own Soll / Ist layout, kept separate from the
// Type / Category / Budget sections above.
const VARIABLE_KOSTEN: Row[] = [
  { id: "grocery", type: "Groceries & Household", category: "Grocery", amount: "200.00" },
  { id: "drogerie", type: "Groceries & Household", category: "Drogerie", amount: "50.00" },
  { id: "dining", type: "Dining Out", category: "Wolt / Restaurant", amount: "20.00" },
  { id: "leisure", type: "Leisure", category: "Freizeit/Allowance", amount: "110.00" },
];

// Editable amounts keyed by section id then row id.
type Values = Record<string, Record<string, string>>;

function seedValues(): Values {
  const seed: Values = {};
  for (const section of SECTIONS) {
    seed[section.id] = Object.fromEntries(
      section.rows.map((r) => [r.id, r.amount]),
    );
  }
  seed.variable = Object.fromEntries(
    VARIABLE_KOSTEN.map((r) => [r.id, r.amount]),
  );
  // Monthly income, kept under a synthetic "meta" section so it persists with
  // the rest of the plan.
  seed.meta = { paycheck: "2555.00" };
  return seed;
}

const sumSection = (rows: Row[], amounts: Record<string, string> = {}) =>
  rows.reduce((total, r) => total + Number(amounts[r.id] || 0), 0);

// Custom (user-added) rows kept per section id. Built-in rows live in the
// hardcoded tables above; these are the ones the user adds at runtime.
type CustomRows = Record<string, Row[]>;

// Lookup of each built-in row's labels, keyed by section id then row id, plus a
// set of built-in row ids per section so we can tell custom rows apart.
const ROW_META: Record<string, Record<string, Row>> = {};
for (const section of SECTIONS) {
  ROW_META[section.id] = Object.fromEntries(section.rows.map((r) => [r.id, r]));
}
ROW_META.variable = Object.fromEntries(VARIABLE_KOSTEN.map((r) => [r.id, r]));

const BUILTIN_IDS: Record<string, Set<string>> = {};
for (const key of Object.keys(ROW_META)) {
  BUILTIN_IDS[key] = new Set(Object.keys(ROW_META[key]));
}

// Pull user-added rows out of a backend plan: any "section:row" whose row id
// isn't a built-in one (and isn't the meta/hidden section) is a custom row.
function extractCustom(plan: BudgetPlan): CustomRows {
  const custom: CustomRows = {};
  for (const key of Object.keys(plan)) {
    const idx = key.indexOf(":");
    if (idx === -1) continue;
    const section = key.slice(0, idx);
    const row = key.slice(idx + 1);
    if (section === "meta" || section === "hidden") continue;
    if (BUILTIN_IDS[section]?.has(row)) continue;
    const entry = plan[key];
    (custom[section] ??= []).push({
      id: row,
      type: entry.type,
      category: entry.category,
      amount: String(entry.amount),
      due: entry.due,
    });
  }
  return custom;
}

// Deleted built-in rows per section. Built-in rows come from the hardcoded
// tables, so to make their deletion stick across reloads we persist a marker
// keyed "hidden:<section>:<row>".
type Hidden = Record<string, Set<string>>;

function extractHidden(plan: BudgetPlan): Hidden {
  const hidden: Hidden = {};
  for (const key of Object.keys(plan)) {
    if (!key.startsWith("hidden:")) continue;
    const rest = key.slice("hidden:".length);
    const idx = rest.indexOf(":");
    if (idx === -1) continue;
    const section = rest.slice(0, idx);
    const row = rest.slice(idx + 1);
    (hidden[section] ??= new Set()).add(row);
  }
  return hidden;
}

// Flatten the editable values + custom rows into the backend's "section:row"
// map of entries. Built-in cells persist only when filled; custom rows always
// persist (so an added row survives before an amount is typed, and deletions
// drop out of the plan). Deleted built-in rows persist as "hidden:" markers.
// The paycheck lives under "meta:paycheck".
function flatten(
  values: Values,
  customRows: CustomRows,
  hidden: Hidden,
): BudgetPlan {
  const plan: BudgetPlan = {};
  for (const section of Object.keys(values)) {
    for (const row of Object.keys(values[section])) {
      // Custom rows are persisted below with their labels.
      if (section !== "meta" && !BUILTIN_IDS[section]?.has(row)) continue;
      if (hidden[section]?.has(row)) continue; // deleted built-in row
      const raw = values[section][row];
      if (raw === "" || raw == null) continue;
      const n = Number(raw);
      if (Number.isNaN(n)) continue;
      const meta = ROW_META[section]?.[row];
      plan[`${section}:${row}`] = {
        type: meta?.type ?? "",
        category: meta?.category ?? "",
        amount: n,
        due: meta?.due,
      };
    }
  }
  for (const section of Object.keys(customRows)) {
    for (const r of customRows[section]) {
      plan[`${section}:${r.id}`] = {
        type: r.type,
        category: r.category,
        amount: Number(values[section]?.[r.id] || 0),
        due: r.due,
      };
    }
  }
  for (const section of Object.keys(hidden)) {
    for (const row of hidden[section]) {
      plan[`hidden:${section}:${row}`] = { type: "", category: "", amount: 0 };
    }
  }
  return plan;
}

// Apply a backend plan on top of the seed defaults, keyed by "section:row".
function mergePlan(seed: Values, plan: BudgetPlan): Values {
  const merged: Values = {};
  for (const key of Object.keys(seed)) merged[key] = { ...seed[key] };
  for (const key of Object.keys(plan)) {
    if (key.startsWith("hidden:")) continue;
    const idx = key.indexOf(":");
    if (idx === -1) continue;
    const section = key.slice(0, idx);
    const row = key.slice(idx + 1);
    if (!merged[section]) merged[section] = {};
    merged[section][row] = String(plan[key].amount);
  }
  return merged;
}

export default function BudgetSheet({
  month,
  expenses,
  initialPlan,
  initialOverview,
  initialError,
}: {
  month: string;
  expenses: Expense[];
  initialPlan: BudgetPlan;
  initialOverview: OverviewBucket[];
  initialError?: string;
}) {
  const router = useRouter();

  // Seed defaults merged with the plan loaded from the backend. Both the server
  // and the client start from the same props, so there's no hydration mismatch
  // and no flash of empty inputs. The component is remounted per month (keyed on
  // it in the page), so `month` is constant for this instance's lifetime.
  const [values, setValues] = useState<Values>(() =>
    mergePlan(seedValues(), initialPlan),
  );
  // User-added rows per section, reconstructed from the loaded plan.
  const [customRows, setCustomRows] = useState<CustomRows>(() =>
    extractCustom(initialPlan),
  );
  // Built-in rows the user has deleted, so they don't reappear from the seed.
  const [hidden, setHidden] = useState<Hidden>(() => extractHidden(initialPlan));

  // Monthly income (salary, side-jobs, etc.) is managed on the /income page and
  // summed here as the paycheck. Reload it whenever the month changes.
  const [incomeTotal, setIncomeTotal] = useState(0);
  useEffect(() => {
    let active = true;
    getIncome(month)
      .then((items) => {
        if (active)
          setIncomeTotal(items.reduce((sum, i) => sum + i.amount, 0));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [month]);

  // Debounced save: whenever the plan changes we wait briefly, then PUT the whole
  // month's plan to the backend, so rapid typing produces a single request. The
  // first render (initial load) is skipped so we don't immediately re-save.
  const firstRender = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveBudgetPlan(month, flatten(values, customRows, hidden)).catch(() => {
        // Ignore transient save errors; the next edit retries.
      });
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [values, customRows, hidden, month]);

  // Switch months: flush the current month immediately (keepalive lets the PUT
  // finish after we navigate), then move to the new month's URL. The page
  // re-renders this component with that month's data loaded server-side.
  function goToMonth(delta: number) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveBudgetPlan(month, flatten(values, customRows, hidden)).catch(() => {});
    router.push(`/budget?month=${addMonths(month, delta)}`);
  }

  function setAmount(sectionId: string, rowId: string, value: string) {
    setValues((prev) => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId] ?? {}), [rowId]: value },
    }));
  }

  // Add a blank custom row to a section; the user fills in its labels/amount
  // inline and every change is persisted.
  function addRow(sectionId: string) {
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    setCustomRows((prev) => ({
      ...prev,
      [sectionId]: [
        ...(prev[sectionId] ?? []),
        { id, type: "", category: "", amount: "", due: "" },
      ],
    }));
  }

  // Remove a row. Custom rows are dropped entirely; built-in rows are marked
  // hidden so they stay deleted across reloads. Either way its amount is cleared.
  function deleteRow(sectionId: string, rowId: string) {
    if (BUILTIN_IDS[sectionId]?.has(rowId)) {
      setHidden((prev) => {
        const next: Hidden = { ...prev, [sectionId]: new Set(prev[sectionId]) };
        next[sectionId].add(rowId);
        return next;
      });
    } else {
      setCustomRows((prev) => ({
        ...prev,
        [sectionId]: (prev[sectionId] ?? []).filter((r) => r.id !== rowId),
      }));
    }
    setValues((prev) => {
      const next = { ...prev, [sectionId]: { ...(prev[sectionId] ?? {}) } };
      delete next[sectionId][rowId];
      return next;
    });
  }

  // Edit a custom row's labels (type / category / due).
  function editRow(sectionId: string, rowId: string, patch: Partial<Row>) {
    setCustomRows((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] ?? []).map((r) =>
        r.id === rowId ? { ...r, ...patch } : r,
      ),
    }));
  }

  // Total of a section's visible built-in rows plus any custom rows.
  const sectionTotal = (sectionId: string, builtinRows: Row[]) =>
    builtinRows.reduce(
      (total, r) =>
        hidden[sectionId]?.has(r.id)
          ? total
          : total + Number(values[sectionId]?.[r.id] || 0),
      0,
    ) +
    (customRows[sectionId] ?? []).reduce(
      (total, r) => total + Number(values[sectionId]?.[r.id] || 0),
      0,
    );

  const variableTotal = sectionTotal("variable", VARIABLE_KOSTEN);

  // Overall expenses = every section plus the variable costs. Rest is whatever
  // is left of the paycheck after all planned costs.
  const overallExpenses =
    SECTIONS.reduce((total, s) => total + sectionTotal(s.id, s.rows), 0) +
    variableTotal;
  const paycheck = incomeTotal;
  const rest = paycheck - overallExpenses;

  // Breakdown for the "Where it went" donut: one slice per budget section.
  const whereItWent = [
    { category: "Fixkosten", amount: sectionTotal("fix", FIXKOSTEN) },
    { category: "Variable Kosten", amount: variableTotal },
    { category: "Investments", amount: sectionTotal("investments", INVESTMENTS) },
    { category: "Sinking Funds", amount: sectionTotal("sinking", SINKING_FUNDS) },
    { category: "Birthdays", amount: sectionTotal("birthdays", BIRTHDAYS) },
    { category: "Others", amount: sectionTotal("others", []) },
    { category: "Ratenzahlungen", amount: sectionTotal("raten", RATENZAHLUNGEN) },
  ];

  // Six-month overall-expenses bar chart. The last bucket is the selected month,
  // so override it with the live total as the user edits.
  const overview = initialOverview.map((bucket, i) =>
    i === initialOverview.length - 1
      ? { ...bucket, total: overallExpenses }
      : bucket,
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 lg:flex-row">
      <div className="min-w-0 flex-1">
        <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
              Your {monthLabel(month, { month: "long" })} budget sheet.
            </h1>
            <p className="mt-2 text-base text-amber-900/70">
              A clearer picture of where your money goes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Month picker: moves between months, saving the current one first. */}
            <div className="flex items-center gap-1 rounded-xl border border-amber-900/20 bg-white px-2 py-1.5 shadow-sm">
              <button
                type="button"
                onClick={() => goToMonth(-1)}
                aria-label="Previous month"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/70 transition-colors hover:bg-amber-50"
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
              <span className="min-w-32 text-center text-sm font-semibold text-zinc-900">
                {monthLabel(month, { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                onClick={() => goToMonth(1)}
                aria-label="Next month"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/70 transition-colors hover:bg-amber-50"
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
          </div>
        </header>

        {initialError && (
          <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {initialError}
          </div>
        )}

        {/* Summary: overall planned expenses, the paycheck, and what's left. */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <span className="text-sm text-amber-900/70">Overall expenses</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <svg {...cardIcon} aria-hidden="true">
                  <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
                  <path d="M21 12a2 2 0 0 0-2-2h-4a2 2 0 0 0 0 4h4a2 2 0 0 0 2-2Z" />
                </svg>
              </span>
            </div>
            <div className="mt-4 text-4xl font-semibold tracking-tight tabular-nums text-zinc-900">
              {currency.format(overallExpenses)}
            </div>
            <p className="mt-4 text-sm text-amber-900/60">
              Sum of all sheet sections
            </p>
          </div>

          <Link
            href="/income"
            className="group block rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm transition-colors hover:border-amber-700/40 hover:bg-amber-50/40"
          >
            <div className="flex items-start justify-between">
              <span className="text-sm text-amber-900/70">Paycheck</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <svg {...cardIcon} aria-hidden="true">
                  <line x1="17" y1="7" x2="7" y2="17" />
                  <polyline points="17 17 7 17 7 7" />
                </svg>
              </span>
            </div>
            <div className="mt-4 text-4xl font-semibold tracking-tight tabular-nums text-zinc-900">
              {currency.format(paycheck)}
            </div>
            <p className="mt-4 flex items-center gap-1 text-sm text-amber-900/60">
              Monthly income
              <span className="font-medium text-amber-800 underline-offset-2 group-hover:underline">
                · manage sources →
              </span>
            </p>
          </Link>

          <div className="rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <span className="text-sm text-amber-900/70">Rest</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <svg {...cardIcon} aria-hidden="true">
                  <line x1="7" y1="17" x2="17" y2="7" />
                  <polyline points="7 7 17 7 17 17" />
                </svg>
              </span>
            </div>
            <div
              className={`mt-4 text-4xl font-semibold tracking-tight tabular-nums ${
                rest < 0 ? "text-red-700" : "text-zinc-900"
              }`}
            >
              {currency.format(rest)}
            </div>
            <p
              className={`mt-4 flex items-center gap-1.5 text-sm ${
                rest < 0 ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {rest >= 0 ? (
                <svg {...cardIcon} className="h-4 w-4" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : null}
              {rest >= 0
                ? "Left after all planned costs"
                : "Over your paycheck"}
            </p>
          </div>
        </div>

        {/* Fixkosten first, then Variable Kosten, then the remaining sections. */}
        <CostSection
          section={SECTIONS[0]}
          amounts={values[SECTIONS[0].id] ?? {}}
          custom={customRows[SECTIONS[0].id] ?? []}
          hidden={hidden[SECTIONS[0].id]}
          onChange={setAmount}
          onAddRow={addRow}
          onDeleteRow={deleteRow}
          onEditRow={editRow}
        />

        <VariableSection
          rows={VARIABLE_KOSTEN}
          amounts={values.variable ?? {}}
          custom={customRows.variable ?? []}
          hidden={hidden.variable}
          total={variableTotal}
          onChange={(rowId, value) => setAmount("variable", rowId, value)}
          onAddRow={() => addRow("variable")}
          onDeleteRow={(rowId) => deleteRow("variable", rowId)}
          onEditRow={(rowId, patch) => editRow("variable", rowId, patch)}
        />

        {SECTIONS.slice(1).map((section) => (
          <CostSection
            key={section.id}
            section={section}
            amounts={values[section.id] ?? {}}
            custom={customRows[section.id] ?? []}
            hidden={hidden[section.id]}
            onChange={setAmount}
            onAddRow={addRow}
            onDeleteRow={deleteRow}
            onEditRow={editRow}
          />
        ))}
      </div>

      <div className="w-full shrink-0 lg:w-[380px]">
        <SpendingCharts
          expenses={expenses}
          whereItWent={whereItWent}
          overview={overview}
        />
      </div>
    </main>
  );
}

// Reusable section for the Type / Category / Budget (+ optional due date) tables.
function CostSection({
  section,
  amounts,
  custom,
  hidden,
  onChange,
  onAddRow,
  onDeleteRow,
  onEditRow,
}: {
  section: Section;
  amounts: Record<string, string>;
  custom: Row[];
  hidden?: Set<string>;
  onChange: (sectionId: string, rowId: string, value: string) => void;
  onAddRow: (sectionId: string) => void;
  onDeleteRow: (sectionId: string, rowId: string) => void;
  onEditRow: (sectionId: string, rowId: string, patch: Partial<Row>) => void;
}) {
  const builtinRows = section.rows.filter((r) => !hidden?.has(r.id));
  const total =
    sumSection(builtinRows, amounts) +
    custom.reduce((t, r) => t + Number(amounts[r.id] || 0), 0);
  const itemCount = builtinRows.length + custom.length;
  const colCount = (section.showDue ? 4 : 3) + 1; // + actions column

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            {section.title}
          </h2>
          <p className="text-sm text-amber-900/60">{itemCount} items</p>
        </div>
        <div className="text-2xl font-semibold tabular-nums text-zinc-900">
          {currency.format(total)}
        </div>
      </div>

      <table className="w-full text-sm text-zinc-900">
        <thead>
          <tr className="bg-amber-900/90 text-xs font-medium uppercase tracking-wide text-amber-50">
            <th className="px-5 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">Category</th>
            <th className="px-3 py-2 text-right">Budget</th>
            {section.showDue && (
              <th className="px-5 py-2 text-left">Fälligkeitsdatum</th>
            )}
            <th className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-900/10">
          {itemCount === 0 ? (
            <tr>
              <td
                colSpan={colCount}
                className="px-5 py-10 text-center text-amber-900/50"
              >
                No items yet.
              </td>
            </tr>
          ) : (
            <>
              {builtinRows.map((r) => (
                <tr key={r.id} className="hover:bg-amber-50">
                  <td className="px-5 py-2 text-amber-900/70">{r.type}</td>
                  <td className="px-3 py-2 font-medium">{r.category}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="—"
                      value={amounts[r.id] ?? ""}
                      onChange={(e) => onChange(section.id, r.id, e.target.value)}
                      className="w-24 rounded-md bg-transparent px-2 py-1 text-right text-sm text-zinc-900 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none"
                    />
                  </td>
                  {section.showDue && (
                    <td className="px-5 py-2 text-amber-900/70 tabular-nums">
                      {r.due || "—"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    <DeleteButton
                      onClick={() => onDeleteRow(section.id, r.id)}
                      label={`Delete ${r.category || "row"}`}
                    />
                  </td>
                </tr>
              ))}
              {custom.map((r) => (
                <tr key={r.id} className="hover:bg-amber-50">
                  <td className="px-5 py-2">
                    <input
                      type="text"
                      placeholder="Type"
                      value={r.type}
                      onChange={(e) =>
                        onEditRow(section.id, r.id, { type: e.target.value })
                      }
                      className="w-full rounded-md bg-transparent px-2 py-1 text-sm text-amber-900/70 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      placeholder="Category"
                      value={r.category}
                      onChange={(e) =>
                        onEditRow(section.id, r.id, { category: e.target.value })
                      }
                      className="w-full rounded-md bg-transparent px-2 py-1 text-sm font-medium text-zinc-900 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="—"
                      value={amounts[r.id] ?? ""}
                      onChange={(e) => onChange(section.id, r.id, e.target.value)}
                      className="w-24 rounded-md bg-transparent px-2 py-1 text-right text-sm text-zinc-900 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none"
                    />
                  </td>
                  {section.showDue && (
                    <td className="px-5 py-2">
                      <input
                        type="text"
                        placeholder="dd/mm/yyyy"
                        value={r.due ?? ""}
                        onChange={(e) =>
                          onEditRow(section.id, r.id, { due: e.target.value })
                        }
                        className="w-32 rounded-md bg-transparent px-2 py-1 text-sm text-amber-900/70 tabular-nums hover:bg-amber-50 focus:bg-amber-50 focus:outline-none"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    <DeleteButton
                      onClick={() => onDeleteRow(section.id, r.id)}
                      label={`Delete ${r.category || "row"}`}
                    />
                  </td>
                </tr>
              ))}
            </>
          )}
          <AddRow colSpan={colCount} onClick={() => onAddRow(section.id)} />
        </tbody>
        <tfoot>
          <tr className="border-t border-amber-900/10 bg-amber-50">
            <td className="px-5 py-3 font-semibold text-zinc-900" colSpan={2}>
              Total {section.title}
            </td>
            <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">
              {currency.format(total)}
            </td>
            {section.showDue && <td />}
            <td />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

// Variable Kosten with its distinct Soll / Ist columns.
function VariableSection({
  rows,
  amounts,
  custom,
  hidden,
  total,
  onChange,
  onAddRow,
  onDeleteRow,
  onEditRow,
}: {
  rows: Row[];
  amounts: Record<string, string>;
  custom: Row[];
  hidden?: Set<string>;
  total: number;
  onChange: (rowId: string, value: string) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
  onEditRow: (rowId: string, patch: Partial<Row>) => void;
}) {
  const builtinRows = rows.filter((r) => !hidden?.has(r.id));
  const itemCount = builtinRows.length + custom.length;

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Variable Kosten</h2>
          <p className="text-sm text-amber-900/60">{itemCount} items</p>
        </div>
        <div className="text-2xl font-semibold tabular-nums text-zinc-900">
          {currency.format(total)}
        </div>
      </div>

      <table className="w-full text-sm text-zinc-900">
        <thead>
          <tr className="bg-amber-900/90 text-xs font-medium uppercase tracking-wide text-amber-50">
            <th className="px-5 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">Category</th>
            <th className="px-3 py-2 text-right">Soll</th>
            <th className="px-5 py-2 text-right">Ist</th>
            <th className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-900/10">
          {builtinRows.map((r) => (
            <tr key={r.id} className="hover:bg-amber-50">
              <td className="px-5 py-2 text-amber-900/70">{r.type}</td>
              <td className="px-3 py-2 font-medium">{r.category}</td>
              <td className="px-3 py-2 text-right">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="—"
                  value={amounts[r.id] ?? ""}
                  onChange={(e) => onChange(r.id, e.target.value)}
                  className="w-24 rounded-md bg-transparent px-2 py-1 text-right text-sm text-zinc-900 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none"
                />
              </td>
              <td className="px-5 py-2 text-right text-amber-900/50">—</td>
              <td className="px-3 py-2 text-right">
                <DeleteButton
                  onClick={() => onDeleteRow(r.id)}
                  label={`Delete ${r.category || "row"}`}
                />
              </td>
            </tr>
          ))}
          {custom.map((r) => (
            <tr key={r.id} className="hover:bg-amber-50">
              <td className="px-5 py-2">
                <input
                  type="text"
                  placeholder="Type"
                  value={r.type}
                  onChange={(e) => onEditRow(r.id, { type: e.target.value })}
                  className="w-full rounded-md bg-transparent px-2 py-1 text-sm text-amber-900/70 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="text"
                  placeholder="Category"
                  value={r.category}
                  onChange={(e) => onEditRow(r.id, { category: e.target.value })}
                  className="w-full rounded-md bg-transparent px-2 py-1 text-sm font-medium text-zinc-900 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none"
                />
              </td>
              <td className="px-3 py-2 text-right">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="—"
                  value={amounts[r.id] ?? ""}
                  onChange={(e) => onChange(r.id, e.target.value)}
                  className="w-24 rounded-md bg-transparent px-2 py-1 text-right text-sm text-zinc-900 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none"
                />
              </td>
              <td className="px-5 py-2 text-right text-amber-900/50">—</td>
              <td className="px-3 py-2 text-right">
                <DeleteButton
                  onClick={() => onDeleteRow(r.id)}
                  label={`Delete ${r.category || "row"}`}
                />
              </td>
            </tr>
          ))}
          <AddRow colSpan={5} onClick={onAddRow} />
        </tbody>
        <tfoot>
          <tr className="border-t border-amber-900/10 bg-amber-50">
            <td className="px-5 py-3 font-semibold text-zinc-900" colSpan={2}>
              Total Variable Kosten
            </td>
            <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">
              {currency.format(total)}
            </td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

// A full-width clickable row that appends a new line item, styled with the warm
// amber gradient used for the add-expense row on the dashboard.
function AddRow({
  colSpan,
  onClick,
}: {
  colSpan: number;
  onClick: () => void;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center gap-2 border-t border-amber-200/60 bg-linear-to-r from-amber-50/60 to-amber-100/30 px-5 py-3 text-left text-sm font-medium text-amber-900 transition-colors hover:from-amber-100/60 hover:to-amber-100/40"
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
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add row
        </button>
      </td>
    </tr>
  );
}

// Small trash-icon button used to remove a custom row.
function DeleteButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-900/40 transition-colors hover:bg-red-50 hover:text-red-600"
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
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>
  );
}
