import { describe, it, expect } from "vitest";
import {
  addDays,
  comparablePrevious,
  periodFor,
  todayInZone,
} from "../src/lib/dates";
import { normalize, parseCSV } from "../src/lib/normalize";
import {
  computeMetrics,
  habitRankings,
  percent,
  rateOf,
  routineBalance,
  streaks,
} from "../src/lib/metrics";
import { newBudget, reserveRead, retryDelay } from "../src/lib/sync-policy";
import { parsePublicTabs } from "../src/lib/public-tabs";
import type { Activity, Domain } from "../src/lib/types";
function task(
  date: string,
  done = false,
  domain: Domain = "learning",
  habit = "Grammar",
): Activity {
  return {
    id: `${date}-${domain}-${habit}`,
    date,
    completed: done,
    domain,
    habit,
    category: domain === "learning" ? "FRENCH" : domain.toUpperCase(),
    skill: domain === "learning" ? "grammar" : null,
    sheet: "Oct 2026",
    cell: "C12",
  };
}
const grid = (rows: unknown[][]) => ({
  range: "'Oct 2026'!A1:AG85",
  values: [
    ["OCTOBER 2026"],
    [],
    [null, null, ...Array.from({ length: 31 }, (_, i) => i + 1)],
    ["AREA", "ACTION"],
    ...rows,
  ],
});
describe("normalization from the inspected tracker structure", () => {
  it("distinguishes unchecked from unscheduled, accepts checked booleans and CSV values", () => {
    const result = normalize([
      grid([["FRENCH", "Grammar", false, true, "", "FALSE", "TRUE", null]]),
    ]);
    expect(result.activities.map((a) => [a.date, a.completed])).toEqual([
      ["2026-10-01", false],
      ["2026-10-02", true],
      ["2026-10-04", false],
      ["2026-10-05", true],
    ]);
  });
  it("keeps totals and formulas out, handles inserted/reordered habit rows and new labels", () => {
    const source = grid([
      ["HEALTH", "My new habit", true],
      [],
      ["FRENCH", "Listening outdoors", false],
      ["TOTAL", "Summary", 4],
    ]);
    const r = normalize([source]);
    expect(r.activities).toHaveLength(2);
    expect(
      r.activities.find((a) => a.habit === "Listening outdoors")?.skill,
    ).toBe("listening");
  });
  it("deduplicates overlapping ranges and rejects conflicting duplicate states", () => {
    expect(
      normalize([
        grid([["FRENCH", "Grammar", true]]),
        grid([["FRENCH", "Grammar", true]]),
      ]).activities,
    ).toHaveLength(1);
    expect(() =>
      normalize([
        grid([["FRENCH", "Grammar", true]]),
        grid([["FRENCH", "Grammar", false]]),
      ]),
    ).toThrow("Conflicting");
  });
  it("supports custom category names while keeping unmapped activities in overall totals", () => {
    const r = normalize(
      [
        grid([
          ["QUIET TIME", "New label", true],
          ["OTHER", "Another habit", false],
        ]),
      ],
      { "QUIET TIME": "health" },
    );
    expect(
      r.activities[0].domain === "health" ||
        r.activities[1].domain === "health",
    ).toBe(true);
    expect(r.activities).toHaveLength(2);
    expect(r.warnings).toHaveLength(1);
  });
  it("parses quoted commas, quotes, newlines, BOM-free rows, and empty cells", () => {
    expect(parseCSV('a,"b,c",\r\n"line\n2","a""b",FALSE')).toEqual([
      ["a", "b,c", ""],
      ["line\n2", 'a"b', "FALSE"],
    ]);
  });
  it("discovers newly added months without evaluating the public page script", () => {
    const html =
      'items.push({name: "DASHBOARD", gid: "1"});items.push({name: "Nov 2027", pageUrl: "x", gid: "99"});items.push({name: "Oct 2026", gid: "500"});';
    expect(parsePublicTabs(html)).toEqual([
      { title: "Oct 2026", gid: 500 },
      { title: "Nov 2027", gid: 99 },
    ]);
  });
});
describe("calendar and period correctness", () => {
  it("uses actual Sunday–Saturday weeks across month/year boundaries", () =>
    expect(periodFor("week", "2027-01-01")).toEqual({
      start: "2026-12-27",
      end: "2027-01-02",
    }));
  it("uses Toronto dates around UTC midnight and DST", () => {
    expect(
      todayInZone("America/Toronto", new Date("2026-10-21T01:00:00Z")),
    ).toBe("2026-10-20");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
  it("compares partial months with equal elapsed days and clamps short prior months", () => {
    expect(comparablePrevious("month", "2026-10-20", "2026-10-20")).toEqual({
      start: "2026-09-01",
      end: "2026-09-20",
    });
    expect(comparablePrevious("month", "2028-03-30", "2028-03-30")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });
  it("compares full historical periods with full previous periods", () =>
    expect(comparablePrevious("month", "2026-09-10", "2026-10-20")).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    }));
});
describe("pure KPI rules", () => {
  it("returns unavailable for zero denominator", () =>
    expect(rateOf([]).rate).toBeNull());
  it("excludes unchecked AND checked future dates from completion and full days", () => {
    const m = computeMetrics(
      [
        task("2026-10-20", true),
        task("2026-10-21", false),
        task("2026-10-22", true),
      ],
      "month",
      "2026-10-20",
      "2026-10-20",
    );
    expect(m.performance).toEqual({ completed: 1, scheduled: 1, rate: 1 });
    expect(m.fullDays).toBe(1);
    expect(m.days[0].rate).toBeNull();
  });
  it("counts practice days and weeks once, even with several French tasks", () => {
    const activities = [
      task("2026-10-20", true),
      task("2026-10-20", true, "learning", "Listening"),
      task("2026-10-21", true),
    ];
    const m = computeMetrics(activities, "year", "2026-10-21", "2026-10-21");
    expect(m.activeFrenchDays).toBe(2);
    expect(m.activeFrenchWeeks).toBe(1);
  });
  it("counts scheduled practice-day streaks, skips off days, and leaves today open", () => {
    const rows = [
      task("2026-10-16", true),
      task("2026-10-19", true),
      task("2026-10-20", false),
    ];
    expect(streaks(rows, "2026-10-20")).toMatchObject({
      current: 2,
      longest: 2,
    });
    expect(streaks(rows, "2026-10-21").current).toBe(0);
  });
  it("uses percentage-point changes and normalized ranking eligibility", () => {
    const rows = [
      task("2026-10-19", true),
      task("2026-10-20", false),
      task("2026-10-18", true),
    ];
    expect(habitRankings(rows).best?.rate).toBeCloseTo(2 / 3);
    expect(habitRankings(rows.slice(0, 2)).best).toBeNull();
    const m = computeMetrics(
      [task("2026-10-19", true), task("2026-10-20", false)],
      "day",
      "2026-10-20",
      "2026-10-20",
    );
    expect(m.change).toBe(-100);
  });
  it("computes weighted balance with participation and makes missing domains explicit", () => {
    const all = [
      task("2026-10-20", true, "health"),
      task("2026-10-20", true, "learning"),
      task("2026-10-20", false, "career"),
      task("2026-10-20", false, "admin"),
    ];
    const result = routineBalance(all, "2026-10-20");
    expect(result.score).toBe(61);
    expect(result.coverage).toBeCloseTo(0.65);
    expect(result.participation).toBe(0.5);
    // An area with nothing scheduled is left out and the other weights rescale:
    // coverage (35 + 30) / 90, participation 2 of 3.
    const three = routineBalance(all.slice(0, 3), "2026-10-20");
    expect(three.coverage).toBeCloseTo(65 / 90);
    expect(three.participation).toBeCloseTo(2 / 3);
    expect(three.score).toBe(71);
    expect(three.missing).toEqual(["Life admin"]);
    expect(routineBalance(all.slice(0, 1), "2026-10-20").score).toBeNull();
  });
  it("never rounds a partial rate up to 100% or down to 0%", () => {
    expect(percent(199 / 200)).toBe("99%");
    expect(percent(1 / 300)).toBe("1%");
    expect(percent(1)).toBe("100%");
    expect(percent(0)).toBe("0%");
    expect(percent(0.5)).toBe("50%");
  });
  it("separates what is due so far from everything planned in the period", () => {
    const m = computeMetrics(
      [
        task("2026-10-20", true),
        task("2026-10-21", false, "health"),
        task("2026-11-03", false),
        task("2026-12-31", false, "health"),
        task("2027-01-01", false),
      ],
      "year",
      "2026-10-21",
      "2026-10-21",
    );
    expect(m.performance).toEqual({ completed: 1, scheduled: 2, rate: 0.5 });
    expect(m.planned).toEqual({ all: 4, french: 2, health: 2 });
  });
  it("labels each week bar by its first day inside the period", () => {
    const m = computeMetrics(
      [task("2026-10-01", true)],
      "month",
      "2026-10-01",
      "2026-10-31",
    );
    expect(m.trend[0].date).toBe("2026-10-01");
    expect(m.trend[1].date).toBe("2026-10-04");
  });
  it("counts walking days rather than checkboxes", () => {
    const rows = [
      task("2026-10-20", true, "health", "Walk"),
      task("2026-10-20", true, "health", "Walking outside"),
    ];
    const m = computeMetrics(rows, "week", "2026-10-20", "2026-10-20");
    expect(m.walking.completed).toBe(1);
    expect(m.walking.scheduled).toBe(1);
  });
});
describe("free-quota guardrails", () => {
  it("never reserves beyond its local budget, then automatically resets", () => {
    const b = newBudget();
    for (let i = 0; i < 8; i++) expect(reserveRead(b, 8, 100_000)).toBe(0);
    expect(reserveRead(b, 8, 100_000)).toBe(60);
    expect(reserveRead(b, 8, 160_000)).toBe(0);
  });
  it("respects Retry-After and doubles consecutive quota cooldowns", () => {
    const b = newBudget();
    expect(retryDelay(b, "90", 100_000)).toBe(90);
    expect(reserveRead(b, 8, 120_000)).toBe(70);
    expect(retryDelay(b, null, 190_000)).toBe(120);
  });
});
