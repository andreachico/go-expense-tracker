import type { Expense, NewExpense } from "./types";

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
