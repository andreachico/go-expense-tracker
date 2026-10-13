"use client";

import { useState } from "react";
import type { Expense } from "@/lib/types";
import { createExpense, deleteExpense } from "@/lib/api";
import SpendingCharts from "./spending-charts";

const today = () => new Date().toISOString().slice(0, 10);

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

// Build a YYYY-MM key used to match an expense's date to a month/year.
const monthKey = (year: number, month: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}`;

// Budgetable categories, shared by the expense form dropdown and the budget
// table.
const CATEGORIES = [
  "Groceries",
  "Drogerie",
  "Restaurant/Food Order",
  "Freizeit",
  "Online Bestellung",
];

// The form holds strings because <input> values are strings; we convert amount
// to a number when submitting.
const emptyForm = {
  amount: "",
  category: "",
  description: "",
  date: today(),
};

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const formatDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00`));

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

// A distinct glyph per category, wrapped in a soft brown tile.
function CategoryIcon({ category }: { category: string }) {
  let glyph;
  switch (category) {
    case "Groceries":
      glyph = (
        <svg {...iconProps} aria-hidden="true">
          <path d="m5 11 4-7" />
          <path d="m19 11-4-7" />
          <path d="M2 11h20" />
          <path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L20.5 11" />
          <path d="M4.5 15.5h15" />
        </svg>
      );
      break;
    case "Drogerie":
      glyph = (
        <svg {...iconProps} aria-hidden="true">
          <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
          <path d="m8.5 8.5 7 7" />
        </svg>
      );
      break;
    case "Restaurant/Food Order":
      glyph = (
        <svg {...iconProps} aria-hidden="true">
          <path d="M3 2v7c0 1.1.9 2 2 2a2 2 0 0 0 2-2V2" />
          <path d="M7 2v20" />
          <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </svg>
      );
      break;
    case "Freizeit":
      glyph = (
        <svg {...iconProps} aria-hidden="true">
          <path d="M12 3l2.1 6.3H20l-4.9 3.6 1.9 6.1L12 15.8 7 19l1.9-6.1L4 9.3h5.9z" />
        </svg>
      );
      break;
    case "Online Bestellung":
      glyph = (
        <svg {...iconProps} aria-hidden="true">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
      break;
    default:
      glyph = (
        <svg {...iconProps} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
      {glyph}
    </span>
  );
}

function TrashIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

// ExpenseDashboard receives the server-rendered initial list and then owns it
// client-side, updating local state as the user adds and deletes expenses — no
// extra fetch on mount is needed.
export default function ExpenseDashboard({
  initialExpenses,
  initialError,
}: {
  initialExpenses: Expense[];
  initialError?: string;
}) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  // Budget targets ("soll") keyed by month then category, e.g.
  // budgets["2026-01"]["Groceries"].
  const [budgets, setBudgets] = useState<
    Record<string, Record<string, string>>
  >({});

  // Offer every year present in the data plus the current year.
  const years = Array.from(
    new Set([
      now.getFullYear(),
      ...expenses.map((e) => Number(e.date.slice(0, 4))),
    ]),
  ).sort((a, b) => b - a);

  // Changing the month/year both filters the list and sets the date new
  // expenses are saved under.
  function selectPeriod(month: number, year: number) {
    setSelectedMonth(month);
    setSelectedYear(year);
    setForm((prev) => ({ ...prev, date: `${monthKey(year, month)}-01` }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await createExpense({
        amount: Number(form.amount),
        category: form.category,
        description: form.description,
        date: form.date,
      });
      setExpenses((prev) => [...prev, created]);
      setForm({ ...emptyForm, date: form.date }); // keep the date for quick entry
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to add expense");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteExpense(id);
      setExpenses((prev) => prev.filter((x) => x.id !== id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete expense");
    }
  }

  // Only show (and total) the expenses that fall in the selected month/year.
  const visibleExpenses = expenses.filter((e) =>
    e.date.startsWith(monthKey(selectedYear, selectedMonth)),
  );
  const total = visibleExpenses.reduce((sum, e) => sum + e.amount, 0);

  // "ist" = what was actually spent in the selected month for a category.
  const istForCategory = (category: string) =>
    visibleExpenses
      .filter((e) => e.category === category)
      .reduce((sum, e) => sum + e.amount, 0);

  const periodKey = monthKey(selectedYear, selectedMonth);
  const monthBudgets = budgets[periodKey] ?? {};
  function setBudget(category: string, value: string) {
    setBudgets((prev) => ({
      ...prev,
      [periodKey]: { ...(prev[periodKey] ?? {}), [category]: value },
    }));
  }

  // Summary figures derived from the per-category budgets ("soll") and the
  // month's actual spending.
  const monthlyBudget = CATEGORIES.reduce(
    (sum, c) => sum + Number(monthBudgets[c] ?? 0),
    0,
  );
  const leftToSpend = monthlyBudget - total;
  const percentUsed =
    monthlyBudget > 0 ? Math.round((total / monthlyBudget) * 100) : 0;

  // Rows actually rendered: the month's expenses narrowed by the search box.
  const query = search.trim().toLowerCase();
  const shownExpenses = query
    ? visibleExpenses.filter(
        (e) =>
          e.description.toLowerCase().includes(query) ||
          e.category.toLowerCase().includes(query),
      )
    : visibleExpenses;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 lg:flex-row">
      <div className="min-w-0 flex-1">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Expense Tracker
        </h1>
        <p className="text-sm text-amber-900/70">Go API · PostgreSQL · Next.js</p>
      </header>

      <section className="mb-8">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-900/20 bg-white p-5 shadow-sm">
            <div className="text-sm text-amber-900/70">Total spent</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">
              {currency.format(total)}
            </div>
            <div className="mt-3 text-sm text-amber-800">
              This month · {visibleExpenses.length} expenses
            </div>
          </div>

          <div className="rounded-xl border border-amber-900/20 bg-white p-5 shadow-sm">
            <div className="text-sm text-amber-900/70">Monthly budget</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">
              {currency.format(monthlyBudget)}
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-amber-100">
              <div
                className={`h-full rounded-full ${
                  percentUsed > 100 ? "bg-red-600" : "bg-amber-800"
                }`}
                style={{ width: `${Math.min(percentUsed, 100)}%` }}
              />
            </div>
            <div className="mt-2 text-sm text-amber-800">
              {percentUsed}% of your monthly budget used
            </div>
          </div>

          <div className="rounded-xl border border-amber-900/20 bg-white p-5 shadow-sm">
            <div className="text-sm text-amber-900/70">Left to spend</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">
              {currency.format(leftToSpend)}
            </div>
            <div className="mt-3 text-sm text-amber-800">
              {leftToSpend >= 0
                ? "You're within your budget"
                : "You're over your budget"}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm">
          <table className="w-full text-sm text-zinc-900">
            <thead>
              <tr className="bg-amber-900/90 text-xs font-medium uppercase tracking-wide text-amber-50">
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-right">Soll</th>
                <th className="px-3 py-2 text-right">Ist</th>
                <th className="px-3 py-2 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-900/10">
              {CATEGORIES.map((cat) => {
                const ist = istForCategory(cat);
                const soll = Number(monthBudgets[cat] ?? "");
                const over = soll > 0 && ist > soll;
                const remaining = soll - ist;
                return (
                  <tr key={cat}>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <CategoryIcon category={cat} />
                        {cat}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={monthBudgets[cat] ?? ""}
                        onChange={(e) => setBudget(cat, e.target.value)}
                        className="w-20 rounded-md border border-amber-800/40 bg-white px-2 py-1 text-right text-sm text-zinc-900"
                      />
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${
                        over ? "text-red-700" : "text-amber-900"
                      }`}
                    >
                      {currency.format(ist)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${
                        remaining < 0 ? "text-red-700" : "text-amber-900"
                      }`}
                    >
                      {currency.format(remaining)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium text-amber-900/80">Month</label>
        <select
          value={selectedMonth}
          onChange={(e) => selectPeriod(Number(e.target.value), selectedYear)}
          className="rounded-md border border-amber-800/40 bg-white px-3 py-2 text-sm text-zinc-900"
        >
          {MONTHS.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={selectedYear}
          onChange={(e) => selectPeriod(selectedMonth, Number(e.target.value))}
          className="rounded-md border border-amber-800/40 bg-white px-3 py-2 text-sm text-zinc-900"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-900/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-900">
              Recent expenses
            </h2>
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {visibleExpenses.length}
            </span>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amber-900/40">
              <svg {...iconProps} aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search expenses…"
              className="w-64 rounded-lg border border-amber-900/20 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 border-b border-amber-900/10 bg-amber-50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-amber-900/60">
          <span className="flex-1 min-w-0">Description</span>
          <span className="w-36 shrink-0">Category</span>
          <span className="w-28 shrink-0">Date</span>
          <span className="w-28 shrink-0 text-right">Amount</span>
          <span className="w-10 shrink-0" />
        </div>

        <ul className="divide-y divide-amber-900/10">
          {shownExpenses.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-4 bg-white px-5 py-3 text-sm text-zinc-900 hover:bg-amber-50"
            >
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <CategoryIcon category={e.category} />
                <span className="truncate font-medium">
                  {e.description || "—"}
                </span>
              </span>
              <span className="w-36 shrink-0">
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {e.category}
                </span>
              </span>
              <span className="w-28 shrink-0 text-amber-900/70 tabular-nums">
                {formatDate(e.date)}
              </span>
              <span className="w-28 shrink-0 text-right font-semibold tabular-nums">
                {currency.format(e.amount)}
              </span>
              <span className="w-10 shrink-0 text-right">
                <button
                  onClick={() => handleDelete(e.id)}
                  aria-label={`Delete ${e.category}`}
                  className="text-amber-900/40 hover:text-red-600"
                >
                  <TrashIcon />
                </button>
              </span>
            </li>
          ))}

          {/* Always-present empty row for adding the next expense inline. */}
          <li className="bg-amber-50/40 px-5 py-2">
            <form onSubmit={handleSubmit} className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="min-w-0 flex-1 rounded-md border border-amber-800/40 bg-white px-2 py-1 text-sm text-zinc-900"
              />
              <select
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-36 shrink-0 rounded-md border border-amber-800/40 bg-white px-2 py-1 text-sm text-zinc-900"
              >
                <option value="" disabled>
                  Category
                </option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-28 shrink-0 rounded-md border border-amber-800/40 bg-white px-2 py-1 text-sm text-zinc-900"
              />
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-28 shrink-0 rounded-md border border-amber-800/40 bg-white px-2 py-1 text-right text-sm text-zinc-900"
              />
              <span className="w-10 shrink-0 text-right">
                <button
                  type="submit"
                  disabled={submitting}
                  className="text-sm font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50"
                >
                  {submitting ? "…" : "Add"}
                </button>
              </span>
            </form>
          </li>
        </ul>

        <div className="flex items-center justify-between border-t border-amber-900/10 px-5 py-3 text-sm text-amber-900/60">
          <span>
            Showing {shownExpenses.length} of {visibleExpenses.length} expenses
          </span>
          <span>
            Total{" "}
            <span className="font-semibold tabular-nums text-zinc-900">
              {currency.format(total)}
            </span>
          </span>
        </div>
      </div>
      </div>

      <div className="w-full shrink-0 lg:w-[380px]">
        <SpendingCharts expenses={expenses} />
      </div>
    </main>
  );
}
