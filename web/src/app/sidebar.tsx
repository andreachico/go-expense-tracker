// Left navigation. "Variable Expense" is the current expense tracker and is the
// active view; "Budget Sheet" is a placeholder that isn't wired up yet.
export default function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-amber-900/15 bg-white p-4 sm:block">
      <div className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-amber-900/50">
        Workspace
      </div>
      <nav className="flex flex-col gap-1">
        <span
          aria-disabled="true"
          title="Coming soon"
          className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-amber-900/35"
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
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1" />
          </svg>
          Budget Sheet
        </span>

        <a
          href="/"
          aria-current="page"
          className="flex items-center gap-3 rounded-lg bg-amber-900/90 px-3 py-2 text-sm font-medium text-amber-50"
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
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          Variable Expense
        </a>
      </nav>
    </aside>
  );
}
