"use client";

// Combined login / register screen. It's the only page a signed-out visitor can
// reach (the middleware redirects everything else here). On success the Go API
// sets the session cookie and we navigate into the app.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login, register } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isRegister) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Please enter a valid email address");
        return;
      }
      const weak = passwordProblem(password);
      if (weak) {
        setError(weak);
        return;
      }
      if (password !== repeatPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    setBusy(true);
    try {
      if (isRegister) {
        await register({ username, email, password, firstName, lastName });
      } else {
        await login(username, password);
      }
      // A full navigation so the middleware and server components re-run with
      // the freshly set session cookie.
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-amber-900/15 bg-amber-50/40 px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-amber-900/30 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20";
  const labelClass = "text-sm font-medium text-zinc-700";

  return (
    <main className="flex min-h-screen w-full flex-1 items-center justify-center bg-linear-to-br from-amber-50 via-white to-amber-100/60 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-amber-800 to-amber-600 text-amber-50 shadow-md shadow-amber-900/20">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900">
            {isRegister ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-amber-900/60">
            {isRegister
              ? "Sign up to start tracking your expenses."
              : "Sign in to see your expense tracker."}
          </p>
        </div>

        <div className="rounded-3xl border border-amber-900/10 bg-white/80 p-6 shadow-xl shadow-amber-900/5 backdrop-blur-sm sm:p-8">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-amber-50 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                !isRegister
                  ? "bg-white text-amber-900 shadow-sm"
                  : "text-amber-900/50 hover:text-amber-900"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                isRegister
                  ? "bg-white text-amber-900 shadow-sm"
                  : "text-amber-900/50 hover:text-amber-900"
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isRegister && (
              <div className="flex gap-3">
                <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className={labelClass}>First name</span>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    required
                    className={inputClass}
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className={labelClass}>Last name</span>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    required
                    className={inputClass}
                  />
                </label>
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                minLength={3}
                className={inputClass}
              />
            </label>

            {isRegister && (
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className={inputClass}
                />
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                minLength={8}
                className={inputClass}
              />
              {isRegister && <PasswordChecklist password={password} />}
            </label>

            {isRegister && (
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>Repeat password</span>
                <input
                  type="password"
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className={inputClass}
                />
                {repeatPassword.length > 0 && (
                  <span
                    className={`flex items-center gap-1.5 text-xs ${
                      password === repeatPassword
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    {password === repeatPassword ? (
                      <svg
                        aria-hidden
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4 shrink-0"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg
                        aria-hidden
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4 shrink-0"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                    {password === repeatPassword
                      ? "Passwords match"
                      : "Passwords do not match"}
                  </span>
                )}
              </label>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 rounded-xl bg-linear-to-r from-amber-900 to-amber-700 px-4 py-2.5 text-sm font-semibold text-amber-50 shadow-md shadow-amber-900/20 transition-all hover:from-amber-800 hover:to-amber-600 disabled:opacity-60"
            >
              {busy
                ? "Please wait…"
                : isRegister
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

// passwordProblem returns a message when the password fails the strength policy,
// or null when it's strong enough. This mirrors the rule the Go API enforces, so
// the user gets instant feedback before the request is sent.
function passwordProblem(pw: string): string | null {
  if (pw.length < 8) {
    return "Password must be at least 8 characters long";
  }
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  if (!hasUpper || !hasLower || !hasDigit || !hasSymbol) {
    return "Password must include an uppercase letter, a lowercase letter, a number, and a symbol";
  }
  return null;
}

// PasswordChecklist shows each strength rule and ticks it off live as the user
// types, so they can see exactly what's still missing. The rules mirror
// passwordProblem (and the Go API).
function PasswordChecklist({ password }: { password: string }) {
  const rules = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "An uppercase letter", met: /[A-Z]/.test(password) },
    { label: "A lowercase letter", met: /[a-z]/.test(password) },
    { label: "A number", met: /[0-9]/.test(password) },
    { label: "A symbol", met: /[^A-Za-z0-9]/.test(password) },
  ];

  return (
    <ul className="mt-1 flex flex-col gap-1">
      {rules.map((rule) => (
        <li
          key={rule.label}
          className={`flex items-center gap-1.5 text-xs ${
            rule.met ? "text-green-700" : "text-amber-900/60"
          }`}
        >
          {rule.met ? (
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 shrink-0"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-4 w-4 shrink-0"
            >
              <circle cx="10" cy="10" r="7.25" />
            </svg>
          )}
          {rule.label}
        </li>
      ))}
    </ul>
  );
}
