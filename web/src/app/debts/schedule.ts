import type { Debt } from "@/lib/types";

// One row of a debt's payment schedule (one installment).
export interface ScheduleRow {
  installment: number; // 1-based installment number
  month: string; // "YYYY-MM"
  monthName: string; // e.g. "April"
  year: number; // e.g. 2025
  monthlyRate: number; // the payment due this month
  paidAmount: number; // cumulative amount paid through this month
  leftToPay: number; // remaining balance after this month's payment
  paid: boolean; // whether this installment has been paid
}

// addMonths returns the "YYYY-MM" key `delta` months after `month`.
export function addMonths(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// monthLabel formats a "YYYY-MM" key as e.g. "April 2025".
export function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

// buildSchedule expands an installment plan into its full month-by-month table,
// mirroring the "Macbook Pro (36 Monate)" sheet: each month lowers the balance
// by the monthly rate until the total is paid off.
export function buildSchedule(debt: Debt): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (let i = 1; i <= debt.termMonths; i++) {
    const month = addMonths(debt.startMonth, i - 1);
    const [year, m] = month.split("-").map(Number);
    const paidAmount = Math.min(debt.monthlyRate * i, debt.totalAmount);
    const leftToPay = Math.max(debt.totalAmount - debt.monthlyRate * i, 0);
    rows.push({
      installment: i,
      month,
      monthName: new Date(year, m - 1, 1).toLocaleDateString("en-GB", {
        month: "long",
      }),
      year,
      monthlyRate: debt.monthlyRate,
      paidAmount,
      leftToPay,
      paid: i <= debt.paidMonths,
    });
  }
  return rows;
}

// remainingBalance is what is still owed given how many installments are paid.
export function remainingBalance(debt: Debt): number {
  return Math.max(debt.totalAmount - debt.monthlyRate * debt.paidMonths, 0);
}
