import "server-only";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { unstable_cache, revalidateTag } from "next/cache";
import { todayInZone } from "./dates";
import { monthFromTitle, normalize, parseCSV } from "./normalize";
import { configuredSheetId } from "./source-config";
import { parsePublicTabs } from "./public-tabs";
import {
  newBudget,
  reserveRead,
  retryDelay,
  SYNC_POLICY,
  type ReadBudget,
} from "./sync-policy";
import type { Dataset, DataResponse, Domain, SheetRange } from "./types";

const STALE_LIMIT_MS = 24 * 60 * 60 * 1000;
type Cache = {
  data?: Dataset;
  fetched: number;
  attempt: number;
  cooldownUntil?: number;
  pending?: Promise<DataResponse>;
};
const globalCache = globalThis as typeof globalThis & {
  pintelliSheetCache?: Map<string, Cache>;
  pintelliReadBudgets?: Map<string, ReadBudget>;
};
const caches = (globalCache.pintelliSheetCache ??= new Map());
const budgets = (globalCache.pintelliReadBudgets ??= new Map());
export class SourceError extends Error {
  constructor(
    message: string,
    public code: string = "connection",
    public retryAfter = 60,
  ) {
    super(message);
  }
}
function configuration() {
  const sheetId = configuredSheetId();
  if (!/^[a-zA-Z0-9_-]+$/.test(sheetId))
    throw new SourceError(
      "Set a valid GOOGLE_SHEET_ID in your host settings.",
      "configuration",
    );
  const timezone = process.env.DASHBOARD_TIMEZONE || "America/Toronto";
  try {
    todayInZone(timezone);
  } catch {
    throw new SourceError(
      "DASHBOARD_TIMEZONE must be a valid IANA timezone.",
      "configuration",
    );
  }
  let ranges: string[] = [];
  if (process.env.GOOGLE_SHEET_RANGES?.trim()) {
    try {
      const v: unknown = JSON.parse(process.env.GOOGLE_SHEET_RANGES);
      if (
        !Array.isArray(v) ||
        !v.every(
          (r) => typeof r === "string" && /^'?.+?'?!A1:[A-Z]+\d+$/.test(r),
        )
      )
        throw new Error();
      ranges = v;
    } catch {
      throw new SourceError(
        "GOOGLE_SHEET_RANGES must be a JSON array of ranges starting at A1.",
        "configuration",
      );
    }
  }
  const useAPI = !!(
    process.env.GOOGLE_SHEETS_API_KEY ||
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
  const syncMode =
    process.env.DASHBOARD_SYNC_MODE === "webhook"
      ? ("webhook" as const)
      : ("poll" as const);
  if (
    syncMode === "webhook" &&
    (process.env.GOOGLE_WEBHOOK_SECRET?.length ?? 0) < 32
  )
    throw new SourceError(
      "Webhook sync needs a GOOGLE_WEBHOOK_SECRET of at least 32 characters.",
      "configuration",
    );
  const fallback = Number(process.env.DASHBOARD_FALLBACK_SECONDS ?? 900);
  if (
    !Number.isInteger(fallback) ||
    fallback < 0 ||
    (fallback > 0 && fallback < 300)
  )
    throw new SourceError(
      "DASHBOARD_FALLBACK_SECONDS must be 0 or at least 300.",
      "configuration",
    );
  let categoryDomains: Record<string, Domain> = {};
  if (process.env.GOOGLE_CATEGORY_DOMAINS?.trim()) {
    try {
      const parsed = JSON.parse(process.env.GOOGLE_CATEGORY_DOMAINS) as Record<
        string,
        Domain
      >;
      if (
        !parsed ||
        Array.isArray(parsed) ||
        !Object.values(parsed).every((d) =>
          ["health", "learning", "career", "admin"].includes(d),
        )
      )
        throw new Error();
      categoryDomains = Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k.trim().toUpperCase(), v]),
      );
    } catch {
      throw new SourceError(
        "GOOGLE_CATEGORY_DOMAINS must map category names to health, learning, career, or admin.",
        "configuration",
      );
    }
  }
  const refreshSeconds =
    syncMode === "webhook"
      ? 5
      : useAPI
        ? SYNC_POLICY.api.interval
        : SYNC_POLICY.public.interval;
  const sourceTTL: number | false =
    syncMode === "webhook"
      ? fallback === 0
        ? false
        : fallback
      : refreshSeconds;
  return {
    sheetId,
    timezone,
    ranges,
    categoryDomains,
    syncMode,
    refreshSeconds,
    sourceTTL,
  };
}
async function googleHeaders(): Promise<Record<string, string>> {
  if (
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  ) {
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(
          /\\n/g,
          "\n",
        ),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const client = await auth.getClient(),
      token = await client.getAccessToken();
    if (!token.token)
      throw new SourceError(
        "The read-only Google account could not sign in.",
        "authorization",
      );
    return { Authorization: `Bearer ${token.token}` };
  }
  if (process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    const client = new OAuth2Client(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    );
    client.setCredentials({
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    });
    const token = await client.getAccessToken();
    if (!token.token)
      throw new SourceError(
        "Reconnect the Google account in your host settings.",
        "authorization",
      );
    return { Authorization: `Bearer ${token.token}` };
  }
  return {};
}
async function request(url: URL, headers: Record<string, string> = {}) {
  const kind = url.hostname === "sheets.googleapis.com" ? "api" : "public";
  // This process-wide gate also combines SSR and API traffic. Next's Data Cache
  // shares reads across instances; this gate is an extra conservative circuit breaker.
  let budget = budgets.get(kind);
  if (!budget) {
    budget = newBudget();
    budgets.set(kind, budget);
  }
  const wait = reserveRead(budget, SYNC_POLICY[kind].readsPerMinute);
  if (wait)
    throw new SourceError(
      "Sync is waiting for its read budget to reset. Your last view is kept.",
      "quota",
      wait,
    );
  let res: Response;
  try {
    res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SourceError(
      "Google could not be reached. Your last successful data is kept.",
    );
  }
  if (res.status === 401 || res.status === 403)
    throw new SourceError(
      "Google denied access. Check sheet sharing or the read-only account.",
      "authorization",
    );
  if (res.status === 429 || res.status === 503) {
    const delay = retryDelay(budget, res.headers.get("Retry-After"));
    throw new SourceError(
      "Google asked us to wait. Sync will resume automatically after its reset.",
      "quota",
      delay,
    );
  }
  if (!res.ok)
    throw new SourceError(
      `Google could not load the tracker (${res.status}). Please retry.`,
    );
  budget.failures = 0;
  return res;
}
function apiURL(sheetId: string, path = "") {
  const u = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`,
  );
  if (process.env.GOOGLE_SHEETS_API_KEY)
    u.searchParams.set("key", process.env.GOOGLE_SHEETS_API_KEY);
  return u;
}
async function loadRanges(
  config: ReturnType<typeof configuration>,
): Promise<{ ranges: SheetRange[]; source: Dataset["source"] }> {
  const useAPI = !!(
    process.env.GOOGLE_SHEETS_API_KEY ||
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
  if (useAPI) {
    const headers = await googleHeaders();
    let ranges = config.ranges;
    if (!ranges.length) {
      const url = apiURL(config.sheetId);
      url.searchParams.set("fields", "sheets.properties(title,gridProperties)");
      const meta = await unstable_cache(
        async () =>
          (await (await request(url, headers)).json()) as {
            sheets: {
              properties: {
                title: string;
                gridProperties: { rowCount: number };
              };
            }[];
          },
        ["pintelli-tab-metadata-v2", config.sheetId],
        { revalidate: 60, tags: [`pintelli-tabs-${config.sheetId}`] },
      )();
      ranges = meta.sheets
        .filter((s) => monthFromTitle(s.properties.title))
        .map(
          (s) =>
            `'${s.properties.title.replace(/'/g, "''")}'!A1:AG${s.properties.gridProperties.rowCount}`,
        );
    }
    if (!ranges.length)
      throw new SourceError(
        "No monthly tabs were found in the tracker.",
        "schema",
      );
    const url = apiURL(config.sheetId, "/values:batchGet");
    ranges.forEach((range) => url.searchParams.append("ranges", range));
    url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
    const body = (await (await request(url, headers)).json()) as {
      valueRanges: SheetRange[];
    };
    return { ranges: body.valueRanges, source: "google-api" };
  }
  // CSV export (not gviz) preserves mixed-type columns and blank cells exactly.
  // Discover real tab IDs every minute, including newly added months.
  let tabs = await unstable_cache(
    async () => {
      const url = new URL(
        `https://docs.google.com/spreadsheets/d/${config.sheetId}/htmlview`,
      );
      return parsePublicTabs(await (await request(url)).text());
    },
    ["pintelli-public-tab-index-v2", config.sheetId],
    { revalidate: 60, tags: [`pintelli-tabs-${config.sheetId}`] },
  )();
  if (tabs.length > 40)
    throw new SourceError(
      "Connect Sheets API mode for trackers with more than 40 monthly tabs.",
      "configuration",
    );
  if (config.ranges.length) {
    const names = config.ranges.map((r) =>
      r.split("!")[0].replace(/^'|'$/g, "").replace(/''/g, "'"),
    );
    if (names.some((name) => !tabs.some((t) => t.title === name)))
      throw new SourceError(
        "A configured monthly range was not found. Check GOOGLE_SHEET_RANGES.",
        "configuration",
      );
    tabs = tabs.filter((t) => names.includes(t.title));
  }
  const ranges: SheetRange[] = [];
  // Three requests at a time; successful reads are shared for one minute.
  for (let i = 0; i < tabs.length; i += 3) {
    const batch = await Promise.all(
      tabs.slice(i, i + 3).map(async (tab) => {
        const url = new URL(
          `https://docs.google.com/spreadsheets/d/${config.sheetId}/export`,
        );
        url.searchParams.set("format", "csv");
        url.searchParams.set("gid", String(tab.gid));
        const res = await request(url);
        const csv = await res.text();
        if (/<!doctype|<html/i.test(csv))
          throw new SourceError(
            "This tracker is private. Configure a read-only Google account.",
            "authorization",
          );
        return {
          range: `'${tab.title.replace(/'/g, "''")}'!A1:AG`,
          values: parseCSV(csv),
        };
      }),
    );
    ranges.push(...batch);
  }
  return { ranges, source: "google-public" };
}
export async function getDashboardData(): Promise<DataResponse> {
  const config = configuration(),
    key = JSON.stringify(config),
    now = Date.now();
  const CACHE_MS = (config.refreshSeconds - 2) * 1000;
  let cache = caches.get(key);
  if (!cache) {
    cache = { fetched: 0, attempt: 0 };
    caches.set(key, cache);
  }
  if (cache.cooldownUntil && now < cache.cooldownUntil) {
    const wait = Math.ceil((cache.cooldownUntil - now) / 1000);
    if (cache.data)
      return {
        data: { ...cache.data, today: todayInZone(config.timezone) },
        stale: true,
        error: `Sync is waiting for Google. The next attempt is in about ${wait} seconds.`,
      };
    throw new SourceError(
      "Sync is waiting for Google’s read budget to reset. It will retry automatically.",
      "quota",
      wait,
    );
  }
  if (
    config.syncMode !== "webhook" &&
    cache.data &&
    now - cache.fetched < CACHE_MS
  )
    return {
      data: { ...cache.data, today: todayInZone(config.timezone) },
      stale: false,
    };
  if (cache.pending) return cache.pending;
  if (config.syncMode !== "webhook" && now - cache.attempt < CACHE_MS) {
    if (cache.data && now - cache.fetched < STALE_LIMIT_MS)
      return {
        data: { ...cache.data, today: todayInZone(config.timezone) },
        stale: true,
        error: "Waiting to reconnect to Google.",
      };
    throw new SourceError(
      "Google is unavailable. The next connection attempt is within a minute.",
    );
  }
  cache.attempt = now;
  const entry = cache;
  entry.pending = (async () => {
    try {
      // Next's Data Cache shares successful reads across SSR and API handlers,
      // including warm instances on Vercel. Never cache a failed/partial dataset.
      const data = await unstable_cache(
        async () => {
          const raw = await loadRanges(config),
            parsed = normalize(raw.ranges, config.categoryDomains);
          return {
            ...parsed,
            source: raw.source,
            fetchedAt: new Date().toISOString(),
            today: todayInZone(config.timezone),
            timezone: config.timezone,
            sheetId: config.sheetId,
            refreshSeconds: config.refreshSeconds,
            syncMode: config.syncMode,
          } satisfies Dataset;
        },
        ["pintelli-live-source-v4", key],
        {
          revalidate: config.sourceTTL,
          tags: [`pintelli-data-${config.sheetId}`],
        },
      )();
      data.today = todayInZone(config.timezone);
      entry.data = data;
      entry.fetched = Date.now();
      return { data, stale: false };
    } catch (error) {
      entry.cooldownUntil =
        Date.now() +
        (error instanceof SourceError ? error.retryAfter : 60) * 1000;
      if (entry.data && Date.now() - entry.fetched < STALE_LIMIT_MS)
        return {
          data: { ...entry.data, today: todayInZone(config.timezone) },
          stale: true,
          error:
            error instanceof SourceError
              ? error.message
              : "The tracker structure changed. Please check the monthly tabs.",
        };
      if (error instanceof SourceError) throw error;
      throw new SourceError(
        error instanceof Error &&
          /header|monthly|Conflicting|ranges|tabs/.test(error.message)
          ? error.message
          : "The tracker could not be read. Check your connection settings.",
        "schema",
      );
    } finally {
      entry.pending = undefined;
    }
  })();
  return entry.pending;
}
export function invalidateDashboard(sheetId: string, structure = false) {
  revalidateTag(`pintelli-data-${sheetId}`, { expire: 0 });
  if (structure) revalidateTag(`pintelli-tabs-${sheetId}`, { expire: 0 });
  for (const cache of caches.values())
    if (cache.data?.sheetId === sheetId) cache.fetched = 0;
}
