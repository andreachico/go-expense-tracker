"use client";

// Left navigation. Links the two workspace views — "Variable Expense" (the
// expense tracker at "/") and "Budget Sheet" (the monthly plan at "/budget") —
// and highlights whichever one matches the current route.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/lib/api";
import type { User } from "@/lib/types";

const NAV_ITEMS = [
  {
    href: "/budget",
    label: "Budget Sheet",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
  },
  {
    href: "/",
    label: "Variable Expense",
    icon: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </>
    ),
  },
  {
    href: "/income",
    label: "Income",
    icon: (
      <>
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
      </>
    ),
  },
  {
    href: "/savings",
    label: "Savings",
    icon: (
      <>
        <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5Z" />
        <line x1="16" y1="10" x2="16" y2="10" />
      </>
    ),
  },
  {
    href: "/investments",
    label: "Investments",
    icon: (
      <>
        <line x1="3" y1="3" x2="3" y2="21" />
        <line x1="3" y1="21" x2="21" y2="21" />
        <polyline points="7 14 11 10 14 13 20 7" />
        <polyline points="20 11 20 7 16 7" />
      </>
    ),
  },
  {
    href: "/debts",
    label: "Debts",
    icon: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <line x1="6" y1="15" x2="10" y2="15" />
      </>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-amber-900/15 bg-white p-4 sm:flex">
      <div className="my-4 flex items-center gap-2.5 px-2 pb-4 pt-1">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-amber-800 to-amber-600 text-amber-50 shadow-md shadow-amber-900/20">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </span>
        <span className="text-base font-semibold text-amber-900">
          FinTracker
        </span>
      </div>
      <div className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-amber-900/50">
        Workspace
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                active
                  ? "bg-amber-900/90 text-amber-50"
                  : "text-amber-900/70 hover:bg-amber-900/5"
              }`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {item.icon}
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <UserMenu />
    </aside>
  );
}

// UserMenu sits at the bottom of the sidebar. It shows who's signed in and lets
// them log out, which clears the session cookie and returns to the login page.
function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: User | null) => {
        if (active) setUser(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="mt-auto border-t border-amber-900/10 pt-3">
      <div className="flex items-center gap-3 px-2 py-1">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-semibold uppercase text-amber-900">
          {user ? initials(user) : "··"}
        </span>
        <span className="truncate text-sm font-medium text-zinc-900">
          {user ? fullName(user) : "…"}
        </span>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-amber-900/70 hover:bg-amber-900/5"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Sign out
      </button>
    </div>
  );
}

// fullName prefers the person's name, falling back to the username for accounts
// created before names were collected.
function fullName(user: User): string {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name || user.username;
}

// initials builds a two-letter avatar label from the name, or the username.
function initials(user: User): string {
  const first = user.firstName.trim();
  const last = user.lastName.trim();
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}` || first.slice(0, 2);
  }
  return user.username.slice(0, 2);
}
