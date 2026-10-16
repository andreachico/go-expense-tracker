import type {
  BudgetPlan,
  Debt,
  Expense,
  Income,
  Investment,
  NewDebt,
  NewExpense,
  NewIncome,
  NewInvestment,
  NewSaving,
  Saving,
  User,
} from "./types";

// Browser-side mutations. These hit the same-origin "/api" path, which
// next.config.ts proxies to the Go backend (so no CORS). Initial listing is
// done server-side in server-api.ts instead.
const BASE = "/api/expenses";

// handle centralizes response checking: it throws the API's {"error": "..."}
// message on failure so callers can show it to the user.
async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function createExpense(input: NewExpense): Promise<Expense> {
  return handle<Expense>(
    await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteExpense(id: number): Promise<void> {
  // DELETE returns 204 No Content, so there's no JSON body to parse.
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}

// saveBudgetPlan replaces a month's budget plan on the backend with one PUT.
// `keepalive` lets the request complete even if the page navigates away (e.g.
// when switching months), so the last edit isn't lost.
export async function saveBudgetPlan(
  month: string,
  plan: BudgetPlan,
): Promise<void> {
  const res = await fetch(`/api/budget?month=${month}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`save failed (${res.status})`);
}

// --- Authentication ---
//
// The Go API sets an HttpOnly session cookie on register/login; the browser
// sends it back automatically on every same-origin "/api" request, so there's
// no token for JavaScript to manage.

export async function register(input: {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<User> {
  return handle<User>(
    await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function login(username: string, password: string): Promise<User> {
  return handle<User>(
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  );
}

export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", { method: "POST" });
  if (!res.ok) throw new Error(`logout failed (${res.status})`);
}

// --- Income ---
//
// Money received, grouped by "YYYY-MM" month. The list is loaded client-side so
// the income page and the budget sheet can refetch as the selected month
// changes.

export async function getIncome(month: string): Promise<Income[]> {
  return handle<Income[]>(
    await fetch(`/api/income?month=${month}`, { cache: "no-store" }),
  );
}

export async function createIncome(input: NewIncome): Promise<Income> {
  return handle<Income>(
    await fetch("/api/income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteIncome(id: number): Promise<void> {
  const res = await fetch(`/api/income/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}

// --- Savings, Investments & Debts ---
//
// Three sibling resources with the same shape, grouped by "YYYY-MM" month and
// loaded client-side so each page refetches as the selected month changes.

export async function getSavings(month: string): Promise<Saving[]> {
  return handle<Saving[]>(
    await fetch(`/api/savings?month=${month}`, { cache: "no-store" }),
  );
}

export async function createSaving(input: NewSaving): Promise<Saving> {
  return handle<Saving>(
    await fetch("/api/savings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteSaving(id: number): Promise<void> {
  const res = await fetch(`/api/savings/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}

export async function getInvestments(month: string): Promise<Investment[]> {
  return handle<Investment[]>(
    await fetch(`/api/investments?month=${month}`, { cache: "no-store" }),
  );
}

export async function createInvestment(
  input: NewInvestment,
): Promise<Investment> {
  return handle<Investment>(
    await fetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteInvestment(id: number): Promise<void> {
  const res = await fetch(`/api/investments/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}

export async function getDebts(): Promise<Debt[]> {
  return handle<Debt[]>(await fetch("/api/debts", { cache: "no-store" }));
}

export async function getDebt(id: number): Promise<Debt> {
  return handle<Debt>(await fetch(`/api/debts/${id}`, { cache: "no-store" }));
}

export async function createDebt(input: NewDebt): Promise<Debt> {
  return handle<Debt>(
    await fetch("/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateDebt(id: number, input: NewDebt): Promise<Debt> {
  return handle<Debt>(
    await fetch(`/api/debts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateDebtPaid(
  id: number,
  paidMonths: number,
): Promise<Debt> {
  return handle<Debt>(
    await fetch(`/api/debts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paidMonths }),
    }),
  );
}

export async function deleteDebt(id: number): Promise<void> {
  const res = await fetch(`/api/debts/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}
