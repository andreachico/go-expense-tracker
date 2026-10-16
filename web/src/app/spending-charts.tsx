import type { Expense } from "@/lib/types";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

// Warm amber ramp so the donut segments stay within the brown aesthetic.
const PALETTE = [
  "#78350f",
  "#b45309",
  "#d97706",
  "#f59e0b",
  "#fbbf24",
  "#fcd34d",
  "#92400e",
  "#a16207",
];

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short" });

// One bar in the overview chart.
export type OverviewBucket = { label: string; total: number };

// Bucket actual expenses into the last 6 months ending with the current month.
function expenseBuckets(expenses: Expense[]): OverviewBucket[] {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: MONTH_FMT.format(d),
      total: 0,
    };
  });

  for (const e of expenses) {
    const bucket = months.find((m) => e.date.startsWith(m.key));
    if (bucket) bucket.total += e.amount;
  }

  return months.map(({ label, total }) => ({ label, total }));
}

function SpendingOverview({
  buckets,
  planned,
}: {
  buckets: OverviewBucket[];
  planned?: boolean;
}) {
  const maxTotal = Math.max(...buckets.map((m) => m.total), 0);
  // Round the axis up to a tidy maximum so the gridlines read nicely.
  const niceMax = Math.max(100, Math.ceil(maxTotal / 100) * 100);
  const gridLines = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(niceMax * f));

  return (
    <div className="rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
            Spending overview
          </h2>
          <p className="text-sm text-amber-900/70">
            {planned
              ? "Your overall planned expenses over the last 6 months"
              : "Your expenses over the last 6 months"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-amber-900/70">
          <span className="h-3 w-3 rounded-sm bg-amber-800" />
          {planned ? "Overall expenses" : "Total spent"}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <div className="flex flex-col justify-between py-1 text-xs text-amber-900/40">
          {gridLines.map((v) => (
            <span key={v} className="tabular-nums leading-none">
              {currency.format(v).replace(/\.00$/, "")}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          <div className="relative">
            <div className="absolute inset-0 flex flex-col justify-between">
              {gridLines.map((v, i) => (
                <div
                  key={v}
                  className={
                    i === gridLines.length - 1
                      ? "border-t border-amber-900/20"
                      : "border-t border-amber-900/5"
                  }
                />
              ))}
            </div>

            <div className="relative flex h-56 items-end gap-2">
              {buckets.map((m, i) => {
                const heightPct = niceMax > 0 ? (m.total / niceMax) * 100 : 0;
                const isCurrent = i === buckets.length - 1;
                return (
                  <div
                    key={i}
                    className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  >
                    {isCurrent && m.total > 0 && (
                      <div className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-amber-900 px-2 py-1 text-xs font-medium text-amber-50">
                        {currency.format(m.total)}
                      </div>
                    )}
                    <div
                      className="w-full max-w-10 rounded-t-md bg-amber-800"
                      style={{ height: `${heightPct}%` }}
                      title={`${m.label}: ${currency.format(m.total)}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex gap-2">
            {buckets.map((m, i) => (
              <div
                key={i}
                className="min-w-0 flex-1 text-center text-sm text-amber-900/60"
              >
                {m.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export type Segment = { category: string; amount: number };

function WhereItWent({ data }: { data: Segment[] }) {
  const total = data.reduce((sum, s) => sum + s.amount, 0);

  // Largest first, then assign a palette color and fraction to each slice.
  const segments = [...data]
    .sort((a, b) => b.amount - a.amount)
    .map((s, i) => ({
      category: s.category,
      amount: s.amount,
      fraction: total > 0 ? s.amount / total : 0,
      color: PALETTE[i % PALETTE.length],
    }));

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
            Where it went
          </h2>
          <p className="text-sm text-amber-900/70">Spending by category</p>
        </div>
        <span className="text-amber-900/40">···</span>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-8">
        <div className="relative h-44 w-44 shrink-0">
          <svg
            viewBox="0 0 160 160"
            className="h-full w-full -rotate-90"
            aria-hidden="true"
          >
            {total === 0 ? (
              <circle
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke="#f0e6d6"
                strokeWidth="24"
              />
            ) : (
              segments.map((s) => {
                const dash = s.fraction * circumference;
                const offset = -cumulative * circumference;
                cumulative += s.fraction;
                return (
                  <circle
                    key={s.category}
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="24"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={offset}
                  />
                );
              })
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm text-amber-900/70">Total spent</span>
            <span className="text-2xl font-semibold tabular-nums text-zinc-900">
              {currency.format(total)}
            </span>
          </div>
        </div>

        <ul className="flex-1 space-y-3 text-sm text-zinc-900">
          {segments.length === 0 ? (
            <li className="text-amber-900/60">No spending yet.</li>
          ) : (
            segments.map((s) => (
              <li key={s.category} className="flex items-center gap-3">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 min-w-0 truncate">{s.category}</span>
                <span className="font-semibold tabular-nums">
                  {Math.round(s.fraction * 100)}%
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

// Aggregate expenses into one slice per category for the donut.
function byCategory(expenses: Expense[]): Segment[] {
  const totals = new Map<string, number>();
  for (const e of expenses) {
    totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
  }
  return Array.from(totals, ([category, amount]) => ({ category, amount }));
}

// Right-hand analytics column: the bar chart on top, the donut beneath it. By
// default both are derived from actual expenses; pass `overview` to show a
// custom 6-month bar chart (e.g. the budget sheet's overall planned expenses)
// and `whereItWent` to show a custom donut breakdown.
export default function SpendingCharts({
  expenses,
  whereItWent,
  overview,
}: {
  expenses: Expense[];
  whereItWent?: Segment[];
  overview?: OverviewBucket[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <SpendingOverview
        buckets={overview ?? expenseBuckets(expenses)}
        planned={overview != null}
      />
      <WhereItWent data={whereItWent ?? byCategory(expenses)} />
    </div>
  );
}
