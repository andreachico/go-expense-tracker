"use client";

// Savings page: each fund's running total combines deposits planned in the
// Budget sheet (summed per month) with withdrawals recorded here. A deposit adds
// to the total; a withdrawal subtracts from it. The three funds are shown side
// by side, each listing its monthly activity. Only withdrawals are editable —
// deposits come from the budget.
import { useCallback, useEffect, useState } from "react";
import {
  createSaving,
  deleteSaving,
  getBudgetBreakdown,
  getSavings,
} from "@/lib/api";
import type { Saving } from "@/lib/types";

// The funds shown here, mapped to their budget entry keys ("<section>:<row>")
// from the budget sheet's Savings section. Withdrawals are stored under `label`,
// so the dropdown and the budget keys stay in sync.
const FUNDS = [
  { key: "savings:emergency", label: "Emergency Fund" },
  { key: "savings:travel", label: "Travel Fund" },
  { key: "savings:ph", label: "PH Fund" },
] as const;

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

// The current "YYYY-MM" month, used to seed the withdrawal form.
const currentMonth = () => new Date().toISOString().slice(0, 7);

// Format a "YYYY-MM" key as e.g. "October 2026".
function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

type Row = {
  month: string;
  amount: number;
  kind: "deposit" | "withdrawal";
  savingId?: number;
};

export default function SavingsPage() {
  const [breakdown, setBreakdown] = useState<
    Record<string, Record<string, number>>
  >({});
  const [withdrawals, setWithdrawals] = useState<Saving[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState<string>(FUNDS[0].label);
  const [month, setMonth] = useState(() => currentMonth());
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([getBudgetBreakdown(), getSavings()]);
      setBreakdown(b);
      setWithdrawals(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load savings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await createSaving({
        name,
        amount: Number(amount),
        month,
      });
      setWithdrawals((prev) => [created, ...prev]);
      setAmount("");
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "failed to record withdrawal",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteSaving(id);
      setWithdrawals((prev) => prev.filter((s) => s.id !== id));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "failed to delete withdrawal",
      );
    }
  }

  // Build each fund's rows (budget deposits + recorded withdrawals) and net total.
  const fundData = FUNDS.map((fund) => {
    const deposits: Row[] = Object.entries(breakdown[fund.key] ?? {})
      .filter(([, amt]) => amt !== 0)
      .map(([m, amt]) => ({ month: m, amount: amt, kind: "deposit" as const }));
    const fundWithdrawals: Row[] = withdrawals
      .filter((s) => s.name === fund.label)
      .map((s) => ({
        month: s.month,
        amount: s.amount,
        kind: "withdrawal" as const,
        savingId: s.id,
      }));
    const rows = [...deposits, ...fundWithdrawals].sort((a, b) =>
      b.month.localeCompare(a.month),
    );
    const total =
      deposits.reduce((sum, r) => sum + r.amount, 0) -
      fundWithdrawals.reduce((sum, r) => sum + r.amount, 0);
    return { ...fund, rows, total };
  });

  const overallTotal = fundData.reduce((sum, f) => sum + f.total, 0);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Savings</h1>
        <p className="text-sm text-amber-900/70">
          Budget deposits minus withdrawals, per fund.
        </p>
      </header>

      <div className="rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm">
        <span className="text-sm text-amber-900/70">
          Total saved (all funds)
        </span>
        <div className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-emerald-700">
          {currency.format(overallTotal)}
        </div>
      </div>

      <form
        onSubmit={handleWithdraw}
        className="flex flex-col gap-3 rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm sm:flex-row sm:items-end"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Withdraw from</span>
          <select
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-amber-900/20 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-700 focus:outline-none"
          >
            {FUNDS.map((f) => (
              <option key={f.key} value={f.label}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-full flex-col gap-1.5 sm:w-40">
          <span className="text-sm font-medium text-zinc-700">Month</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            required
            className="rounded-lg border border-amber-900/20 px-3 py-2 text-sm text-zinc-900 focus:border-amber-700 focus:outline-none"
          />
        </label>
        <label className="flex w-full flex-col gap-1.5 sm:w-32">
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
          {submitting ? "Saving…" : "Record withdrawal"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="px-6 py-8 text-center text-sm text-amber-900/60">
          Loading…
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {fundData.map((fund) => (
            <section
              key={fund.key}
              className="overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm"
            >
              <div className="flex items-center justify-between gap-4 border-b border-amber-900/10 px-6 py-4">
                <h2 className="text-base font-semibold text-zinc-900">
                  {fund.label}
                </h2>
                <span className="tabular-nums text-sm font-semibold text-emerald-700">
                  {currency.format(fund.total)}
                </span>
              </div>
              {fund.rows.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-amber-900/60">
                  No activity yet.
                </p>
              ) : (
                <ul className="divide-y divide-amber-900/10">
                  {fund.rows.map((row) => (
                    <li
                      key={`${row.kind}-${row.savingId ?? row.month}`}
                      className="flex items-center justify-between gap-3 px-6 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                            row.kind === "deposit"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {row.kind === "deposit" ? "Deposit" : "Withdraw"}
                        </span>
                        <span className="truncate text-sm text-amber-900/70">
                          {monthLabel(row.month)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`tabular-nums text-sm font-semibold ${
                            row.kind === "deposit"
                              ? "text-zinc-900"
                              : "text-red-600"
                          }`}
                        >
                          {row.kind === "deposit" ? "+" : "−"}
                          {currency.format(row.amount)}
                        </span>
                        {row.kind === "withdrawal" &&
                          row.savingId !== undefined && (
                            <button
                              type="button"
                              onClick={() => handleDelete(row.savingId!)}
                              aria-label={`Delete ${fund.label} withdrawal in ${row.month}`}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              <svg
                                width="15"
                                height="15"
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
                          )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
