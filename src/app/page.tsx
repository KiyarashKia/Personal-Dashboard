import Dashboard from "@/components/dashboard";
import { getDashboardData, SourceError } from "@/lib/sheets";
import type { Mode } from "@/lib/types";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const mode = (
    ["day", "week", "month", "year"].includes(String(params.mode))
      ? params.mode
      : "month"
  ) as Mode;
  const date =
    typeof params.date === "string" &&
    /^20\d{2}-\d{2}-\d{2}$/.test(params.date) &&
    !Number.isNaN(Date.parse(`${params.date}T12:00:00Z`)) &&
    new Date(`${params.date}T12:00:00Z`).toISOString().slice(0, 10) ===
      params.date
      ? params.date
      : undefined;
  try {
    return (
      <Dashboard
        initial={await getDashboardData()}
        initialMode={mode}
        initialAnchor={date}
      />
    );
  } catch (error) {
    return (
      <Dashboard
        initialMode={mode}
        initialAnchor={date}
        initialError={
          error instanceof SourceError
            ? error.message
            : "Your tracker is temporarily unavailable."
        }
      />
    );
  }
}
