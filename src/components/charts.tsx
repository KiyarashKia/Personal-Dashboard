"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dateObject, formatDate, periodFor } from "@/lib/dates";
import { percent } from "@/lib/metrics";
import type { Rate } from "@/lib/types";

export function Ring({
  value,
  color = "blue",
  children,
}: {
  value: number | null;
  color?: string;
  children: React.ReactNode;
}) {
  const amount = Math.max(0, Math.min(1, value ?? 0)),
    circumference = 2 * Math.PI * 76;
  return (
    <div className={`ring-wrap ${color}`}>
      <svg className="progress-ring" viewBox="0 0 180 180" aria-hidden="true">
        <circle className="ring-track" cx="90" cy="90" r="76" />
        <circle
          className="ring-fill"
          cx="90"
          cy="90"
          r="76"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - amount)}
        />
        {amount === 0 && (
          <circle className="ring-start" cx="90" cy="14" r="4" />
        )}
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
type DomainRate = { domain: string; label: string; rate: number | null };
export const DOMAIN_TONES: Record<string, string> = {
  learning: "blue",
  health: "mint",
  career: "lavender",
  admin: "amber",
};
/** Concentric rings, one per routine domain, outermost first. */
export function DomainRings({ data }: { data: DomainRate[] }) {
  return (
    <div className="domain-rings">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        {data.map((d, i) => {
          const r = 88 - i * 22,
            c = 2 * Math.PI * r,
            amount = Math.max(0, Math.min(1, d.rate ?? 0));
          return (
            <g key={d.domain} className={DOMAIN_TONES[d.domain]}>
              <circle className="ring-track" cx="100" cy="100" r={r} />
              {amount > 0 && (
                <circle
                  className="ring-fill"
                  cx="100"
                  cy="100"
                  r={r}
                  strokeDasharray={c}
                  strokeDashoffset={c * (1 - amount)}
                />
              )}
            </g>
          );
        })}
      </svg>
      <ul>
        {data.map((d) => (
          <li key={d.domain} className={DOMAIN_TONES[d.domain]}>
            <i aria-hidden="true" />
            <span>{d.label}</span>
            <b>{percent(d.rate)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
/** Four mini columns showing each domain's rate. */
export function DomainBars({ data }: { data: DomainRate[] }) {
  return (
    <span className="domain-bars" aria-hidden="true">
      {data.map((d) => (
        <i key={d.domain} className={DOMAIN_TONES[d.domain]}>
          <b style={{ transform: `scaleY(${Math.max(0.06, d.rate ?? 0)})` }} />
        </i>
      ))}
    </span>
  );
}
export function Sparkline({
  data,
  color = "blue",
}: {
  data: (number | null)[];
  color?: string;
}) {
  const points = data
    .map(
      (n, i) =>
        `${(i * 160) / Math.max(1, data.length - 1)},${38 - (n ?? 0) * 32}`,
    )
    .join(" ");
  return (
    <svg
      className={`sparkline ${color}`}
      viewBox="0 0 164 44"
      aria-hidden="true"
    >
      <path d="M0 38H164" className="spark-baseline" />
      <polyline points={points} className="spark-path" />
    </svg>
  );
}
type Datum = Rate & { date: string; future?: boolean };
export function TrendChart({
  data,
  mode = "week",
  color = "blue",
}: {
  data: Datum[];
  mode?: "day" | "week" | "month";
  color?: string;
}) {
  const initial = Math.max(
    0,
    data.findLastIndex((d) => d.scheduled > 0),
  );
  const [selected, setSelected] = useState(initial);
  useEffect(() => setSelected(initial), [initial, data[0]?.date]);
  const item = data[Math.min(selected, data.length - 1)];
  if (!data.length) return <p className="muted">No tracked dates yet.</p>;
  const width = 360,
    height = 112,
    barWidth = Math.min(30, (width - 36) / data.length - 10);
  const label = (date: string) =>
    mode === "month"
      ? formatDate(date, { month: "short" })
      : formatDate(date, { month: "short", day: "numeric" });
  return (
    <div className={`trend-chart ${color}`}>
      <svg
        viewBox={`0 0 ${width} ${height + 22}`}
        role="img"
        aria-label={`Completion by ${mode}. ${data.map((d) => `${label(d.date)}: ${percent(d.rate)}`).join("; ")}`}
      >
        {[0, 0.5, 1].map((n) => (
          <g key={n}>
            <path
              className="chart-grid"
              d={`M26 ${height - n * (height - 10)}H${width}`}
            />
            <text
              x="0"
              y={height - n * (height - 10) + 4}
              className="chart-tick"
            >
              {n * 100}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = 28 + ((i + 0.5) * (width - 28)) / data.length,
            barHeight = (d.rate ?? 0) * (height - 10);
          return (
            <g key={d.date}>
              <rect
                className={
                  i === selected ? "chart-rail selected" : "chart-rail"
                }
                x={x - barWidth / 2}
                y="10"
                width={Math.max(3, barWidth)}
                height={height - 10}
                rx="4"
              />
              <rect
                className={`chart-bar ${d.future ? "future" : ""}`}
                x={x - barWidth / 2}
                y={height - Math.max(d.scheduled ? 3 : 0, barHeight)}
                width={Math.max(3, barWidth)}
                height={Math.max(d.scheduled ? 3 : 0, barHeight)}
                rx="3"
              />
              {(data.length <= 7 || i % 2 === 0) && (
                <text
                  x={x}
                  y={height + 18}
                  textAnchor="middle"
                  className="chart-tick"
                >
                  {mode === "month"
                    ? label(d.date)
                    : formatDate(d.date, { day: "numeric" })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-inspector">
        <button
          aria-label="Previous chart point"
          onClick={() => setSelected((s) => Math.max(0, s - 1))}
          disabled={selected <= 0}
        >
          <ChevronLeft size={16} />
        </button>
        <span aria-live="polite">
          {item && (
            <>
              <b>{label(item.date)}</b>
              <span>
                {item.future
                  ? "Upcoming"
                  : item.scheduled
                    ? `${percent(item.rate)} · ${item.completed}/${item.scheduled}`
                    : "No schedule"}
              </span>
            </>
          )}
        </span>
        <button
          aria-label="Next chart point"
          onClick={() => setSelected((s) => Math.min(data.length - 1, s + 1))}
          disabled={selected >= data.length - 1}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
const CELL = 14,
  STEP = 18,
  LEFT = 24,
  TOP = 18;
export function Heatmap({ data }: { data: Datum[] }) {
  const lastPast = () =>
    data[
      Math.max(
        0,
        data.findLastIndex((d) => !d.future),
      )
    ]?.date ?? "";
  const [selected, setSelected] = useState(lastPast);
  useEffect(() => setSelected(lastPast()), [data[0]?.date, data.length]);
  // A year splits into two half-year windows; shorter periods show at once.
  const pageSize = data.length > 200 ? Math.ceil(data.length / 2) : data.length;
  const selectedIndex = Math.max(
    0,
    data.findIndex((d) => d.date === selected),
  );
  const page = Math.floor(selectedIndex / Math.max(1, pageSize));
  const visible = data.slice(page * pageSize, (page + 1) * pageSize);
  const day = data[selectedIndex];
  if (!visible.length) return <p className="muted">No tracked dates yet.</p>;
  const start = dateObject(periodFor("week", visible[0].date).start).getTime();
  const column = (date: string) =>
    Math.floor(Math.round((dateObject(date).getTime() - start) / 86400000) / 7);
  const weeks = column(visible.at(-1)!.date) + 1;
  // Up to six weeks reads best as a calendar: weekdays across, weeks down.
  const calendar = weeks <= 6;
  const left = calendar ? 0 : LEFT;
  const at = (d: Datum) => {
    const week = column(d.date),
      weekday = dateObject(d.date).getUTCDay();
    return calendar
      ? { x: weekday * STEP, y: TOP + week * STEP }
      : { x: LEFT + week * STEP, y: TOP + weekday * STEP };
  };
  const rows = Array.from({ length: calendar ? weeks : 7 }, (_, row) =>
    visible.filter((d) =>
      calendar
        ? column(d.date) === row
        : dateObject(d.date).getUTCDay() === row,
    ),
  );
  const months: { x: number; label: string }[] = [];
  for (const d of calendar ? [] : visible) {
    if (d !== visible[0] && !d.date.endsWith("-01")) continue;
    const x = LEFT + column(d.date) * STEP;
    if (months.length && x - months.at(-1)!.x < STEP * 3) months.pop();
    months.push({ x, label: formatDate(d.date, { month: "short" }) });
  }
  function move(count: number) {
    const next = Math.max(0, Math.min(data.length - 1, selectedIndex + count));
    setSelected(data[next].date);
  }
  function level(d: Datum) {
    if (d.future) return "future";
    if (!d.scheduled) return "unscheduled";
    if (!d.completed) return "level-0";
    if (d.rate === 1) return "level-5";
    return `level-${Math.ceil((d.rate ?? 0) * 4)}`;
  }
  const describe = (d: Datum) =>
    d.future
      ? "Upcoming"
      : d.scheduled
        ? `${d.completed} of ${d.scheduled} · ${percent(d.rate)}`
        : "No scheduled activities";
  return (
    <div className="heatmap-content">
      <svg
        className="heatmap"
        viewBox={`0 0 ${left + (calendar ? 7 : weeks) * STEP - (STEP - CELL)} ${TOP + (calendar ? weeks : 7) * STEP - (STEP - CELL)}`}
        role="grid"
        aria-label="Daily activity. Arrow keys move one day or one week. Home and End jump to the first or last day."
        aria-activedescendant={day ? `heat-${day.date}` : undefined}
        tabIndex={0}
        onKeyDown={(e) => {
          const across = calendar ? 1 : 7;
          const delta: Record<string, number> = {
            ArrowLeft: -across,
            ArrowRight: across,
            ArrowUp: -8 + across,
            ArrowDown: 8 - across,
            Home: -data.length,
            End: data.length,
          };
          if (e.key in delta) {
            e.preventDefault();
            move(delta[e.key]);
          }
        }}
      >
        {months.map((m) => (
          <text key={m.x} x={m.x} y="10" className="heat-label">
            {m.label}
          </text>
        ))}
        {calendar &&
          ["S", "M", "T", "W", "T", "F", "S"].map((label, weekday) => (
            <text
              key={weekday}
              x={weekday * STEP + CELL / 2}
              y="10"
              textAnchor="middle"
              className="heat-label"
              aria-hidden="true"
            >
              {label}
            </text>
          ))}
        {rows.map((cells, row) => (
          <g key={row} role="row">
            {!calendar && row % 2 === 1 && (
              <text
                x="0"
                y={TOP + row * STEP + 11}
                className="heat-label"
                aria-hidden="true"
              >
                {["M", "W", "F"][(row - 1) / 2]}
              </text>
            )}
            {cells.map((d) => (
              <rect
                key={d.date}
                id={`heat-${d.date}`}
                role="gridcell"
                aria-label={`${formatDate(d.date)}: ${describe(d)}`}
                aria-selected={day?.date === d.date}
                className={`heat-cell ${level(d)} ${day?.date === d.date ? "selected" : ""}`}
                {...at(d)}
                width={CELL}
                height={CELL}
                rx="3.5"
                onPointerEnter={(e) =>
                  e.pointerType === "mouse" && setSelected(d.date)
                }
                onClick={() => setSelected(d.date)}
              />
            ))}
          </g>
        ))}
      </svg>
      <div className="heatmap-footer">
        <div className="heatmap-inspector">
          <button
            onClick={() => move(-1)}
            disabled={selectedIndex === 0}
            aria-label="Previous day"
          >
            <ChevronLeft size={16} />
          </button>
          <div aria-live="polite">
            <b>
              {day
                ? formatDate(day.date, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "No date"}
            </b>
            <span>{day ? describe(day) : ""}</span>
          </div>
          <button
            onClick={() => move(1)}
            disabled={selectedIndex === data.length - 1}
            aria-label="Next day"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="heatmap-legend" aria-hidden="true">
          <span>Less</span>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <i key={i} className={`level-${i}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
