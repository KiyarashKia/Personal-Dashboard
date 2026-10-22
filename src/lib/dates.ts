import type { DateRange, ISODate, Mode } from "./types";
export const iso = (date: Date) => date.toISOString().slice(0, 10);
export const dateObject = (date: ISODate) => new Date(`${date}T12:00:00Z`);
export function todayInZone(timezone: string, instant = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
export function addDays(date: ISODate, count: number): ISODate {
  const d = dateObject(date);
  d.setUTCDate(d.getUTCDate() + count);
  return iso(d);
}
export function daysBetween(start: ISODate, end: ISODate): number {
  return Math.round(
    (dateObject(end).getTime() - dateObject(start).getTime()) / 86400000,
  );
}
export function datesIn(range: DateRange): ISODate[] {
  const n = daysBetween(range.start, range.end);
  return n < 0
    ? []
    : Array.from({ length: n + 1 }, (_, i) => addDays(range.start, i));
}
/** The tracker's plan: the first through the last month with scheduled activities. */
export function planRange(dates: ISODate[]): DateRange | null {
  if (!dates.length) return null;
  const sorted = [...dates].sort();
  return {
    start: periodFor("month", sorted[0]).start,
    end: periodFor("month", sorted.at(-1)!).end,
  };
}
/** Year means the tracker's plan when there is one, otherwise the calendar year. */
export function periodFor(
  mode: Mode,
  anchor: ISODate,
  plan?: DateRange | null,
): DateRange {
  if (mode === "year" && plan) return plan;
  const d = dateObject(anchor),
    y = d.getUTCFullYear(),
    m = d.getUTCMonth();
  if (mode === "day") return { start: anchor, end: anchor };
  if (mode === "week") {
    const start = addDays(anchor, -d.getUTCDay());
    return { start, end: addDays(start, 6) };
  }
  if (mode === "month")
    return {
      start: iso(new Date(Date.UTC(y, m, 1, 12))),
      end: iso(new Date(Date.UTC(y, m + 1, 0, 12))),
    };
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}
export function movePeriod(
  mode: Mode,
  anchor: ISODate,
  direction: number,
): ISODate {
  if (mode === "day" || mode === "week")
    return addDays(anchor, direction * (mode === "week" ? 7 : 1));
  const p = periodFor(mode, anchor),
    d = dateObject(p.start);
  if (mode === "month") d.setUTCMonth(d.getUTCMonth() + direction);
  else d.setUTCFullYear(d.getUTCFullYear() + direction);
  return iso(d);
}
export function comparablePrevious(
  mode: Mode,
  anchor: ISODate,
  today: ISODate,
  plan?: DateRange | null,
): DateRange {
  // The plan has nothing before it to compare with.
  if (mode === "year" && plan)
    return { start: plan.start, end: addDays(plan.start, -1) };
  const current = periodFor(mode, anchor),
    previous = periodFor(mode, movePeriod(mode, anchor, -1));
  if (current.end <= today) return previous;
  if (current.start > today)
    return { start: previous.start, end: addDays(previous.start, -1) };
  return {
    start: previous.start,
    end: [
      previous.end,
      addDays(previous.start, daysBetween(current.start, today)),
    ].sort()[0],
  };
}
export function formatDate(
  date: ISODate,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(
    dateObject(date),
  );
}
export function periodLabel(
  mode: Mode,
  anchor: ISODate,
  plan?: DateRange | null,
): string {
  const p = periodFor(mode, anchor, plan);
  if (mode === "year" && plan)
    return `${formatDate(p.start, { month: "short", year: "numeric" })} – ${formatDate(p.end, { month: "short", year: "numeric" })}`;
  if (mode === "day")
    return formatDate(anchor, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (mode === "week")
    return `${formatDate(p.start)} – ${formatDate(p.end)}, ${p.end.slice(0, 4)}`;
  return formatDate(
    anchor,
    mode === "month" ? { month: "long", year: "numeric" } : { year: "numeric" },
  );
}
