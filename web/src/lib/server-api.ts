import type { Expense } from "./types";

// Server-side data loading. Unlike the browser client (which uses the "/api"
// proxy), a Server Component runs on the server and must call the backend with
// an absolute URL. This is a plain server-to-server request, so there's no CORS
// involved. Set BACKEND_URL in production; it defaults to local dev.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8080";

export async function getExpenses(): Promise<Expense[]> {
  // no-store keeps the list fresh on every request (it changes as users add
  // expenses). For heavily cached data you'd use Next's caching instead.
  const res = await fetch(`${BACKEND_URL}/expenses`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`failed to load expenses (${res.status})`);
  }
  return res.json() as Promise<Expense[]>;
}
