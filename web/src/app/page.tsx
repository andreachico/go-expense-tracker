import type { Expense } from "@/lib/types";
import { getExpenses } from "@/lib/server-api";
import ExpenseDashboard from "./expense-dashboard";

// This is a Server Component (no "use client"): it runs on the server, loads the
// initial list of expenses, and passes it to the interactive client dashboard.
// If the backend is unreachable, we render the UI with an error message instead
// of crashing the page.
export default async function Home() {
  let expenses: Expense[] = [];
  let initialError: string | undefined;

  try {
    expenses = await getExpenses();
  } catch {
    initialError = "Could not reach the API. Is the Go server running on :8080?";
  }

  return (
    <ExpenseDashboard initialExpenses={expenses} initialError={initialError} />
  );
}
