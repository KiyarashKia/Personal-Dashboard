import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const cache = vi.hoisted(
  () => new Map<string, { data: unknown; expires: number; tags: string[] }>(),
);
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache:
    (
      fn: () => Promise<unknown>,
      keys: string[],
      options: { revalidate: number | false; tags?: string[] },
    ) =>
    async () => {
      const key = JSON.stringify(keys),
        saved = cache.get(key);
      if (saved && saved.expires > Date.now()) return saved.data;
      const data = await fn();
      cache.set(key, {
        data,
        expires:
          options.revalidate === false
            ? Infinity
            : Date.now() + options.revalidate * 1000,
        tags: options.tags ?? [],
      });
      return data;
    },
  revalidateTag: (tag: string) => {
    for (const [key, entry] of cache)
      if (entry.tags.includes(tag)) cache.delete(key);
  },
}));
function values(complete = false) {
  return {
    valueRanges: [
      {
        range: "'Oct 2026'!A1:AG200",
        values: [
          ["OCTOBER 2026"],
          [null, null, 1, 2, 3],
          ["AREA", "ACTION"],
          ["FRENCH", "New custom grammar activity", complete, false, false],
        ],
      },
    ],
  };
}
const meta = {
  sheets: [
    { properties: { title: "Oct 2026", gridProperties: { rowCount: 200 } } },
  ],
};
beforeEach(() => {
  vi.resetModules();
  cache.clear();
  delete (globalThis as { cadenceSheetCache?: unknown }).cadenceSheetCache;
  delete (globalThis as { cadenceReadBudgets?: unknown }).cadenceReadBudgets;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T16:00:00Z"));
  vi.stubEnv("GOOGLE_SHEET_ID", "unit-test-source");
  vi.stubEnv("GOOGLE_SHEETS_API_KEY", "local-test-key");
  vi.stubEnv("DASHBOARD_SYNC_MODE", "poll");
  vi.stubEnv("GOOGLE_CATEGORY_DOMAINS", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("server-side source orchestration", () => {
  it("requires an explicitly configured spreadsheet ID", async () => {
    vi.stubEnv("GOOGLE_SHEET_ID", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { getDashboardData } = await import("../src/lib/sheets");
    await expect(getDashboardData()).rejects.toMatchObject({
      code: "configuration",
      message: "Set a valid GOOGLE_SHEET_ID in your host settings.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("discovers row bounds and batches all months, combining concurrent readers", async () => {
    const fetch = vi.fn(
      async (url: URL) =>
        new Response(
          JSON.stringify(
            url.pathname.endsWith("values:batchGet") ? values() : meta,
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const { getDashboardData } = await import("../src/lib/sheets");
    const [first, second] = await Promise.all([
      getDashboardData(),
      getDashboardData(),
    ]);
    expect(first.data.activities).toHaveLength(3);
    expect(first.data.refreshSeconds).toBe(15);
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(2);
    const url = fetch.mock.calls[1][0];
    expect(url.searchParams.get("ranges")).toBe("'Oct 2026'!A1:AG200");
    await getDashboardData();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("keeps webhook checks entirely on the app cache until an edit invalidates it", async () => {
    vi.stubEnv("DASHBOARD_SYNC_MODE", "webhook");
    vi.stubEnv(
      "GOOGLE_WEBHOOK_SECRET",
      "a-test-only-secret-with-more-than-32-characters",
    );
    vi.stubEnv("DASHBOARD_FALLBACK_SECONDS", "0");
    let complete = false;
    const fetch = vi.fn(
      async (url: URL) =>
        new Response(
          JSON.stringify(
            url.pathname.endsWith("values:batchGet") ? values(complete) : meta,
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const { getDashboardData, invalidateDashboard } =
      await import("../src/lib/sheets");
    await getDashboardData();
    vi.advanceTimersByTime(20_000);
    await getDashboardData();
    expect(fetch).toHaveBeenCalledTimes(2);
    complete = true;
    invalidateDashboard("unit-test-source");
    const updated = await getDashboardData();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      updated.data.activities.find((a) => a.date === "2026-10-01")?.completed,
    ).toBe(true);
  });
  it("does not hit Google again before a quota cooldown resets", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("{}", { status: 429, headers: { "Retry-After": "90" } }),
    );
    vi.stubGlobal("fetch", fetch);
    const { getDashboardData } = await import("../src/lib/sheets");
    await expect(getDashboardData()).rejects.toMatchObject({
      code: "quota",
      retryAfter: 90,
    });
    await expect(getDashboardData()).rejects.toMatchObject({ code: "quota" });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(91_000);
    await expect(getDashboardData()).rejects.toMatchObject({ code: "quota" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("preserves a successful dataset through a later Google failure", async () => {
    let fail = false;
    const fetch = vi.fn(async (url: URL) =>
      fail
        ? new Response("{}", { status: 429 })
        : new Response(
            JSON.stringify(
              url.pathname.endsWith("values:batchGet") ? values() : meta,
            ),
            { status: 200 },
          ),
    );
    vi.stubGlobal("fetch", fetch);
    const { getDashboardData } = await import("../src/lib/sheets");
    const first = await getDashboardData();
    fail = true;
    vi.advanceTimersByTime(16_000);
    const stale = await getDashboardData();
    expect(stale.stale).toBe(true);
    expect(stale.data.activities).toEqual(first.data.activities);
    expect(stale.error).toContain("wait");
  });
});
