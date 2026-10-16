import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { BudgetPlan, Expense } from "./types";

// Server-side data loading. Unlike the browser client (which uses the "/api"
// proxy), a Server Component runs on the server and must call the backend with
// an absolute URL. This is a plain server-to-server request, so there's no CORS
// involved. Set BACKEND_URL in production; it defaults to local dev.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8080";

// authHeaders forwards the incoming request's cookies to the backend. Because
// the Server Component runs on the server, the browser's session cookie isn't
// attached automatically — we have to copy it onto the outgoing request so the
// API knows which user is asking.
async function authHeaders(): Promise<HeadersInit> {
  const cookieHeader = (await cookies()).toString();
  return cookieHeader ? { cookie: cookieHeader } : {};
}

export async function getExpenses(): Promise<Expense[]> {
  // no-store keeps the list fresh on every request (it changes as users add
  // expenses). For heavily cached data you'd use Next's caching instead.
  const res = await fetch(`${BACKEND_URL}/expenses`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  // An expired or missing session sends us to the login page.
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(`failed to load expenses (${res.status})`);
  }
  return res.json() as Promise<Expense[]>;
}

// getBudgetPlan loads the saved budget plan for a month ("YYYY-MM"). An empty
// object means nothing has been saved for that month yet.
export async function getBudgetPlan(month: string): Promise<BudgetPlan> {
  const res = await fetch(`${BACKEND_URL}/budget?month=${month}`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(`failed to load budget (${res.status})`);
  }
  return res.json() as Promise<BudgetPlan>;
}
