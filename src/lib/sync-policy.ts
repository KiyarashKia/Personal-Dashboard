/** Conservative application budgets, separate from Google's larger quotas. */
export const SYNC_POLICY = {
  api: { interval: 15, readsPerMinute: 8 },
  public: { interval: 60, readsPerMinute: 45 },
} as const;
export interface ReadBudget {
  windowStart: number;
  used: number;
  blockedUntil: number;
  failures: number;
}
export const newBudget = (): ReadBudget => ({
  windowStart: 0,
  used: 0,
  blockedUntil: 0,
  failures: 0,
});
export function reserveRead(
  budget: ReadBudget,
  limit: number,
  now = Date.now(),
): number {
  if (now < budget.blockedUntil)
    return Math.ceil((budget.blockedUntil - now) / 1000);
  if (now - budget.windowStart >= 60_000) {
    budget.windowStart = now;
    budget.used = 0;
  }
  if (budget.used >= limit)
    return Math.max(1, Math.ceil((budget.windowStart + 60_000 - now) / 1000));
  budget.used++;
  return 0;
}
export function retryDelay(
  budget: ReadBudget,
  retryAfter: string | null,
  now = Date.now(),
): number {
  budget.failures++;
  const parsed = retryAfter ? Number(retryAfter) : NaN;
  const header = Number.isFinite(parsed)
    ? parsed
    : retryAfter
      ? Math.max(0, (Date.parse(retryAfter) - now) / 1000)
      : 0;
  const seconds = Math.max(
    60,
    Number.isFinite(header) ? header : 0,
    Math.min(900, 60 * 2 ** Math.min(4, budget.failures - 1)),
  );
  budget.blockedUntil = now + seconds * 1000;
  return seconds;
}
