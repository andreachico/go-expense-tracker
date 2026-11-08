import YearOverview from "./year-overview";

// Server wrapper for the Year at a Glance view. The calendar is fully
// client-side (events persist to localStorage), so this just renders the
// interactive component.
export default function YearOverviewPage() {
  return <YearOverview />;
}
