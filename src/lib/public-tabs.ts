import { monthFromTitle } from "./normalize";
/** Read the public tab index as data. Never execute Google's embedded script. */
export function parsePublicTabs(
  html: string,
): { title: string; gid: number }[] {
  const tabs = new Map<number, { title: string; gid: number }>();
  const pattern =
    /items\.push\(\{name:\s*("(?:\\.|[^"\\])*")[\s\S]*?gid:\s*"(\d+)"/g;
  for (const match of html.matchAll(pattern)) {
    const title: unknown = JSON.parse(
      match[1].replace(/\\x([0-9a-f]{2})/gi, "\\u00$1"),
    );
    if (typeof title === "string" && monthFromTitle(title))
      tabs.set(Number(match[2]), { title, gid: Number(match[2]) });
  }
  if (!tabs.size)
    throw new Error(
      "No monthly tabs could be discovered. Add a Sheets API key or read-only Google account.",
    );
  return [...tabs.values()].sort((a, b) => {
    const am = monthFromTitle(a.title)!,
      bm = monthFromTitle(b.title)!;
    return am.year - bm.year || am.month - bm.month;
  });
}
