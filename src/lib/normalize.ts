import type { Activity, Domain, SheetRange, Skill } from "./types";
const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
export function monthFromTitle(
  title: string,
): { year: number; month: number } | null {
  const match = title.trim().match(/^([a-z]+)\s+(20\d{2})$/i);
  const month = match ? months.indexOf(match[1].slice(0, 3).toLowerCase()) : -1;
  return match && month >= 0 ? { year: Number(match[2]), month } : null;
}
export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
export function domainFor(category: string): Domain | null {
  const exact = (
    {
      FRENCH: "learning",
      HEALTH: "health",
      CAREER: "career",
      INCOME: "career",
      PR: "admin",
      REVIEW: "admin",
      HOME: "admin",
    } as Record<string, Domain>
  )[category];
  if (exact) return exact;
  if (/FRENCH|FRAN[ÇC]AIS|LEARNING|LANGUAGE/.test(category)) return "learning";
  if (/HEALTH|WELLNESS|MOVEMENT|FITNESS|SELF.CARE/.test(category))
    return "health";
  if (/CAREER|PORTFOLIO|INCOME|JOB/.test(category)) return "career";
  if (
    /ADMIN|IMMIGRATION|FINANC|REFLECTION|REVIEW|HOME|HOUSE|CHORE/.test(category)
  )
    return "admin";
  return null;
}
export function skillFor(habit: string): Skill | null {
  return (
    (["grammar", "listening", "speaking", "reading", "writing"] as const).find(
      (s) => habit.toLowerCase().includes(s),
    ) ?? null
  );
}
/** RFC 4180 CSV parsing: quoted commas, escaped quotes, embedded newlines. */
export function parseCSV(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("The spreadsheet returned malformed CSV.");
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}
export function normalize(
  ranges: SheetRange[],
  categoryDomains: Record<string, Domain> = {},
): { activities: Activity[]; warnings: string[]; tabs: string[] } {
  const byId = new Map<string, Activity>(),
    warnings = new Set<string>(),
    tabs = new Set<string>();
  for (const range of ranges) {
    const rawTitle = range.range.split("!")[0],
      title = rawTitle.replace(/^'|'$/g, "").replace(/''/g, "'");
    const month = monthFromTitle(title);
    if (!month) continue;
    const origin = range.range.split("!")[1]?.match(/^\$?([A-Z]+)\$?(\d+)/i);
    if (origin && (origin[1].toUpperCase() !== "A" || Number(origin[2]) !== 1))
      throw new Error(`${title}: monthly ranges must start at A1.`);
    tabs.add(title);
    const rows = range.values;
    const header = rows.findIndex(
      (r) =>
        String(r[0]).trim().toUpperCase() === "AREA" &&
        String(r[1]).trim().toUpperCase() === "ACTION",
    );
    const dateRow = rows.findIndex(
      (r, i) =>
        i < header &&
        Number(r[2]) === 1 &&
        Number(r[3]) === 2 &&
        Number(r[4]) === 3,
    );
    if (header < 0 || dateRow < 0)
      throw new Error(
        `${title}: expected an AREA / ACTION header and calendar day row.`,
      );
    const lastDay = new Date(
      Date.UTC(month.year, month.month + 1, 0),
    ).getUTCDate();
    for (let r = header + 1; r < rows.length; r++) {
      const category = String(rows[r][0] ?? "")
          .trim()
          .toUpperCase(),
        habit = String(rows[r][1] ?? "").trim();
      if (!category || !habit) continue;
      const domain = categoryDomains[category] ?? domainFor(category);
      for (let c = 2; c < 2 + lastDay; c++) {
        const day = Number(rows[dateRow][c]);
        if (!Number.isInteger(day) || day < 1 || day > lastDay) continue;
        const raw = rows[r][c];
        if (raw === null || raw === undefined || raw === "") continue;
        const value = typeof raw === "string" ? raw.trim().toUpperCase() : raw;
        if (
          value !== true &&
          value !== false &&
          value !== "TRUE" &&
          value !== "FALSE"
        ) {
          warnings.add(
            `${title}: ignored non-checkbox value at ${columnName(c)}${r + 1}.`,
          );
          continue;
        }
        if (!domain)
          warnings.add(
            `Unmapped category ${category}; included in overall completion, excluded from balance.`,
          );
        const date = `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const id = `${date}|${category}|${habit.toLowerCase()}`;
        const next: Activity = {
          id,
          date,
          habit,
          category,
          domain,
          skill: domain === "learning" ? skillFor(habit) : null,
          completed: value === true || value === "TRUE",
          sheet: title,
          cell: `${columnName(c)}${r + 1}`,
        };
        const existing = byId.get(id);
        if (existing && existing.completed !== next.completed)
          throw new Error(
            `Conflicting duplicate activity for ${habit} on ${date}. Check overlapping tabs.`,
          );
        byId.set(id, next);
      }
    }
  }
  if (!tabs.size)
    throw new Error("No supported monthly tracker tabs were found.");
  return {
    activities: [...byId.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.habit.localeCompare(b.habit),
    ),
    warnings: [...warnings],
    tabs: [...tabs],
  };
}
