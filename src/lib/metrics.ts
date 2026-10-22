import {
  addDays,
  comparablePrevious,
  datesIn,
  periodFor,
  planRange,
} from "./dates";
import type {
  Activity,
  DateRange,
  Domain,
  ISODate,
  Mode,
  Rate,
  Weights,
} from "./types";
import { DEFAULT_WEIGHTS, DOMAIN_NAMES } from "./types";
/** Whole percent that never rounds a partial result up to 100% or down to 0%. */
export function percent(value: number | null) {
  if (value === null) return "—";
  const n = Math.round(value * 100);
  if (value > 0 && n < 1) return "<1%";
  return `${value < 1 ? Math.min(99, n) : n}%`;
}
/** A count with thousands separators, so 1401 reads as 1,401. */
export const count = (n: number) => n.toLocaleString("en-US");
const row = (cell: string) => Number(cell.replace(/\D/g, ""));
export function rateOf(activities: Activity[]): Rate {
  const completed = activities.filter((a) => a.completed).length,
    scheduled = activities.length;
  return {
    completed,
    scheduled,
    rate: scheduled ? completed / scheduled : null,
  };
}
export function select(
  activities: Activity[],
  range: DateRange,
  today: ISODate,
): Activity[] {
  return activities.filter(
    (a) => a.date >= range.start && a.date <= range.end && a.date <= today,
  );
}
export function changeInPoints(current: Rate, previous: Rate): number | null {
  return current.rate === null || previous.rate === null
    ? null
    : (current.rate - previous.rate) * 100;
}
export function dailyRates(
  activities: Activity[],
  range: DateRange,
  today: ISODate,
) {
  const grouped = new Map<string, Activity[]>();
  for (const a of activities) {
    const bucket = grouped.get(a.date) ?? [];
    bucket.push(a);
    grouped.set(a.date, bucket);
  }
  return datesIn(range).map((date) => ({
    date,
    ...rateOf(date > today ? [] : (grouped.get(date) ?? [])),
    future: date > today,
    planned: (grouped.get(date) ?? []).length,
  }));
}
export function streaks(activities: Activity[], today: ISODate) {
  const scheduled = new Map<string, boolean>();
  for (const a of activities)
    if (a.domain === "learning" && a.date <= today)
      scheduled.set(a.date, (scheduled.get(a.date) ?? false) || a.completed);
  const days = [...scheduled].sort(([a], [b]) => a.localeCompare(b));
  let run = 0,
    longest = 0;
  for (const [, completed] of days) {
    run = completed ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today's unfinished practice is still available; end its grace period at midnight.
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const [date, complete] = days[i];
    if (date === today && !complete) continue;
    if (!complete) break;
    current++;
  }
  return {
    current,
    longest,
    practiceDays: days.filter(([, done]) => done).length,
  };
}
export function validWeights(value: unknown): value is Weights {
  if (!value || typeof value !== "object") return false;
  const numbers = (["health", "learning", "career", "admin"] as const).map(
    (k) => (value as Weights)[k],
  );
  return (
    numbers.every((n) => Number.isFinite(n) && n >= 0 && n <= 100) &&
    Math.abs(numbers.reduce((s, n) => s + n, 0) - 100) < 0.01
  );
}
export function routineBalance(
  activities: Activity[],
  today: ISODate,
  weights: Weights = DEFAULT_WEIGHTS,
) {
  const effective = validWeights(weights) ? weights : DEFAULT_WEIGHTS;
  const recent = select(
    activities,
    { start: addDays(today, -29), end: today },
    today,
  );
  const domains = (["health", "learning", "career", "admin"] as const).map(
    (domain) => ({
      domain,
      label: DOMAIN_NAMES[domain],
      weight: effective[domain],
      ...rateOf(recent.filter((a) => a.domain === domain)),
    }),
  );
  // Areas with nothing scheduled in the window are left out and the remaining
  // weights are rescaled, so an unscheduled area neither helps nor hurts.
  const tracked = domains.filter((d) => d.rate !== null),
    missing = domains.filter((d) => d.rate === null).map((d) => d.label),
    weight = tracked.reduce((sum, d) => sum + d.weight, 0);
  const coverage = weight
    ? tracked.reduce((sum, d) => sum + d.rate! * d.weight, 0) / weight
    : 0;
  const participation = tracked.length
    ? tracked.filter((d) => d.completed > 0).length / tracked.length
    : 0;
  // Balance needs at least two areas to compare.
  const score =
    tracked.length < 2 || !weight
      ? null
      : Math.round(100 * (0.7 * coverage + 0.3 * participation) + 1e-9);
  const weakest = [...tracked].sort((a, b) => a.rate! - b.rate!)[0];
  const phrase =
    score === null
      ? `${tracked.length} of 4 areas scheduled`
      : score >= 80
        ? "Balanced routine"
        : score === 0
          ? "A fresh start"
          : weakest.domain === "learning"
            ? "Make room for French"
            : `${weakest.label} needs attention`;
  return { score, phrase, domains, missing, coverage, participation };
}
export function habitRankings(activities: Activity[], minimum = 3) {
  const habits = [...new Set(activities.map((a) => a.habit))];
  const ranked = habits
    .map((habit) => ({
      habit,
      ...rateOf(activities.filter((a) => a.habit === habit)),
    }))
    .filter((r) => r.scheduled >= minimum)
    .sort((a, b) => b.rate! - a.rate! || a.habit.localeCompare(b.habit));
  return {
    best: ranked[0] ?? null,
    lowest: ranked.at(-1) ?? null,
    tied: ranked.length > 0 && ranked.every((r) => r.rate === ranked[0].rate),
  };
}
export function monthlyRates(
  activities: Activity[],
  range: DateRange,
  today: ISODate,
  domain?: Domain,
) {
  const result = [];
  for (
    let date = periodFor("month", range.start).start;
    date <= range.end;
    date = addDays(periodFor("month", date).end, 1)
  )
    result.push({
      date,
      ...rateOf(
        select(activities, periodFor("month", date), today).filter(
          (a) => !domain || a.domain === domain,
        ),
      ),
      future: date > today,
    });
  return result;
}
export function weeklyRates(
  activities: Activity[],
  range: DateRange,
  today: ISODate,
  domain?: Domain,
) {
  const first = periodFor("week", range.start).start;
  const result = [];
  for (let start = first; start <= range.end; start = addDays(start, 7)) {
    const interval = {
      start: start < range.start ? range.start : start,
      end: addDays(start, 6) > range.end ? range.end : addDays(start, 6),
    };
    result.push({
      date: interval.start,
      ...rateOf(
        select(activities, interval, today).filter(
          (a) => !domain || a.domain === domain,
        ),
      ),
      future: interval.start > today,
    });
  }
  return result;
}
export function computeMetrics(
  activities: Activity[],
  mode: Mode,
  anchor: ISODate,
  today: ISODate,
  weights = DEFAULT_WEIGHTS,
) {
  const plan = planRange(activities.map((a) => a.date));
  const range = periodFor(mode, anchor, plan),
    current = select(activities, range, today);
  const previous = rateOf(
    select(activities, comparablePrevious(mode, anchor, today, plan), today),
  );
  // Everything scheduled in the period, including dates still ahead.
  const planned = activities.filter(
    (a) => a.date >= range.start && a.date <= range.end,
  );
  const performance = rateOf(current),
    french = current.filter((a) => a.domain === "learning"),
    health = current.filter((a) => a.domain === "health");
  // Progress counts what is done against everything planned in the period;
  // performance counts it against only what is due so far.
  const progress = {
    completed: performance.completed,
    scheduled: planned.length,
    rate: planned.length ? performance.completed / planned.length : null,
  };
  const days = dailyRates(activities, range, today);
  const all = activities.filter((a) => a.date <= today);
  const rolling = rateOf(
    select(activities, { start: addDays(today, -29), end: today }, today),
  );
  const priorRolling = rateOf(
    select(
      activities,
      { start: addDays(today, -59), end: addDays(today, -30) },
      today,
    ),
  );
  const activeFrenchDays = [
    ...new Set(french.filter((a) => a.completed).map((a) => a.date)),
  ];
  const activeFrenchWeeks = new Set(
    activeFrenchDays.map((d) => periodFor("week", d).start),
  ).size;
  const months = monthlyRates(
    activities,
    plan ?? periodFor("year", anchor),
    today,
  );
  const eligibleMonths = months.filter((m) => m.scheduled > 0);
  const mostConsistent =
    [...eligibleMonths].sort(
      (a, b) => b.rate! - a.rate! || a.date.localeCompare(b.date),
    )[0] ?? null;
  const heatRange =
    mode === "day" || mode === "week"
      ? { start: addDays(range.end, -27), end: range.end }
      : range;
  return {
    range,
    plan,
    current,
    performance,
    progress,
    previous,
    change: changeInPoints(performance, previous),
    days,
    french: rateOf(french),
    health: rateOf(health),
    planned: {
      all: planned.length,
      french: planned.filter((a) => a.domain === "learning").length,
      health: planned.filter((a) => a.domain === "health").length,
    },
    activeFrenchDays: activeFrenchDays.length,
    activeFrenchWeeks,
    // Only skills the tracker has rows for; French is one daily box by default.
    skills: (
      ["grammar", "listening", "speaking", "reading", "writing"] as const
    )
      .map((skill) => ({
        skill,
        ...rateOf(french.filter((a) => a.skill === skill)),
      }))
      .filter((s) => planned.some((a) => a.skill === s.skill)),
    // In the tracker's row order.
    healthHabits: [
      ...new Set(
        planned
          .filter((a) => a.domain === "health")
          .sort((a, b) => row(a.cell) - row(b.cell))
          .map((a) => a.habit),
      ),
    ].map((habit) => ({
      habit,
      ...rateOf(health.filter((a) => a.habit === habit)),
    })),
    portfolio: rateOf(current.filter((a) => a.category === "CAREER")),
    income: rateOf(current.filter((a) => a.category === "INCOME")),
    admin: rateOf(current.filter((a) => a.category === "PR")),
    reflection: rateOf(current.filter((a) => a.category === "REVIEW")),
    fullDays: days.filter((d) => d.scheduled > 0 && d.completed === d.scheduled)
      .length,
    // Each area's progress through its plan for the period.
    distribution: (["learning", "health", "career", "admin"] as const).map(
      (domain) => {
        const completed = current.filter(
            (a) => a.domain === domain && a.completed,
          ).length,
          scheduled = planned.filter((a) => a.domain === domain).length;
        return {
          domain,
          label: DOMAIN_NAMES[domain],
          completed,
          scheduled,
          rate: scheduled ? completed / scheduled : null,
        };
      },
    ),
    rankings: habitRankings(current),
    months,
    mostConsistent,
    trend:
      mode === "year"
        ? months
        : mode === "month"
          ? weeklyRates(activities, range, today)
          : days,
    healthTrend:
      mode === "year"
        ? monthlyRates(activities, range, today, "health")
        : weeklyRates(activities, range, today, "health"),
    heatmap: dailyRates(activities, heatRange, today),
    global: {
      overall: rateOf(all),
      planned: activities.length,
      balance: routineBalance(activities, today, weights),
      streak: streaks(activities, today),
      rolling,
      rollingChange: changeInPoints(rolling, priorRolling),
      spark: dailyRates(
        activities,
        { start: addDays(today, -29), end: today },
        today,
      ),
    },
    future: range.start > today,
    partial: range.start <= today && range.end > today,
  };
}
export type Metrics = ReturnType<typeof computeMetrics>;
