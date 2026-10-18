"use client";

// Investments page: each holding's running total combines buys planned in the
// Budget sheet (summed per month) with sells recorded here. A buy adds to the
// total; a sell subtracts from it. The three holdings are shown side by side,
// each listing its monthly activity. Only sells are editable — buys come from
// the budget.
import { useCallback, useEffect, useState } from "react";
import {
  createInvestmentSale,
  deleteInvestmentSale,
  getBudgetBreakdown,
  getInvestmentSales,
} from "@/lib/api";
import type { InvestmentSale } from "@/lib/types";

// The holdings shown here, mapped to their budget entry keys
// ("<section>:<row>") from the budget sheet's Investments section. Sales are
// stored under `label`, so the dropdown and the budget keys stay in sync.
const ASSETS = [
  { key: "investments:ethereum", label: "Ethereum" },
  { key: "investments:sp500", label: "S&P 500" },
  { key: "investments:xrp", label: "XRP" },
] as const;

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

// The current "YYYY-MM" month, used to seed the sell form.
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
  kind: "buy" | "sell";
  saleId?: number;
};

export default function InvestmentsPage() {
  const [breakdown, setBreakdown] = useState<
    Record<string, Record<string, number>>
  >({});
  const [sales, setSales] = useState<InvestmentSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState<string>(ASSETS[0].label);
  const [month, setMonth] = useState(() => currentMonth());
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([
        getBudgetBreakdown(),
        getInvestmentSales(),
      ]);
      setBreakdown(b);
      setSales(s);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "failed to load investments",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSell(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await createInvestmentSale({
        name,
        amount: Number(amount),
        month,
      });
      setSales((prev) => [created, ...prev]);
      setAmount("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to record sale");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteInvestmentSale(id);
      setSales((prev) => prev.filter((s) => s.id !== id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete sale");
    }
  }

  // Build each asset's rows (budget buys + recorded sells) and net total.
  const assetData = ASSETS.map((asset) => {
    const buys: Row[] = Object.entries(breakdown[asset.key] ?? {})
      .filter(([, amt]) => amt !== 0)
      .map(([m, amt]) => ({ month: m, amount: amt, kind: "buy" as const }));
    const assetSells: Row[] = sales
      .filter((s) => s.name === asset.label)
      .map((s) => ({
        month: s.month,
        amount: s.amount,
        kind: "sell" as const,
        saleId: s.id,
      }));
    const rows = [...buys, ...assetSells].sort((a, b) =>
      b.month.localeCompare(a.month),
    );
    const total =
      buys.reduce((sum, r) => sum + r.amount, 0) -
      assetSells.reduce((sum, r) => sum + r.amount, 0);
    return { ...asset, rows, total };
  });

  const overallTotal = assetData.reduce((sum, a) => sum + a.total, 0);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>
        <p className="text-sm text-amber-900/70">
          Budget buys minus sells, per holding.
        </p>
      </header>

      <div className="rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm">
        <span className="text-sm text-amber-900/70">
          Net invested (all assets)
        </span>
        <div className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-emerald-700">
          {currency.format(overallTotal)}
        </div>
      </div>

      <form
        onSubmit={handleSell}
        className="flex flex-col gap-3 rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm sm:flex-row sm:items-end"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">Sell</span>
          <select
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-amber-900/20 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-700 focus:outline-none"
          >
            {ASSETS.map((a) => (
              <option key={a.key} value={a.label}>
                {a.label}
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
          {submitting ? "Saving…" : "Record sell"}
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
          {assetData.map((asset) => (
            <section
              key={asset.key}
              className="overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm"
            >
              <div className="flex items-center justify-between gap-4 border-b border-amber-900/10 px-6 py-4">
                <h2 className="text-base font-semibold text-zinc-900">
                  {asset.label}
                </h2>
                <span className="tabular-nums text-sm font-semibold text-emerald-700">
                  {currency.format(asset.total)}
                </span>
              </div>
              {asset.rows.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-amber-900/60">
                  No activity yet.
                </p>
              ) : (
                <ul className="divide-y divide-amber-900/10">
                  {asset.rows.map((row) => (
                    <li
                      key={`${row.kind}-${row.saleId ?? row.month}`}
                      className="flex items-center justify-between gap-3 px-6 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                            row.kind === "buy"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {row.kind === "buy" ? "Buy" : "Sell"}
                        </span>
                        <span className="truncate text-sm text-amber-900/70">
                          {monthLabel(row.month)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`tabular-nums text-sm font-semibold ${
                            row.kind === "buy" ? "text-zinc-900" : "text-red-600"
                          }`}
                        >
                          {row.kind === "buy" ? "+" : "−"}
                          {currency.format(row.amount)}
                        </span>
                        {row.kind === "sell" && row.saleId !== undefined && (
                          <button
                            type="button"
                            onClick={() => handleDelete(row.saleId!)}
                            aria-label={`Delete ${asset.label} sell in ${row.month}`}
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
