"use client";

// Debt detail: the full month-by-month payment schedule for one installment plan
// (like the "Macbook Pro (36 Monate)" sheet). Rows are grouped by year, and each
// row's status can be toggled between Paid and To pay — which updates how many
// installments are marked paid, persisted via the /debts API.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getDebt, updateDebtPaid } from "@/lib/api";
import type { Debt } from "@/lib/types";
import { buildSchedule, monthLabel, remainingBalance } from "../schedule";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

export default function DebtDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [debt, setDebt] = useState<Debt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDebt(await getDebt(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load plan");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const schedule = useMemo(() => (debt ? buildSchedule(debt) : []), [debt]);

  // Toggle an installment's status. Payments are sequential, so marking
  // installment n as paid marks 1..n paid; marking it unpaid marks n..end unpaid.
  async function toggle(installment: number, currentlyPaid: boolean) {
    if (!debt) return;
    const paidMonths = currentlyPaid ? installment - 1 : installment;
    setSaving(true);
    setDebt({ ...debt, paidMonths }); // optimistic
    try {
      const updated = await updateDebtPaid(debt.id, paidMonths);
      setDebt(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to update");
      load(); // revert to server state
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <p className="text-center text-sm text-amber-900/60">Loading…</p>
      </main>
    );
  }

  if (!debt) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <Link href="/debts" className="text-sm text-amber-800 hover:underline">
          ← Back to debts
        </Link>
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Plan not found."}
        </p>
      </main>
    );
  }

  const left = remainingBalance(debt);
  const paidTotal = debt.totalAmount - left;

  // Group schedule rows by calendar year for the sectioned table.
  const years = Array.from(new Set(schedule.map((r) => r.year)));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <Link href="/debts" className="text-sm text-amber-800 hover:underline">
          ← Back to debts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {debt.name}{" "}
          <span className="text-amber-900/50">({debt.termMonths} Monate)</span>
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Total" value={currency.format(debt.totalAmount)} />
        <SummaryCard
          label="Monthly rate"
          value={currency.format(debt.monthlyRate)}
        />
        <SummaryCard
          label="Paid so far"
          value={currency.format(paidTotal)}
          tone="emerald"
        />
        <SummaryCard
          label="Left to pay"
          value={currency.format(left)}
          tone="rose"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-left text-xs font-semibold uppercase tracking-wide text-zinc-100">
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3 text-right">Left to pay</th>
              <th className="px-4 py-3 text-right">Monthly rate</th>
              <th className="px-4 py-3 text-right">Paid amount</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening balance row. */}
            <tr className="border-b border-amber-900/10">
              <td className="px-4 py-3 text-amber-900/50">Start</td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-900">
                {currency.format(debt.totalAmount)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-amber-900/70">
                {currency.format(debt.monthlyRate)}
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3" />
            </tr>

            {years.map((year) => (
              <YearGroup
                key={year}
                year={year}
                rows={schedule.filter((r) => r.year === year)}
                saving={saving}
                onToggle={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-amber-900/50">
        {debt.paidMonths}/{debt.termMonths} installments paid · first due{" "}
        {monthLabel(debt.startMonth)}
      </p>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: string;
  tone?: "zinc" | "emerald" | "rose";
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "rose"
        ? "text-rose-700"
        : "text-zinc-900";
  return (
    <div className="rounded-xl border border-amber-900/20 bg-white p-4 shadow-sm">
      <span className="text-xs text-amber-900/70">{label}</span>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

function YearGroup({
  year,
  rows,
  saving,
  onToggle,
}: {
  year: number;
  rows: ReturnType<typeof buildSchedule>;
  saving: boolean;
  onToggle: (installment: number, currentlyPaid: boolean) => void;
}) {
  return (
    <>
      <tr className="bg-zinc-900/90">
        <td
          colSpan={5}
          className="px-4 py-2 text-center text-sm font-semibold text-zinc-100"
        >
          {year}
        </td>
      </tr>
      {rows.map((r) => (
        <tr
          key={r.installment}
          className={`border-b border-amber-900/10 ${r.paid ? "bg-emerald-50/50" : ""}`}
        >
          <td className="px-4 py-3 text-zinc-900">{r.monthName}</td>
          <td className="px-4 py-3 text-right tabular-nums text-zinc-900">
            {currency.format(r.leftToPay)}
          </td>
          <td className="px-4 py-3 text-right tabular-nums text-amber-900/70">
            {currency.format(r.monthlyRate)}
          </td>
          <td className="px-4 py-3 text-right tabular-nums text-zinc-900">
            {currency.format(r.paidAmount)}
          </td>
          <td className="px-4 py-3 text-center">
            <button
              type="button"
              disabled={saving}
              onClick={() => onToggle(r.installment, r.paid)}
              className={`inline-flex min-w-20 items-center justify-center gap-1 rounded-md px-3 py-1 text-xs font-semibold text-white transition-colors disabled:opacity-60 ${
                r.paid
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {r.paid ? "Paid" : "To pay"}
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}
