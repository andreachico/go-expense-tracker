// Top bar with a breadcrumb and a static profile area. There's no auth yet, so
// the bell and avatar are decorative placeholders.
export default function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-amber-900/15 bg-white px-6 py-4">
      <nav className="flex items-center gap-2 text-sm">
        <span className="text-amber-900/50">Workspace</span>
        <span className="text-amber-900/30">›</span>
        <span className="font-semibold text-zinc-900">Overview</span>
      </nav>

      <div className="flex items-center gap-5">
        <span className="hidden text-sm text-amber-900/60 sm:block">
          A little clarity goes a long way.
        </span>

        <button
          type="button"
          aria-label="Notifications"
          className="relative text-amber-900/70 hover:text-amber-900"
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
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          </svg>
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-800" />
        </button>

        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-200 text-xs font-semibold text-amber-900">
          AC
        </span>
      </div>
    </header>
  );
}
