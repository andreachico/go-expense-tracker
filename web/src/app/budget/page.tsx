import type { BudgetPlan, Expense } from "@/lib/types";
import { getBudgetPlan, getExpenses } from "@/lib/server-api";
import type { OverviewBucket } from "../spending-charts";
import BudgetSheet from "./budget-sheet";

// Matches a "YYYY-MM" month key.
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_SHORT = new Intl.DateTimeFormat("en-US", { month: "short" });

// The month to show: the ?month=YYYY-MM query if valid, otherwise the current
// month. Keeping the selection in the URL means each month has a shareable,
// refresh-safe address and the Server Component can load its data directly.
function resolveMonth(value: string | string[] | undefined): string {
  if (typeof value === "string" && MONTH_RE.test(value)) return value;
  return new Date().toISOString().slice(0, 7);
}

// The six month keys ending with (and including) `month`.
function lastSixMonths(month: string): string[] {
  const [year, m] = month.split("-").map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, m - 1 - (5 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

// Short month label, e.g. "Oct", for a "YYYY-MM" key.
function shortLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return MONTH_SHORT.format(new Date(year, m - 1, 1));
}

// A month's overall planned expenses: every planned entry except the paycheck
// and the deleted-row markers.
function planTotal(plan: BudgetPlan): number {
  let total = 0;
  for (const key of Object.keys(plan)) {
    if (key.startsWith("meta:") || key.startsWith("hidden:")) continue;
    total += plan[key].amount;
  }
  return total;
}

// Server Component for the "Budget Sheet" tab. It loads the expenses (used by the
// donut), the selected month's plan, and the overall planned expenses for the
// last six months (used by the bar chart), then hands them to the interactive
// client sheet. If the backend is unreachable, we still render with an error.
export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const month = resolveMonth((await searchParams).month);
  const months = lastSixMonths(month);

  let expenses: Expense[] = [];
  let plan: BudgetPlan = {};
  let overview: OverviewBucket[] = months.map((m) => ({
    label: shortLabel(m),
    total: 0,
  }));
  let initialError: string | undefined;

  try {
    const [expensesResult, plans] = await Promise.all([
      getExpenses(),
      Promise.all(months.map((m) => getBudgetPlan(m))),
    ]);
    expenses = expensesResult;
    plan = plans[plans.length - 1]; // the selected month is last
    overview = months.map((m, i) => ({
      label: shortLabel(m),
      total: planTotal(plans[i]),
    }));
  } catch {
    initialError = "Could not reach the API. Is the Go server running on :8080?";
  }

  return (
    <BudgetSheet
      key={month}
      month={month}
      expenses={expenses}
      initialPlan={plan}
      initialOverview={overview}
      initialError={initialError}
    />
  );
}
