"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { computeMetrics, percent, validWeights } from "@/lib/metrics";
import {
  DEFAULT_WEIGHTS,
  DOMAIN_NAMES,
  type DataResponse,
  type Mode,
  type Weights,
} from "@/lib/types";
import { Ring, Sparkline, TrendChart, Heatmap } from "./charts";
import { Card } from "./card";

const MODES: Mode[] = ["day", "week", "month", "year"];
const CARD_IDS = ["hero", "french", "health", "activity", "focus"] as const;
const PAGE_NAMES = ["Progress", "French", "Health", "Activity", "Focus"];
const TITLES: Record<Mode, string> = {
  day: "A little progress, every day.",
  week: "Find your rhythm.",
  month: "Small steps. Lasting momentum.",
  year: "Look how far you’ve come.",
};
const PERIOD_NAMES: Record<Mode, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
};
const DOMAIN_COLORS: Record<string, string> = {
  learning: "blue",
  health: "mint",
  career: "lavender",
  admin: "amber",
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
  context = "vs. previous period",
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
          {Math.abs(value).toFixed(1)} pp <span>{context}</span>
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
            {r.completed} of {r.scheduled} scheduled activities
          </span>
        </div>
      ))}
    </div>
  );
}
function EmptyRate({ scheduled }: { scheduled: number }) {
  return (
    <p className="metric-context">
      {scheduled
        ? `${scheduled} scheduled activities`
        : "No scheduled activities in this period"}
    </p>
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
        localStorage.getItem("cadence-balance-weights") ?? "null",
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
  function navigate(direction: number) {
    const next = movePeriod(mode, anchor, direction);
    setAnchor(next);
    updateURL(mode, next);
  }
  function state(id: string, index: number) {
    setStates((old) => ({ ...old, [id]: index }));
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
          <div>
            <div className="section-kicker">THE BIGGER PICTURE</div>
            <h1>{TITLES[mode]}</h1>
          </div>
          <div className="period-picker">
            <button
              className="icon-button"
              aria-label="Previous period"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <span>{periodLabel(mode, anchor)}</span>
              <small>
                {m?.future
                  ? "Upcoming period"
                  : m?.partial
                    ? `Through ${formatDate(dataset!.today)}`
                    : mode === "week"
                      ? "Sunday – Saturday"
                      : mode === "day" && anchor === dataset?.today
                        ? "Today · in progress"
                        : "Complete period"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Next period"
              onClick={() => navigate(1)}
            >
              <ChevronRight size={18} />
            </button>
            <button
              className="today-button"
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
            aria-label="Overall performance through today"
          >
            <button
              className="overview-card"
              onClick={() => setPanel("overview")}
            >
              <div className="overview-label">
                <Target size={16} />
                <span>Overall progress</span>
              </div>
              <div className="overview-content">
                <NumberValue value={percent(m.global.overall.rate)} />
                <div className="mini-progress">
                  <i
                    style={{
                      transform: `scaleX(${m.global.overall.rate ?? 0})`,
                    }}
                  />
                </div>
              </div>
              <span className="overview-note">
                {m.global.overall.completed} of {m.global.overall.scheduled} to
                date
              </span>
            </button>
            <button className="overview-card" onClick={openBalance}>
              <div className="overview-label">
                <Leaf size={16} />
                <span>Routine balance</span>
              </div>
              <div className="overview-content">
                <NumberValue
                  value={m.global.balance.score ?? "—"}
                  unit="/ 100"
                />
                <span className="balance-orbit" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <span className="overview-note">{m.global.balance.phrase}</span>
            </button>
            <button
              className="overview-card"
              onClick={() => setPanel("overview")}
            >
              <div className="overview-label">
                <Flame size={16} />
                <span>French streak</span>
              </div>
              <div className="overview-content">
                <NumberValue
                  value={m.global.streak.current}
                  unit={m.global.streak.current === 1 ? "day" : "days"}
                />
                <div className="streak-marks" aria-hidden="true">
                  {Array.from({ length: 7 }, (_, i) => (
                    <i
                      className={i < m.global.streak.current ? "on" : ""}
                      key={i}
                    />
                  ))}
                </div>
              </div>
              <span className="overview-note">One practice makes a day</span>
            </button>
            <button
              className="overview-card"
              onClick={() => setPanel("overview")}
            >
              <div className="overview-label">
                <TrendingUp size={16} />
                <span>30-day momentum</span>
              </div>
              <div className="overview-content">
                <NumberValue value={percent(m.global.rolling.rate)} />
                <Sparkline data={m.global.spark.map((d) => d.rate)} />
              </div>
              <span className="overview-note">
                Rolling completion · through today
              </span>
            </button>
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
                {isValidating
                  ? "Opening your perspective…"
                  : "Your tracker, one connection away."}
              </h2>
              <p>
                {error?.message ||
                  initialError ||
                  "Reading the monthly tabs from Google Sheets."}
              </p>
              <div>
                <button
                  className="primary-button"
                  onClick={() => void mutate()}
                  disabled={isValidating}
                >
                  <RefreshCw size={16} /> Retry connection
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
                  title={`${PERIOD_NAMES[mode]} ${mode === "month" ? "progress" : "completion"}`}
                  icon={<Target size={17} />}
                  eyebrow={
                    m.future ? "UPCOMING" : m.partial ? "TO DATE" : "OVERVIEW"
                  }
                  states={["Completion", "Trend", "Distribution"]}
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
                        <NumberValue value={percent(m.performance.rate)} />
                        <span className="hero-period">
                          {fullDay ? (
                            <>
                              <CheckCheck size={17} /> Everything, done.
                            </>
                          ) : m.future ? (
                            "A little planning goes a long way."
                          ) : m.performance.completed ? (
                            "Every step is adding up."
                          ) : (
                            "A fresh start. Make it yours."
                          )}
                        </span>
                      </div>
                      <div className="hero-bottom">
                        <div className="hero-count">
                          <span>{m.performance.completed}</span>
                          <div>
                            activities completed
                            <small>
                              of {m.performance.scheduled} scheduled{" "}
                              {m.partial ? "so far" : ""}
                            </small>
                          </div>
                        </div>
                        <div className="hero-progress">
                          <i
                            style={{
                              transform: `scaleX(${m.performance.rate ?? 0})`,
                            }}
                          />
                        </div>
                        <Change
                          value={m.change}
                          context={
                            mode === "month"
                              ? "vs. prior month"
                              : mode === "week"
                                ? "vs. prior week"
                                : "vs. prior period"
                          }
                        />
                      </div>
                      <div className="hero-arc" aria-hidden="true">
                        <svg viewBox="0 0 240 240">
                          <circle cx="120" cy="120" r="104" />
                          <circle cx="120" cy="120" r="84" />
                          <circle cx="120" cy="120" r="64" />
                        </svg>
                      </div>
                    </div>
                  ) : states.hero === 1 ? (
                    <div className="hero-trend">
                      <div className="detail-lead">
                        <NumberValue value={percent(m.performance.rate)} />
                        <p>
                          {mode === "year"
                            ? "Month by month."
                            : mode === "month"
                              ? "One calendar week at a time."
                              : "Your daily rhythm."}
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
                      <Change value={m.change} />
                    </div>
                  ) : (
                    <div className="distribution-view">
                      <div className="detail-lead">
                        <NumberValue
                          value={m.performance.completed}
                          unit="completed"
                        />
                        <p>A place for every part of your routine.</p>
                      </div>
                      <RateBars
                        rows={m.distribution.map((d) => ({
                          ...d,
                          label: d.label,
                          color: DOMAIN_COLORS[d.domain],
                        }))}
                      />
                      <div className="distribution-counts">
                        {m.distribution.map((d) => (
                          <span key={d.domain}>
                            <i className={DOMAIN_COLORS[d.domain]} />
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
                  eyebrow="LEARNING"
                  states={["Completion", "Practice days", "Skills"]}
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
                        {m.french.completed} of {m.french.scheduled} activities
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
                          ? `${m.activeFrenchWeeks} French-active weeks`
                          : "Sunday – Saturday · selected week"}
                      </p>
                    </div>
                  ) : (
                    <div className="skills-view">
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
                  eyebrow="MAKE SPACE"
                  states={["Completion", "Walking", "Trend"]}
                  index={states.health}
                  onChange={(i) => state("health", i)}
                  tone="mint"
                  motionKey={stateKey}
                >
                  {states.health === 0 ? (
                    <div className="health-view">
                      <NumberValue value={percent(m.health.rate)} />
                      <p className="metric-context">
                        A little care goes a long way.
                      </p>
                      <div className="health-lines" aria-hidden="true">
                        {Array.from({ length: 22 }, (_, i) => (
                          <i
                            key={i}
                            className={
                              i < Math.round((m.health.rate ?? 0) * 22)
                                ? "done"
                                : ""
                            }
                            style={{
                              height: `${22 + Math.sin(i / 3) * 14 + (i % 3) * 4}px`,
                            }}
                          />
                        ))}
                      </div>
                      <span className="metric-context">
                        {m.health.completed} of {m.health.scheduled} activities
                      </span>
                    </div>
                  ) : states.health === 1 ? (
                    <div className="walking-view">
                      <NumberValue value={percent(m.walking.rate)} />
                      <p className="metric-context">walking consistency</p>
                      <div className="walking-count">
                        <span>
                          {m.walking.completed}
                          <small> / {m.walking.scheduled}</small>
                        </span>
                        <p>scheduled walking days</p>
                      </div>
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
                  eyebrow={mode === "year" ? "THE LONG VIEW" : "DAY BY DAY"}
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
                        <p>Every scheduled activity, completed.</p>
                      </div>
                      <div className="milestone-bottom">
                        <CheckCheck size={24} />
                        <span>
                          {mode === "day"
                            ? m.fullDays
                              ? "A complete day. Nicely done."
                              : "There’s still room for a small win."
                            : "A consistent routine starts with one day."}
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
                          ? "Give your habits a little time."
                          : m.rankings.tied
                            ? "Your habits are at the same pace."
                            : m.rankings.best.habit}
                      </h3>
                      <p>
                        {!m.rankings.best
                          ? "Three scheduled opportunities unlock a fairer habit comparison."
                          : m.rankings.tied
                            ? `${percent(m.rankings.best.rate)} across eligible habits.`
                            : `${percent(m.rankings.best.rate)} · your most consistent habit`}
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
                        MOST CONSISTENT MONTH
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
                          ? `${m.mostConsistent.completed} of ${m.mostConsistent.scheduled} through today`
                          : "Your first tracked month starts the story."}
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
                  <span>{name}</span>
                  <i />
                </button>
              ))}
            </nav>
          )}
          <button className="footer-help" onClick={() => setPanel("help")}>
            <CircleHelp size={14} />
            <span>Made for the bigger picture</span>
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
                <div>
                  <span className="section-kicker">CADENCE</span>
                  <h2 id="panel-title">
                    {panel === "connection"
                      ? "Your connection"
                      : panel === "balance"
                        ? "A balanced routine"
                        : panel === "overview"
                          ? "The bigger picture"
                          : "A little orientation"}
                  </h2>
                </div>
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
                            "Your monthly tabs are the source of truth."}
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
                        <dt>Active refresh</dt>
                        <dd>Every {dataset?.refreshSeconds ?? 60} seconds</dd>
                      </div>
                      <div>
                        <dt>Timezone</dt>
                        <dd>{dataset?.timezone ?? "America/Toronto"}</dd>
                      </div>
                    </dl>
                    {dataset?.warnings.length ? (
                      <p className="notice">
                        {dataset.warnings.length} source notes.{" "}
                        {dataset.warnings[0]}
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
                      Make room for all four parts of your routine. This
                      reflects tracked habits over the last 30 days.
                    </p>
                    {m && (
                      <div className="balance-details">
                        {m.global.balance.domains.map((d) => (
                          <div key={d.domain}>
                            <label htmlFor={`weight-${d.domain}`}>
                              <span
                                className={`domain-dot ${DOMAIN_COLORS[d.domain]}`}
                              />
                              {d.label}
                              <small>
                                {d.rate === null
                                  ? "Not tracked"
                                  : `${percent(d.rate)} · ${d.completed}/${d.scheduled}`}
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
                        : `Weights total ${(Object.values(draft) as number[]).reduce((a, b) => a + b, 0)}% · adjust to 100%`}
                    </p>
                    <div className="dialog-actions">
                      <button
                        className="primary-button"
                        disabled={!validWeights(draft)}
                        onClick={() => {
                          setWeights(draft);
                          try {
                            localStorage.setItem(
                              "cadence-balance-weights",
                              JSON.stringify(draft),
                            );
                          } catch {}
                          setPanel(null);
                        }}
                      >
                        Save balance weights
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => setDraft(DEFAULT_WEIGHTS)}
                      >
                        Reset
                      </button>
                    </div>
                    <p className="fine-print">
                      A routine indicator, not a measure of wellbeing. Missing
                      domains stay unavailable.
                    </p>
                  </>
                ) : panel === "overview" && m ? (
                  <>
                    <div className="overview-details">
                      <div>
                        <span>Overall completion</span>
                        <b>{percent(m.global.overall.rate)}</b>
                        <small>
                          {m.global.overall.completed} of{" "}
                          {m.global.overall.scheduled} scheduled through today
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
                        <span>Current French streak</span>
                        <b>
                          {m.global.streak.current}
                          <small> days</small>
                        </b>
                        <small>
                          Longest: {m.global.streak.longest} scheduled practice
                          days
                        </small>
                      </div>
                      <div>
                        <span>30-day momentum</span>
                        <b>{percent(m.global.rolling.rate)}</b>
                        <small>
                          {m.global.rolling.completed}/
                          {m.global.rolling.scheduled} ·{" "}
                          {m.global.rollingChange === null
                            ? "No earlier comparison"
                            : `${m.global.rollingChange >= 0 ? "+" : ""}${m.global.rollingChange.toFixed(1)} pp vs prior 30 days`}
                        </small>
                      </div>
                    </div>
                    <p className="fine-print">
                      Streaks skip unscheduled days. Today stays open until
                      midnight. Global metrics always run through today.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="panel-intro">
                      One screen. Four perspectives on the same routine.
                    </p>
                    <div className="help-items">
                      <div>
                        <span>01</span>
                        <p>
                          <b>Change your perspective</b>Day, Week, Month, and
                          Year fit the same canvas.
                        </p>
                      </div>
                      <div>
                        <span>02</span>
                        <p>
                          <b>Go a little deeper</b>The labeled control at the
                          bottom of each card reveals another view.
                        </p>
                      </div>
                      <div>
                        <span>03</span>
                        <p>
                          <b>Keep your existing rhythm</b>Update your tracker as
                          usual. Cadence checks while this tab is active.
                        </p>
                      </div>
                    </div>
                    <p className="fine-print">
                      Keyboard: T for today · R to refresh · arrow keys in
                      controls and the activity map. Future tasks never reduce
                      your current score.
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
