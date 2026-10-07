"use client";

import { useState } from "react";
import type { Expense } from "@/lib/types";
import { createExpense, deleteExpense } from "@/lib/api";

const today = () => new Date().toISOString().slice(0, 10);

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
  const [error, setError] = useState<string | null>(initialError ?? null);

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

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Expense Tracker
          </h1>
          <p className="text-sm text-zinc-500">Go API · PostgreSQL · Next.js</p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Total
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {currency.format(total)}
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mb-8 grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          placeholder="Amount"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        />
        <input
          type="text"
          required
          placeholder="Category"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        />
        <input
          type="text"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="col-span-2 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        />
        <input
          type="date"
          required
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {submitting ? "Adding…" : "Add expense"}
        </button>
      </form>

      {expenses.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No expenses yet. Add your first one above.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="w-24 shrink-0">Date</span>
            <span className="flex-1 min-w-0">Description</span>
            <span className="w-28 shrink-0">Category</span>
            <span className="w-24 shrink-0 text-right">Amount</span>
            <span className="w-14 shrink-0" />
          </div>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {expenses.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-4 bg-white px-4 py-3 text-sm dark:bg-zinc-900"
              >
                <span className="w-24 shrink-0 text-zinc-500 tabular-nums">
                  {e.date}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  {e.description || "—"}
                </span>
                <span className="w-28 shrink-0">
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                    {e.category}
                  </span>
                </span>
                <span className="w-24 shrink-0 text-right font-semibold tabular-nums">
                  {currency.format(e.amount)}
                </span>
                <span className="w-14 shrink-0 text-right">
                  <button
                    onClick={() => handleDelete(e.id)}
                    aria-label={`Delete ${e.category}`}
                    className="text-zinc-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
