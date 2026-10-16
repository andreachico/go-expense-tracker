"use client";

// Debts page: two tables — one-time debts (a single full payment due in a month)
// and installment plans (Ratenzahlungen). The total owed at the top is the sum of
// both. Data is persisted per user via the /debts API.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  createDebt,
  deleteDebt,
  getDebts,
  updateDebt,
  updateDebtPaid,
} from "@/lib/api";
import type { Debt, NewDebt } from "@/lib/types";
import { monthLabel, remainingBalance } from "./schedule";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// Shared styling for the inline row-edit inputs.
const EDIT_INPUT =
  "w-full min-w-0 rounded-md border border-amber-900/20 px-2 py-1 text-sm text-zinc-900 focus:border-amber-700 focus:outline-none";

export default function DebtsPage() {
  const [items, setItems] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // One-time debt form.
  const [oneName, setOneName] = useState("");
  const [oneAmount, setOneAmount] = useState("");
  const [oneMonth, setOneMonth] = useState(() => monthKey(new Date()));
  const [oneBusy, setOneBusy] = useState(false);

  // Installment plan form.
  const [name, setName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [monthlyRate, setMonthlyRate] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [startMonth, setStartMonth] = useState(() => monthKey(new Date()));
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getDebts());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load debts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddOneTime(e: React.FormEvent) {
    e.preventDefault();
    setOneBusy(true);
    try {
      const created = await createDebt({
        kind: "onetime",
        name: oneName.trim(),
        totalAmount: Number(oneAmount),
        startMonth: oneMonth,
      });
      setItems((prev) => [...prev, created]);
      setOneName("");
      setOneAmount("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to add debt");
    } finally {
      setOneBusy(false);
    }
  }

  async function handleAddInstallment(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await createDebt({
        kind: "installment",
        name: name.trim(),
        totalAmount: Number(totalAmount),
        monthlyRate: Number(monthlyRate),
        termMonths: Number(termMonths),
        startMonth,
      });
      setItems((prev) => [...prev, created]);
      setName("");
      setTotalAmount("");
      setMonthlyRate("");
      setTermMonths("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to add plan");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteDebt(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete debt");
    }
  }

  async function handleTogglePaid(d: Debt) {
    const paidMonths = d.paidMonths >= 1 ? 0 : 1;
    try {
      const updated = await updateDebtPaid(d.id, paidMonths);
      setItems((prev) => prev.map((i) => (i.id === d.id ? updated : i)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to update");
    }
  }

  // Inline row editing. A single draft holds every editable field; which ones
  // are shown depends on the row's kind.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    totalAmount: "",
    monthlyRate: "",
    termMonths: "",
    startMonth: "",
  });

  function startEdit(d: Debt) {
    setEditingId(d.id);
    setDraft({
      name: d.name,
      totalAmount: String(d.totalAmount),
      monthlyRate: String(d.monthlyRate),
      termMonths: String(d.termMonths),
      startMonth: d.startMonth,
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(d: Debt) {
    setSavingEdit(true);
    try {
      const input: NewDebt =
        d.kind === "onetime"
          ? {
              kind: "onetime",
              name: draft.name.trim(),
              totalAmount: Number(draft.totalAmount),
              startMonth: draft.startMonth,
            }
          : {
              kind: "installment",
              name: draft.name.trim(),
              totalAmount: Number(draft.totalAmount),
              monthlyRate: Number(draft.monthlyRate),
              termMonths: Number(draft.termMonths),
              startMonth: draft.startMonth,
            };
      const updated = await updateDebt(d.id, input);
      setItems((prev) => prev.map((i) => (i.id === d.id ? updated : i)));
      setEditingId(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  }

  const oneTime = items.filter((i) => i.kind === "onetime");
  const installments = items.filter((i) => i.kind === "installment");
  const totalOwed = items.reduce((sum, i) => sum + remainingBalance(i), 0);



  return (
    <main className="mx-auto flex w-full max-w-none flex-1 flex-col gap-8 px-6 py-10 lg:px-12 xl:px-16">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Debts</h1>
        <p className="text-sm text-amber-900/70">
          One-time debts and installment plans. The total is the sum of both.
        </p>
      </header>

      <div className="mx-auto w-full max-w-md rounded-xl border border-amber-900/20 bg-white p-6 text-center shadow-sm">
        <span className="text-sm text-amber-900/70">Total still owed</span>
        <div className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-rose-700">
          {currency.format(totalOwed)}
        </div>
        <p className="mt-2 text-sm text-amber-900/60">
          {oneTime.length} one-time · {installments.length} installment{" "}
          {installments.length === 1 ? "plan" : "plans"}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* ---------- One-time debts ---------- */}
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-zinc-900">One-time debts</h2>
          <p className="-mt-1 text-sm text-amber-900/70">
            A single full payment due in a month.
          </p>

          <form
            onSubmit={handleAddOneTime}
            className="grid grid-cols-1 gap-3 rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-zinc-700">Name</span>
              <input
                type="text"
                value={oneName}
                onChange={(e) => setOneName(e.target.value)}
                placeholder="e.g. Tax bill, Dentist"
                required
                className="rounded-lg border border-amber-900/20 px-3 py-2 text-sm text-zinc-900 focus:border-amber-700 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                Amount (€)
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={oneAmount}
                onChange={(e) => setOneAmount(e.target.value)}
                placeholder="250"
                required
                className="rounded-lg border border-amber-900/20 px-3 py-2 text-sm tabular-nums text-zinc-900 focus:border-amber-700 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                Due month
              </span>
              <input
                type="month"
                value={oneMonth}
                onChange={(e) => setOneMonth(e.target.value)}
                required
                className="rounded-lg border border-amber-900/20 px-3 py-2 text-sm text-zinc-900 focus:border-amber-700 focus:outline-none"
              />
            </label>
            <div className="flex items-end sm:col-span-2">
              <button
                type="submit"
                disabled={oneBusy}
                className="rounded-lg bg-linear-to-r from-amber-900 to-amber-700 px-4 py-2 text-sm font-semibold text-amber-50 shadow-sm transition-all hover:from-amber-800 hover:to-amber-600 disabled:opacity-60"
              >
                {oneBusy ? "Adding…" : "Add one-time debt"}
              </button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-xl border border-amber-900/20 bg-white shadow-sm">
            {loading ? (
              <p className="px-6 py-8 text-center text-sm text-amber-900/60">
                Loading…
              </p>
            ) : oneTime.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-amber-900/60">
                No one-time debts yet. Add one above.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-amber-900/15 bg-amber-50/60 text-left text-xs font-semibold uppercase tracking-wide text-amber-900/70">
                    <th className="px-6 py-3">Name</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-900/10">
                  {oneTime.map((i) => {
                    const paid = i.paidMonths >= 1;
                    const editing = editingId === i.id;
                    return (
                      <tr key={i.id} className={paid ? "bg-emerald-50/40" : ""}>
                        <td className="px-6 py-4 font-medium text-zinc-900">
                          {editing ? (
                            <input
                              type="text"
                              value={draft.name}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, name: e.target.value }))
                              }
                              className={EDIT_INPUT}
                            />
                          ) : (
                            i.name
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold tabular-nums text-rose-700">
                          {editing ? (
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={draft.totalAmount}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  totalAmount: e.target.value,
                                }))
                              }
                              className={`${EDIT_INPUT} text-right`}
                            />
                          ) : (
                            currency.format(i.totalAmount)
                          )}
                        </td>
                        <td className="px-4 py-4 text-amber-900/70">
                          {editing ? (
                            <input
                              type="month"
                              value={draft.startMonth}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  startMonth: e.target.value,
                                }))
                              }
                              className={EDIT_INPUT}
                            />
                          ) : (
                            monthLabel(i.startMonth)
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleTogglePaid(i)}
                            className={`inline-flex min-w-20 items-center justify-center rounded-md px-3 py-1 text-xs font-semibold text-white transition-colors ${
                              paid
                                ? "bg-emerald-600 hover:bg-emerald-700"
                                : "bg-blue-600 hover:bg-blue-700"
                            }`}
                          >
                            {paid ? "Paid" : "To pay"}
                          </button>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <RowActions
                            editing={editing}
                            saving={savingEdit}
                            name={i.name}
                            onEdit={() => startEdit(i)}
                            onSave={() => saveEdit(i)}
                            onCancel={cancelEdit}
                            onDelete={() => handleDelete(i.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ---------- Installment plans ---------- */}
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-zinc-900">
            Installment plans (Ratenzahlungen)
          </h2>
          <p className="-mt-1 text-sm text-amber-900/70">
            Paid off in fixed monthly rates. Click a plan to see its full
            schedule.
          </p>

          <form
            onSubmit={handleAddInstallment}
            className="grid grid-cols-1 gap-3 rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
          >
            <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
              <span className="text-sm font-medium text-zinc-700">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tickets, Online Order"
                required
                className="rounded-lg border border-amber-900/20 px-3 py-2 text-sm text-zinc-900 focus:border-amber-700 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">
                Total (€)
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="1945"
                required
                className="rounded-lg border border-amber-900/20 px-3 py-2 text-sm tabular-nums text-zinc-900 focus:border-amber-700 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Rate (€)</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={monthlyRate}
                onChange={(e) => setMonthlyRate(e.target.value)}
                placeholder="54"
                required
                className="rounded-lg border border-amber-900/20 px-3 py-2 text-sm tabular-nums text-zinc-900 focus:border-amber-700 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Months</span>
              <input
                type="number"
                step="1"
                min="1"
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
                placeholder="36"
                required
                className="rounded-lg border border-amber-900/20 px-3 py-2 text-sm tabular-nums text-zinc-900 focus:border-amber-700 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-700">Start</span>
                <input
                  type="month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  required
                  className="rounded-lg border border-amber-900/20 px-3 py-2 text-sm text-zinc-900 focus:border-amber-700 focus:outline-none"
                />
              </label>
              <div className="flex items-end sm:col-span-2 lg:col-span-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-linear-to-r from-amber-900 to-amber-700 px-4 py-2 text-sm font-semibold text-amber-50 shadow-sm transition-all hover:from-amber-800 hover:to-amber-600 disabled:opacity-60"
                >
                  {submitting ? "Adding…" : "Add plan"}
                </button>
              </div>
            </form>

          <div className="overflow-x-auto rounded-xl border border-amber-900/20 bg-white shadow-sm">
            {loading ? (
              <p className="px-6 py-8 text-center text-sm text-amber-900/60">
                Loading…
              </p>
            ) : installments.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-amber-900/60">
              No installment plans yet. Add one above.
            </p>
          ) : (
            <table className="w-full min-w-130 text-sm">
              <thead>
                <tr className="border-b border-amber-900/15 bg-amber-50/60 text-left text-xs font-semibold uppercase tracking-wide text-amber-900/70">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-3 py-3 text-center">Monthly rate</th>
                  <th className="px-3 py-3 text-center">Left to pay</th>
                  <th className="px-3 py-3 text-center">Progress</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-900/10">
                {installments.map((i) => {
                  const left = remainingBalance(i);
                  const done = i.paidMonths >= i.termMonths;
                  const editing = editingId === i.id;
                  return (
                    <tr key={i.id} className="group hover:bg-amber-50/40">
                      <td className="px-4 py-4 align-top">
                        {editing ? (
                          <div className="flex flex-col gap-2">
                            <input
                              type="text"
                              value={draft.name}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, name: e.target.value }))
                              }
                              className={EDIT_INPUT}
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step="1"
                                min="1"
                                value={draft.termMonths}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    termMonths: e.target.value,
                                  }))
                                }
                                className={`${EDIT_INPUT} w-16`}
                                aria-label="Months"
                              />
                              <span className="text-xs text-amber-900/60">
                                months · from
                              </span>
                              <input
                                type="month"
                                value={draft.startMonth}
                                onChange={(e) =>
                                  setDraft((d) => ({
                                    ...d,
                                    startMonth: e.target.value,
                                  }))
                                }
                                className={EDIT_INPUT}
                                aria-label="Start month"
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <Link
                              href={`/debts/${i.id}`}
                              className="font-medium text-zinc-900 hover:text-amber-800 hover:underline"
                            >
                              {i.name}
                            </Link>
                            <div className="text-xs text-amber-900/60">
                              {i.termMonths} months · from{" "}
                              {monthLabel(i.startMonth)}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-4 text-center align-top tabular-nums text-zinc-900">
                        {editing ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={draft.monthlyRate}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                monthlyRate: e.target.value,
                              }))
                            }
                            className={`${EDIT_INPUT} text-center`}
                          />
                        ) : (
                          currency.format(i.monthlyRate)
                        )}
                      </td>
                      <td className="px-3 py-4 text-center align-top font-semibold tabular-nums text-rose-700">
                        {currency.format(left)}
                      </td>
                      <td className="px-3 py-4 align-top">
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-amber-900/10">
                            <div
                              className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-amber-500"}`}
                              style={{
                                width: `${(i.paidMonths / i.termMonths) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-amber-900/60">
                            {i.paidMonths}/{i.termMonths}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-right align-top">
                        <RowActions
                          editing={editing}
                          saving={savingEdit}
                          name={i.name}
                          onEdit={() => startEdit(i)}
                          onSave={() => saveEdit(i)}
                          onCancel={cancelEdit}
                          onDelete={() => handleDelete(i.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

// RowActions shows Edit + Delete buttons normally, and Save + Cancel while the
// row is being edited.
function RowActions({
  editing,
  saving,
  name,
  onEdit,
  onSave,
  onCancel,
  onDelete,
}: {
  editing: boolean;
  saving: boolean;
  name: string;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-amber-900/20 px-2.5 py-1 text-xs font-semibold text-amber-900/70 transition-colors hover:bg-amber-50 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${name}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-amber-50 hover:text-amber-800"
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
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
      <DeleteButton name={name} onClick={onDelete} />
    </div>
  );
}

function DeleteButton({
  name,
  onClick,
}: {
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Delete ${name}`}
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
  );
}
