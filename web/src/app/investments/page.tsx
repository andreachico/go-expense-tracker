"use client";

// Investments page: list every holding you added money to in a month (stocks,
// crypto, funds, etc.) and the total. Data is persisted per user per month via
// the /investments API.
import { useCallback, useEffect, useState } from "react";
import {
  createInvestment,
  deleteInvestment,
  getInvestments,
} from "@/lib/api";
import type { Investment } from "@/lib/types";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

// Build/parse a "YYYY-MM" key for the given date.
const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function addMonths(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  return monthKey(new Date(year, m - 1 + delta, 1));
}

export default function InvestmentsPage() {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [items, setItems] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getInvestments(month));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "failed to load investments",
      );
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await createInvestment({
        name: name.trim(),
        amount: Number(amount),
        month,
      });
      setItems((prev) => [...prev, created]);
      setName("");
      setAmount("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to add investment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteInvestment(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "failed to delete investment",
      );
    }
  }

  const total = items.reduce((sum, i) => sum + i.amount, 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>
          <p className="text-sm text-amber-900/70">
            Every holding you put money into this month.
          </p>
        </div>

        <div className="flex items-center gap-1 self-start rounded-xl border border-amber-900/20 bg-white px-2 py-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-amber-900/70 hover:bg-amber-900/5"
          >
            ‹
          </button>
          <span className="min-w-36 text-center text-sm font-medium text-zinc-900">
            {monthLabel(month)}
          </span>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-amber-900/70 hover:bg-amber-900/5"
          >
            ›
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm">
        <span className="text-sm text-amber-900/70">Total invested</span>
        <div className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-emerald-700">
          {currency.format(total)}
        </div>
        <p className="mt-2 text-sm text-amber-900/60">
          {items.length} {items.length === 1 ? "holding" : "holdings"} ·{" "}
          {monthLabel(month)}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm sm:flex-row sm:items-end"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. S&P 500, Ethereum, XRP"
            required
            className="rounded-lg border border-amber-900/20 px-3 py-2 text-sm text-zinc-900 focus:border-amber-700 focus:outline-none"
          />
        </label>
        <label className="flex w-full flex-col gap-1.5 sm:w-40">
          <span className="text-sm font-medium text-zinc-700">Amount (€)</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            className="rounded-lg border border-amber-900/20 px-3 py-2 text-sm text-zinc-900 tabular-nums focus:border-amber-700 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-linear-to-r from-amber-900 to-amber-700 px-4 py-2 text-sm font-semibold text-amber-50 shadow-sm transition-all hover:from-amber-800 hover:to-amber-600 disabled:opacity-60"
        >
          {submitting ? "Adding…" : "Add investment"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm">
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-amber-900/60">
            Loading…
          </p>
        ) : items.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-amber-900/60">
            No investments added for {monthLabel(month)} yet.
          </p>
        ) : (
          <ul className="divide-y divide-amber-900/10">
            {items.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-4 px-6 py-4"
              >
                <span className="min-w-0 truncate text-sm font-medium text-zinc-900">
                  {i.name}
                </span>
                <div className="flex items-center gap-4">
                  <span className="tabular-nums text-sm font-semibold text-zinc-900">
                    {currency.format(i.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(i.id)}
                    aria-label={`Delete ${i.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
