import { NextResponse, type NextRequest } from "next/server";

// Route guard. The real security is in the Go API (it verifies the signed
// session cookie on every request), but this middleware improves the UX: it
// bounces visitors without a session cookie to the login page before any
// protected page renders, and keeps logged-in users off the login page.
//
// It only checks for the cookie's presence, not its validity — a tampered or
// expired cookie still gets rejected by the API, and server-api.ts redirects
// here on a 401.
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("session");
  const { pathname } = req.nextUrl;
  const isLogin = pathname === "/login";

  if (!hasSession && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (hasSession && isLogin) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

// Run on every route except Next internals, the API proxy, and static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|api|favicon.ico|.*\\.png$).*)"],
};
