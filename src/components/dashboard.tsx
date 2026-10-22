"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import { MotionConfig, motion } from "motion/react";
import {
  Activity as ActivityIcon,
  ArrowDownLeft,
  ArrowUpRight,
  Asterisk,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Flame,
  Heart,
  Layers3,
  Leaf,
  RefreshCw,
  Settings2,
  Target,
  TrendingUp,
  WifiOff,
  X,
} from "lucide-react";
import {
  addDays,
  dateObject,
  formatDate,
  movePeriod,
  periodFor,
  periodLabel,
  todayInZone,
} from "@/lib/dates";
import { computeMetrics, count, percent, validWeights } from "@/lib/metrics";
import {
  DEFAULT_WEIGHTS,
  type DataResponse,
  type Mode,
  type Rate,
  type Weights,
} from "@/lib/types";
import {
  DOMAIN_TONES,
  DomainBars,
  DomainRings,
  Heatmap,
  Meter,
  Ring,
  Sparkline,
  TrendChart,
} from "./charts";
import { Card } from "./card";

const MODES: Mode[] = ["day", "week", "month", "year"];
const CARD_IDS = ["hero", "french", "health", "activity", "focus"] as const;
const PAGE_NAMES = ["Progress", "French", "Health", "Activity", "Focus"];
const TITLES: Record<Mode, string> = {
  day: "A little progress, every day.",
  week: "Find your rhythm.",
  month: "Small steps. Lasting momentum.",
  year: "The whole plan at a glance.",
};
const PERIOD_NAMES: Record<Mode, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
};
async function fetcher(url: string): Promise<DataResponse> {
  const res = await fetch(url, { cache: "no-store" }),
    body = await res.json();
  if (!res.ok)
    throw new Error(body.error || "The tracker is temporarily unavailable.");
  return body;
}
function NumberValue({
  value,
  unit,
  className = "",
}: {
  value: string | number;
  unit?: string;
  className?: string;
}) {
  return (
    <div className={`number-value ${className}`}>
      <span>{value}</span>
      {unit && <small>{unit}</small>}
    </div>
  );
}
function Change({
  value,
  context = "vs. last period",
}: {
  value: number | null;
  context?: string;
}) {
  return (
    <span
      className={`change ${value === null ? "unavailable" : value < 0 ? "negative" : "positive"}`}
    >
      {value === null ? (
        <>
          <span className="comparison-dash">—</span> No comparison yet
        </>
      ) : (
        <>
          {value >= 0 ? (
            <ArrowUpRight size={15} />
          ) : (
            <ArrowDownLeft size={15} />
          )}{" "}
          {Math.abs(value).toFixed(1)} points <span>{context}</span>
        </>
      )}
    </span>
  );
}
function RateBars({
  rows,
}: {
  rows: {
    label: string;
    rate: number | null;
    completed: number;
    scheduled: number;
    color?: string;
  }[];
}) {
  return (
    <div className="rate-bars">
      {rows.map((r) => (
        <div key={r.label} className={`rate-row ${r.color ?? "blue"}`}>
          <div>
            <span>
              {r.label}
              <small>
                {r.completed}/{r.scheduled}
              </small>
            </span>
            <b>{percent(r.rate)}</b>
          </div>
          <div className="bar-track">
            <i style={{ transform: `scaleX(${r.rate ?? 0})` }} />
          </div>
          <span className="sr-only">
            {r.completed} of {r.scheduled} done
          </span>
        </div>
      ))}
    </div>
  );
}

/** Done against what is due so far, plus everything planned in the period. */
function countNote({ completed, scheduled }: Rate, planned: number) {
  if (!scheduled)
    return planned
      ? `${count(planned)} planned · none due yet`
      : "Nothing planned";
  return planned > scheduled
    ? `${count(completed)} of ${count(scheduled)} due so far · ${count(planned)} planned`
    : `${count(completed)} of ${count(scheduled)} done`;
}
function days(n: number) {
  return `${n} ${n === 1 ? "day" : "days"}`;
}
function OverviewTile({
  id,
  open,
  onToggle,
  icon,
  label,
  value,
  visual,
  note,
  children,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  visual: ReactNode;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className={`overview-card ${open ? "expanded" : ""}`}>
      <button
        className="overview-summary"
        aria-expanded={open}
        aria-controls={`more-${id}`}
        onClick={onToggle}
      >
        <span className="overview-label">
          {icon}
          <span>{label}</span>
          <ChevronDown size={15} className="overview-chevron" />
        </span>
        <span className="overview-content">
          {value}
          {visual}
        </span>
        <span className="overview-note">{note}</span>
      </button>
      <div className="overview-more" id={`more-${id}`}>
        <div>{children}</div>
      </div>
    </div>
  );
}

export default function Dashboard({
  initial,
  initialError,
  initialMode = "month",
  initialAnchor,
}: {
  initial?: DataResponse;
  initialError?: string;
  initialMode?: Mode;
  initialAnchor?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [anchor, setAnchor] = useState(
    initialAnchor ?? initial?.data.today ?? todayInZone("America/Toronto"),
  );
  const [page, setPage] = useState(0),
    [compact, setCompact] = useState(false),
    [short, setShort] = useState(false);
  const [states, setStates] = useState<Record<string, number>>({
    hero: 0,
    french: 0,
    health: 0,
    activity: 0,
    focus: 0,
  });
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS),
    [draft, setDraft] = useState<Weights>(DEFAULT_WEIGHTS);
  const [panel, setPanel] = useState<
    "connection" | "balance" | "overview" | "help" | null
  >(null);
  const [online, setOnline] = useState(true),
    [now, setNow] = useState(initial ? Date.parse(initial.data.fetchedAt) : 0);
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const refresh = initial?.data.refreshSeconds ?? 60;
  const { data, error, isValidating, mutate } = useSWR<DataResponse>(
    "/api/dashboard",
    fetcher,
    {
      fallbackData: initial,
      refreshInterval: (response) =>
        (response?.data.refreshSeconds ?? refresh) * 1000,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      revalidateOnMount: !initial,
      dedupingInterval: 12_000,
      focusThrottleInterval: 12_000,
      errorRetryCount: 3,
      errorRetryInterval: 60_000,
      keepPreviousData: true,
    },
  );
  const dataset = data?.data;
  const metrics = useMemo(
    () =>
      dataset
        ? computeMetrics(
            dataset.activities,
            mode,
            anchor,
            dataset.today,
            weights,
          )
        : null,
    [dataset, mode, anchor, weights],
  );
  const sourceURL = dataset
    ? `https://docs.google.com/spreadsheets/d/${dataset.sheetId}/edit`
    : null;
  useEffect(() => {
    const params = new URLSearchParams(location.search),
      m = params.get("mode"),
      date = params.get("date");
    if (MODES.includes(m as Mode)) setMode(m as Mode);
    if (
      date &&
      /^20\d{2}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(dateObject(date).getTime()) &&
      dateObject(date).toISOString().slice(0, 10) === date
    )
      setAnchor(date);
    try {
      const stored = JSON.parse(
        localStorage.getItem("pintelli-balance-weights") ??
          // Weights saved before the rename.
          localStorage.getItem("cadence-balance-weights") ??
          "null",
      );
      if (validWeights(stored)) {
        setWeights(stored);
        setDraft(stored);
      }
    } catch {}
    function resize() {
      setCompact(window.innerWidth < 1100 || window.innerHeight < 650);
      setShort(window.innerHeight < 560);
    }
    function connection() {
      setOnline(navigator.onLine);
    }
    resize();
    connection();
    window.addEventListener("resize", resize);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (panel) {
      dialog.current?.showModal();
    } else if (dialog.current?.open) {
      dialog.current.close();
    }
  }, [panel]);
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        dialog.current?.open ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      if (e.key === "Escape") setOpen(null);
      if (e.key.toLowerCase() === "t") {
        setAnchor(dataset?.today ?? anchor);
      }
      if (e.key.toLowerCase() === "r") void mutate();
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [dataset?.today, anchor, mutate]);
  function selectMode(next: Mode) {
    setMode(next);
    updateURL(next, anchor);
  }
  function updateURL(m: Mode, date: string) {
    const url = new URL(location.href);
    url.searchParams.set("mode", m);
    url.searchParams.set("date", date);
    history.replaceState(null, "", url);
  }
  // Year shows the whole plan, so there is no other year to move to.
  const plan = metrics?.plan ?? null,
    fixedPeriod = mode === "year" && !!plan;
  function navigate(direction: number) {
    const next = movePeriod(mode, anchor, direction);
    setAnchor(next);
    updateURL(mode, next);
  }
  function state(id: string, index: number) {
    setStates((old) => ({ ...old, [id]: index }));
  }
  function toggle(tile: number) {
    setOpen((old) => (old === tile ? null : tile));
  }
  function openBalance() {
    setDraft(weights);
    setPanel("balance");
  }
  const elapsed = dataset
    ? Math.max(
        0,
        Math.floor((now - new Date(dataset.fetchedAt).getTime()) / 1000),
      )
    : 0;
  const stale =
    !!data?.stale ||
    !!error ||
    !online ||
    !!(
      dataset &&
      dataset.syncMode !== "webhook" &&
      elapsed > dataset.refreshSeconds * 3
    );
  const syncText = !online
    ? "Offline"
    : !dataset
      ? "Connection needed"
      : stale
        ? "Last saved view"
        : isValidating
          ? "Checking for changes"
          : "Connected to Sheets";
  const stateKey = `${mode}-${anchor}`;
  // A period in progress is compared with the same point in the last one.
  const changeContext =
    mode === "day"
      ? "vs. the day before"
      : `vs. ${metrics?.partial ? "this point " : ""}last ${mode}`;
  const m = metrics;
  const fullDay =
    mode === "day" &&
    m &&
    m.performance.scheduled > 0 &&
    m.performance.completed === m.performance.scheduled;
  const mainCard = (id: string) => !compact || CARD_IDS[page] === id;

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`app-shell mode-${mode} ${compact ? "is-compact" : ""} ${short ? "is-short" : ""}`}
      >
        <a href="#dashboard-canvas" className="skip-link">
          Skip to dashboard
        </a>
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark">
              <Asterisk size={26} strokeWidth={1.5} />
            </span>
            <div>
              Pintelli<span>PERSONAL INTELLIGENCE</span>
            </div>
          </div>
          <nav className="mode-control" aria-label="Dashboard perspective">
            {MODES.map((item, i) => (
              <button
                key={item}
                aria-pressed={mode === item}
                onClick={() => selectMode(item)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    const n = (i + (e.key === "ArrowLeft" ? -1 : 1) + 4) % 4;
                    selectMode(MODES[n]);
                    e.currentTarget.parentElement
                      ?.querySelectorAll("button")
                      [n].focus();
                  }
                }}
              >
                {mode === item && (
                  <motion.span
                    className="segment-indicator"
                    layoutId="perspective"
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  />
                )}
                <span>{item.charAt(0).toUpperCase() + item.slice(1)}</span>
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <button
              className={`sync-button ${stale ? "stale" : ""}`}
              onClick={() => setPanel("connection")}
              aria-label={`${syncText}. Open connection details`}
            >
              <span
                className={`sync-light ${isValidating ? "checking" : ""}`}
              />
              <span>{syncText}</span>
            </button>
            <button
              className="icon-button"
              onClick={openBalance}
              aria-label="Dashboard settings"
            >
              <Settings2 size={19} />
            </button>
          </div>
        </header>
        <div className="title-row">
          <h1>{TITLES[mode]}</h1>
          <div className="period-picker">
            <button
              className="icon-button"
              aria-label="Previous period"
              disabled={fixedPeriod}
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <span>{periodLabel(mode, anchor, plan)}</span>
              <small>
                {m?.future
                  ? "Upcoming"
                  : m?.partial
                    ? `Through ${formatDate(dataset!.today)}`
                    : mode === "week"
                      ? "Sunday – Saturday"
                      : mode === "day" && anchor === dataset?.today
                        ? "Today"
                        : "Complete"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Next period"
              disabled={fixedPeriod}
              onClick={() => navigate(1)}
            >
              <ChevronRight size={18} />
            </button>
            <button
              className="today-button"
              disabled={
                !dataset ||
                periodFor(mode, anchor, plan).start ===
                  periodFor(mode, dataset.today, plan).start
              }
              onClick={() => {
                setAnchor(dataset?.today ?? anchor);
                updateURL(mode, dataset?.today ?? anchor);
              }}
            >
              Today
            </button>
          </div>
        </div>
        {m && (
          <div
            className="overview"
            aria-label="Totals through today"
            data-open={open ?? undefined}
          >
            <OverviewTile
              id="overall"
              open={open === 0}
              onToggle={() => toggle(0)}
              icon={<Target size={16} />}
              label="Completion to date"
              value={<NumberValue value={percent(m.global.overall.rate)} />}
              visual={
                <div className="mini-progress">
                  <i
                    style={{
                      transform: `scaleX(${m.global.overall.rate ?? 0})`,
                    }}
                  />
                </div>
              }
              note={`${count(m.global.overall.completed)} of ${count(m.global.overall.scheduled)} due so far`}
            >
              <dl className="overview-facts">
                <div>
                  <dt>Done</dt>
                  <dd>{count(m.global.overall.completed)}</dd>
                </div>
                <div>
                  <dt>Due so far</dt>
                  <dd>{count(m.global.overall.scheduled)}</dd>
                </div>
                <div>
                  <dt>Planned in total</dt>
                  <dd>{count(m.global.planned)}</dd>
                </div>
              </dl>
              <p className="fine-print">
                Counts every activity due through today, in any period.
              </p>
            </OverviewTile>
            <OverviewTile
              id="balance"
              open={open === 1}
              onToggle={() => toggle(1)}
              icon={<Leaf size={16} />}
              label="Routine balance"
              value={
                <NumberValue
                  value={m.global.balance.score ?? "—"}
                  unit="/ 100"
                />
              }
              visual={<DomainBars data={m.global.balance.domains} />}
              note={m.global.balance.phrase}
            >
              <dl className="overview-facts">
                {m.global.balance.domains.map((d) => (
                  <div key={d.domain}>
                    <dt>
                      <span
                        className={`domain-dot ${DOMAIN_TONES[d.domain]}`}
                      />
                      {d.label}
                    </dt>
                    <dd>
                      {d.rate === null ? "Not scheduled" : percent(d.rate)}
                      <small>{d.weight}% weight</small>
                    </dd>
                  </div>
                ))}
              </dl>
              <button className="text-button" onClick={openBalance}>
                Adjust weights
              </button>
            </OverviewTile>
            <OverviewTile
              id="streak"
              open={open === 2}
              onToggle={() => toggle(2)}
              icon={<Flame size={16} />}
              label="French streak"
              value={
                <NumberValue
                  value={m.global.streak.current}
                  unit={m.global.streak.current === 1 ? "day" : "days"}
                />
              }
              visual={
                <div className="streak-marks" aria-hidden="true">
                  {Array.from({ length: 7 }, (_, i) => (
                    <i
                      className={i < m.global.streak.current ? "on" : ""}
                      key={i}
                    />
                  ))}
                </div>
              }
              note="Days in a row with French"
            >
              <dl className="overview-facts">
                <div>
                  <dt>Current</dt>
                  <dd>{days(m.global.streak.current)}</dd>
                </div>
                <div>
                  <dt>Longest</dt>
                  <dd>{days(m.global.streak.longest)}</dd>
                </div>
                <div>
                  <dt>Practice days</dt>
                  <dd>{m.global.streak.practiceDays}</dd>
                </div>
              </dl>
              <p className="fine-print">
                Days with no French planned don’t break a streak. Today counts
                once it’s done.
              </p>
            </OverviewTile>
            <OverviewTile
              id="momentum"
              open={open === 3}
              onToggle={() => toggle(3)}
              icon={<TrendingUp size={16} />}
              label="Last 30 days"
              value={<NumberValue value={percent(m.global.rolling.rate)} />}
              visual={<Sparkline data={m.global.spark.map((d) => d.rate)} />}
              note={`${count(m.global.rolling.completed)} of ${count(m.global.rolling.scheduled)} done`}
            >
              <dl className="overview-facts">
                <div>
                  <dt>Done</dt>
                  <dd>
                    {count(m.global.rolling.completed)} of{" "}
                    {count(m.global.rolling.scheduled)}
                  </dd>
                </div>
                <div>
                  <dt>Vs. the 30 days before</dt>
                  <dd>
                    {m.global.rollingChange === null
                      ? "No comparison yet"
                      : `${m.global.rollingChange >= 0 ? "+" : "−"}${Math.abs(m.global.rollingChange).toFixed(1)} points`}
                  </dd>
                </div>
              </dl>
            </OverviewTile>
          </div>
        )}
        <main
          id="dashboard-canvas"
          className="dashboard-canvas"
          tabIndex={-1}
          aria-label={`${PERIOD_NAMES[mode]} dashboard`}
        >
          {!m ? (
            <div className="connection-empty">
              <Layers3 size={40} />
              <h2>
                {isValidating ? "Loading tracker…" : "Tracker not connected"}
              </h2>
              <p>
                {error?.message ||
                  initialError ||
                  "Check that the Google Sheet is shared, then try again."}
              </p>
              <div>
                <button
                  className="primary-button"
                  onClick={() => void mutate()}
                  disabled={isValidating}
                >
                  <RefreshCw size={16} /> Try again
                </button>
                {sourceURL && (
                  <a
                    className="secondary-button"
                    href={sourceURL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open tracker <ExternalLink size={15} />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <>
              {mainCard("hero") && (
                <Card
                  id="hero"
                  title={`${PERIOD_NAMES[mode]} progress`}
                  icon={<Target size={17} />}
                  eyebrow={
                    m.future ? "Upcoming" : m.partial ? "To date" : "Overview"
                  }
                  states={["Progress", "Trend", "By area"]}
                  index={states.hero}
                  onChange={(i) => state("hero", i)}
                  tone="hero"
                  motionKey={stateKey}
                >
                  {states.hero === 0 ? (
                    <div
                      className={`hero-completion ${fullDay ? "fully-complete" : ""}`}
                    >
                      <div className="hero-number">
                        <NumberValue value={percent(m.progress.rate)} />
                        <span className="hero-period">
                          {fullDay ? (
                            <>
                              <CheckCheck size={17} /> Everything, done.
                            </>
                          ) : m.future ? (
                            "A little planning goes a long way."
                          ) : m.performance.completed ? (
                            "Every step adds up."
                          ) : (
                            "A fresh start."
                          )}
                        </span>
                      </div>
                      <div className="hero-bottom">
                        <div className="hero-count">
                          <span>{count(m.progress.completed)}</span>
                          <div>
                            done
                            <small>
                              {m.planned.all
                                ? `of ${count(m.planned.all)} planned`
                                : "Nothing planned"}
                            </small>
                          </div>
                        </div>
                        <div className="hero-progress">
                          <i
                            style={{
                              transform: `scaleX(${m.progress.rate ?? 0})`,
                            }}
                          />
                        </div>
                        {m.partial && m.performance.scheduled > 0 && (
                          <p className="hero-pace">
                            <b>{percent(m.performance.rate)}</b> of the{" "}
                            {count(m.performance.scheduled)} due so far
                          </p>
                        )}
                        {!fixedPeriod && (
                          <Change value={m.change} context={changeContext} />
                        )}
                      </div>
                      <DomainRings data={m.distribution} />
                    </div>
                  ) : states.hero === 1 ? (
                    <div className="hero-trend">
                      <div className="detail-lead">
                        <NumberValue value={percent(m.performance.rate)} />
                        <p>
                          {m.partial ? "Of what’s due so far, " : "Done, "}
                          {mode === "year"
                            ? "month by month."
                            : mode === "month"
                              ? "week by week."
                              : "day by day."}
                        </p>
                      </div>
                      <TrendChart
                        data={m.trend}
                        mode={
                          mode === "year"
                            ? "month"
                            : mode === "month"
                              ? "week"
                              : "day"
                        }
                      />
                      {!fixedPeriod && (
                        <Change value={m.change} context={changeContext} />
                      )}
                    </div>
                  ) : (
                    <div className="distribution-view">
                      <div className="detail-lead">
                        <NumberValue
                          value={count(m.progress.completed)}
                          unit="done"
                        />
                        <p>Progress by area, against everything planned.</p>
                      </div>
                      <RateBars
                        rows={m.distribution.map((d) => ({
                          ...d,
                          color: DOMAIN_TONES[d.domain],
                        }))}
                      />
                      <div className="distribution-counts">
                        {m.distribution.map((d) => (
                          <span key={d.domain}>
                            <i className={DOMAIN_TONES[d.domain]} />
                            {d.label}
                            <b>{d.completed}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              )}
              {mainCard("french") && (
                <Card
                  id="french"
                  title="French"
                  icon={<BookOpen size={17} />}
                  eyebrow="Learning"
                  states={["Consistency", "Practice days", "Skills"]}
                  index={states.french}
                  onChange={(i) => state("french", i)}
                  tone="blue"
                  motionKey={stateKey}
                >
                  {states.french === 0 ? (
                    <div className="centered-metric">
                      <Ring value={m.french.rate}>
                        <NumberValue value={percent(m.french.rate)} />
                        <span>consistency</span>
                      </Ring>
                      <p className="metric-context">
                        {countNote(m.french, m.planned.french)}
                      </p>
                    </div>
                  ) : states.french === 1 ? (
                    <div className="practice-view">
                      <NumberValue
                        value={m.activeFrenchDays}
                        unit={
                          m.activeFrenchDays === 1
                            ? "practice day"
                            : "practice days"
                        }
                      />
                      <div className="practice-strip">
                        {Array.from({ length: 7 }, (_, i) => {
                          const date = addDays(
                              periodFor("week", anchor).start,
                              i,
                            ),
                            planned = dataset!.activities.filter(
                              (a) => a.date === date && a.domain === "learning",
                            ),
                            done =
                              planned.some((a) => a.completed) &&
                              date <= dataset!.today;
                          return (
                            <div key={date}>
                              <span>
                                {["S", "M", "T", "W", "T", "F", "S"][i]}
                              </span>
                              <i
                                className={
                                  done
                                    ? "done"
                                    : date > dataset!.today
                                      ? "future"
                                      : planned.length
                                        ? "scheduled"
                                        : ""
                                }
                              >
                                {done && <Check size={12} />}
                              </i>
                              <span className="sr-only">
                                {formatDate(date)}:{" "}
                                {done
                                  ? "practiced"
                                  : planned.length
                                    ? "scheduled"
                                    : "unscheduled"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="metric-context">
                        {mode === "year"
                          ? `${m.activeFrenchWeeks} ${m.activeFrenchWeeks === 1 ? "week" : "weeks"} with French`
                          : "Sunday to Saturday"}
                      </p>
                    </div>
                  ) : (
                    <div className="skills-view">
                      {!m.skills.length && (
                        <p className="metric-context">
                          Add rows like Listening to the tracker to see each
                          skill.
                        </p>
                      )}
                      {m.skills.map((s) => (
                        <div className="skill-row" key={s.skill}>
                          <span>{s.skill}</span>
                          <div className="bar-track">
                            <i
                              style={{ transform: `scaleX(${s.rate ?? 0})` }}
                            />
                          </div>
                          <b>
                            {s.completed}
                            <small> / {s.scheduled}</small>
                          </b>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
              {mainCard("health") && (
                <Card
                  id="health"
                  title="Health"
                  icon={<Heart size={17} />}
                  eyebrow="Wellbeing"
                  states={["Completion", "Activities", "Trend"]}
                  index={states.health}
                  onChange={(i) => state("health", i)}
                  tone="mint"
                  motionKey={stateKey}
                >
                  {states.health === 0 ? (
                    <div className="health-view">
                      <NumberValue value={percent(m.health.rate)} />
                      <p className="metric-context">
                        {m.healthHabits.length
                          ? m.healthHabits.map((h) => h.habit).join(" and ")
                          : "Nothing planned"}
                      </p>
                      <Meter rate={m.health.rate} />
                      <p className="metric-context">
                        {countNote(m.health, m.planned.health)}
                      </p>
                    </div>
                  ) : states.health === 1 ? (
                    <div className="health-habits">
                      {m.healthHabits.length ? (
                        <RateBars
                          rows={m.healthHabits.map((h) => ({
                            ...h,
                            label: h.habit,
                            color: "mint",
                          }))}
                        />
                      ) : (
                        <p className="metric-context">
                          No health activities planned in this period.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="health-trend">
                      <TrendChart
                        data={m.healthTrend}
                        mode={mode === "year" ? "month" : "week"}
                        color="mint"
                      />
                    </div>
                  )}
                </Card>
              )}
              {mainCard("activity") && (
                <Card
                  id="activity"
                  title="Activity rhythm"
                  icon={<ActivityIcon size={17} />}
                  eyebrow={mode === "year" ? "The long view" : "Day by day"}
                  states={["Activity map", "Milestones"]}
                  index={states.activity}
                  onChange={(i) => state("activity", i)}
                  motionKey={stateKey}
                >
                  {states.activity === 0 ? (
                    <Heatmap data={m.heatmap} />
                  ) : (
                    <div className="milestones-view">
                      <div>
                        <NumberValue value={m.fullDays} unit="full days" />
                        <p>Days with everything done.</p>
                      </div>
                      <div className="milestone-bottom">
                        <CheckCheck size={24} />
                        <span>
                          {mode === "day"
                            ? m.fullDays
                              ? "Everything done today."
                              : "There’s still time for a small win."
                            : "A steady routine starts with one full day."}
                        </span>
                      </div>
                    </div>
                  )}
                </Card>
              )}
              {mainCard("focus") && (
                <Card
                  id="focus"
                  title={
                    mode === "year" ? "In perspective" : "A little perspective"
                  }
                  icon={<Leaf size={17} />}
                  states={["Habit spotlight", "Career & life", "Best month"]}
                  index={states.focus}
                  onChange={(i) => state("focus", i)}
                  motionKey={stateKey}
                >
                  {states.focus === 0 ? (
                    <div className="spotlight-view">
                      <span className="spotlight-icon">
                        <Leaf size={25} strokeWidth={1.4} />
                      </span>
                      <h3>
                        {!m.rankings.best
                          ? "Give habits a little time."
                          : m.rankings.tied
                            ? "Your habits are at the same pace."
                            : m.rankings.best.habit}
                      </h3>
                      <p>
                        {!m.rankings.best
                          ? "Habits are compared once each one has been due 3 times."
                          : m.rankings.tied
                            ? `${percent(m.rankings.best.rate)} done for each habit.`
                            : `${percent(m.rankings.best.rate)} done · most consistent habit`}
                      </p>
                      {m.rankings.lowest && !m.rankings.tied && (
                        <span className="attention-habit">
                          Needs attention{" "}
                          <b>
                            {m.rankings.lowest.habit} ·{" "}
                            {percent(m.rankings.lowest.rate)}
                          </b>
                        </span>
                      )}
                    </div>
                  ) : states.focus === 1 ? (
                    <div className="career-view">
                      {[
                        { label: "Portfolio", r: m.portfolio },
                        { label: "Job & income", r: m.income },
                        { label: "Immigration & finances", r: m.admin },
                        { label: "Weekly reflection", r: m.reflection },
                      ].map(({ label, r }) => (
                        <div key={label}>
                          <span>{label}</span>
                          <b>
                            {r.completed}
                            <small> / {r.scheduled}</small>
                          </b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="best-month-view">
                      <span className="section-kicker">
                        Most consistent month
                      </span>
                      <h3>
                        {m.mostConsistent
                          ? formatDate(m.mostConsistent.date, { month: "long" })
                          : "Still to come."}
                      </h3>
                      <NumberValue
                        value={percent(m.mostConsistent?.rate ?? null)}
                      />
                      <p className="metric-context">
                        {m.mostConsistent
                          ? `${count(m.mostConsistent.completed)} of ${count(m.mostConsistent.scheduled)} done`
                          : "Shows once a month has activities due."}
                      </p>
                    </div>
                  )}
                </Card>
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <div className={`footer-status ${stale ? "stale" : ""}`}>
            <span className="sync-light" />
            <span>
              {!dataset
                ? "Waiting for your tracker"
                : !online
                  ? "Offline · showing your last successful sync"
                  : stale
                    ? "Connection interrupted · keeping your last view"
                    : `Synced ${elapsed < 60 ? "just now" : `${Math.floor(elapsed / 60)}m ago`} · ${dataset.syncMode === "webhook" ? "edit-driven sync" : `checks every ${dataset.refreshSeconds}s`}`}
            </span>
            {stale && (
              <button onClick={() => void mutate()} aria-label="Retry sync">
                <RefreshCw size={14} />
              </button>
            )}
          </div>
          {compact && m && (
            <nav className="canvas-pagination" aria-label="Dashboard cards">
              {PAGE_NAMES.map((name, i) => (
                <button
                  key={name}
                  aria-pressed={page === i}
                  onClick={() => setPage(i)}
                >
                  {name}
                </button>
              ))}
            </nav>
          )}
          <button className="footer-help" onClick={() => setPanel("help")}>
            <CircleHelp size={15} />
            <span>Help</span>
          </button>
          {short && m && (
            <button
              className="short-overview-button"
              onClick={() => setPanel("overview")}
            >
              Overview
            </button>
          )}
        </footer>
        <dialog
          ref={dialog}
          className="settings-dialog"
          onCancel={() => setPanel(null)}
          onClose={() => setPanel(null)}
          onClick={(e) => {
            if (e.target === dialog.current) setPanel(null);
          }}
          aria-labelledby="panel-title"
        >
          {panel && (
            <>
              <header className="dialog-heading">
                <h2 id="panel-title">
                  {panel === "connection"
                    ? "Connection"
                    : panel === "balance"
                      ? "Routine balance"
                      : panel === "overview"
                        ? "Overview"
                        : "Help"}
                </h2>
                <button
                  className="icon-button"
                  aria-label="Close details"
                  onClick={() => setPanel(null)}
                >
                  <X size={20} />
                </button>
              </header>
              <div className="dialog-body">
                {panel === "connection" ? (
                  <>
                    <div className={`connection-state ${stale ? "stale" : ""}`}>
                      {online ? <RefreshCw size={23} /> : <WifiOff size={23} />}
                      <div>
                        <h3>{syncText}</h3>
                        <p>
                          {data?.error ||
                            error?.message ||
                            initialError ||
                            "Reads the monthly tabs in the Google Sheet."}
                        </p>
                      </div>
                    </div>
                    <dl className="detail-list">
                      <div>
                        <dt>Tracker</dt>
                        <dd>
                          {dataset
                            ? `${dataset.tabs.length} monthly tabs`
                            : "Waiting for connection"}
                        </dd>
                      </div>
                      <div>
                        <dt>Last successful read</dt>
                        <dd>
                          {dataset
                            ? new Date(dataset.fetchedAt).toLocaleTimeString(
                                "en",
                                {
                                  timeZone: dataset.timezone,
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )
                            : "Not yet"}
                        </dd>
                      </div>
                      <div>
                        <dt>Checks for changes</dt>
                        <dd>Every {dataset?.refreshSeconds ?? 60} seconds</dd>
                      </div>
                      <div>
                        <dt>Timezone</dt>
                        <dd>{dataset?.timezone ?? "America/Toronto"}</dd>
                      </div>
                    </dl>
                    {dataset?.warnings.length ? (
                      <p className="notice">
                        {dataset.warnings.length}{" "}
                        {dataset.warnings.length === 1 ? "note" : "notes"} about
                        the tracker. {dataset.warnings[0]}
                      </p>
                    ) : null}
                    <div className="dialog-actions">
                      <button
                        className="primary-button"
                        onClick={() => void mutate()}
                        disabled={isValidating}
                      >
                        <RefreshCw size={16} />
                        {isValidating ? "Checking…" : "Check for changes"}
                      </button>
                      {sourceURL && (
                        <a
                          className="secondary-button"
                          href={sourceURL}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open tracker <ExternalLink size={15} />
                        </a>
                      )}
                    </div>
                  </>
                ) : panel === "balance" ? (
                  <>
                    <p className="panel-intro">
                      Balance compares the four areas over the last 30 days. Set
                      how much each area counts.
                    </p>
                    {m && (
                      <div className="balance-details">
                        {m.global.balance.domains.map((d) => (
                          <div key={d.domain}>
                            <label htmlFor={`weight-${d.domain}`}>
                              <span
                                className={`domain-dot ${DOMAIN_TONES[d.domain]}`}
                              />
                              {d.label}
                              <small>
                                {d.rate === null
                                  ? "Not scheduled"
                                  : `${percent(d.rate)} · ${d.completed} of ${d.scheduled} done`}
                              </small>
                            </label>
                            <div className="weight-input">
                              <input
                                id={`weight-${d.domain}`}
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={draft[d.domain]}
                                onChange={(e) =>
                                  setDraft((old) => ({
                                    ...old,
                                    [d.domain]: Number(e.target.value),
                                  }))
                                }
                              />
                              <span>%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <p
                      className={`weight-feedback ${validWeights(draft) ? "valid" : "invalid"}`}
                      aria-live="polite"
                    >
                      {validWeights(draft)
                        ? "Weights total 100%"
                        : `Weights total ${(Object.values(draft) as number[]).reduce((a, b) => a + b, 0)}%. Make them add up to 100%.`}
                    </p>
                    <div className="dialog-actions">
                      <button
                        className="text-button"
                        onClick={() => setDraft(DEFAULT_WEIGHTS)}
                      >
                        Reset to defaults
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => setPanel(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="primary-button"
                        disabled={!validWeights(draft)}
                        onClick={() => {
                          setWeights(draft);
                          try {
                            localStorage.setItem(
                              "pintelli-balance-weights",
                              JSON.stringify(draft),
                            );
                          } catch {}
                          setPanel(null);
                        }}
                      >
                        Save
                      </button>
                    </div>
                    <p className="fine-print">
                      Shows routine, not wellbeing. Areas with nothing due are
                      left out.
                    </p>
                  </>
                ) : panel === "overview" && m ? (
                  <>
                    <div className="overview-details">
                      <div>
                        <span>Completion to date</span>
                        <b>{percent(m.global.overall.rate)}</b>
                        <small>
                          {count(m.global.overall.completed)} of{" "}
                          {count(m.global.overall.scheduled)} due so far ·{" "}
                          {count(m.global.planned)} planned
                        </small>
                      </div>
                      <div>
                        <span>Routine balance</span>
                        <b>
                          {m.global.balance.score ?? "—"}
                          <small> / 100</small>
                        </b>
                        <small>{m.global.balance.phrase}</small>
                      </div>
                      <div>
                        <span>French streak</span>
                        <b>
                          {m.global.streak.current}
                          <small>
                            {m.global.streak.current === 1 ? " day" : " days"}
                          </small>
                        </b>
                        <small>Longest: {days(m.global.streak.longest)}</small>
                      </div>
                      <div>
                        <span>Last 30 days</span>
                        <b>{percent(m.global.rolling.rate)}</b>
                        <small>
                          {count(m.global.rolling.completed)} of{" "}
                          {count(m.global.rolling.scheduled)} done ·{" "}
                          {m.global.rollingChange === null
                            ? "No comparison yet"
                            : `${m.global.rollingChange >= 0 ? "+" : "−"}${Math.abs(m.global.rollingChange).toFixed(1)} points vs. the 30 days before`}
                        </small>
                      </div>
                    </div>
                    <p className="fine-print">
                      Days with no French planned don’t break a streak. These
                      totals always run through today.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="panel-intro">
                      One screen, four views of the same routine.
                    </p>
                    <div className="help-items">
                      <div>
                        <span>01</span>
                        <p>
                          <b>Switch views</b>Day, Week, and Month move through
                          the calendar. Year shows the whole plan.
                        </p>
                      </div>
                      <div>
                        <span>02</span>
                        <p>
                          <b>See more</b>The control at the bottom of each card
                          shows another view.
                        </p>
                      </div>
                      <div>
                        <span>03</span>
                        <p>
                          <b>Update the tracker as usual</b>The dashboard checks
                          for changes while this tab is open.
                        </p>
                      </div>
                    </div>
                    <p className="fine-print">
                      Keyboard: T for today · R to check for changes · arrow
                      keys in controls and the activity map. Activities that
                      aren’t due yet never lower a score.
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </dialog>
      </div>
    </MotionConfig>
  );
}
