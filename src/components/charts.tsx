"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, dateObject, formatDate, periodFor } from "@/lib/dates";
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
export function Heatmap({ data }: { data: Datum[] }) {
  const lastPast = Math.max(
    0,
    data.findLastIndex((d) => !d.future),
  );
  const [windowIndex, setWindowIndex] = useState(Math.floor(lastPast / 84)),
    [selected, setSelected] = useState(data[lastPast]?.date ?? "");
  const pageSize = 84,
    windowCount = Math.max(1, Math.ceil(data.length / pageSize));
  useEffect(() => {
    const last = Math.max(
      0,
      data.findLastIndex((d) => !d.future),
    );
    setWindowIndex(Math.floor(last / pageSize));
    setSelected(data[last]?.date ?? "");
  }, [data[0]?.date, data.length]);
  const visible = data.slice(
    windowIndex * pageSize,
    (windowIndex + 1) * pageSize,
  );
  const first = visible[0],
    start = first ? periodFor("week", first.date).start : "";
  const selectedIndex = Math.max(
    0,
    data.findIndex((d) => d.date === selected),
  );
  const day = data[selectedIndex] ?? first;
  const weeks = first
    ? Math.ceil(
        (dateObject(visible.at(-1)!.date).getTime() -
          dateObject(start).getTime()) /
          86400000 /
          7 +
          1 / 7,
      )
    : 1;
  function move(count: number) {
    const next = Math.max(0, Math.min(data.length - 1, selectedIndex + count));
    setSelected(data[next].date);
    setWindowIndex(Math.floor(next / pageSize));
  }
  function intensity(d: Datum) {
    if (d.future) return "future";
    if (!d.scheduled) return "unscheduled";
    if (!d.completed) return "level-0";
    if (d.rate === 1) return "level-5";
    return `level-${Math.ceil((d.rate ?? 0) * 4)}`;
  }
  return (
    <div className="heatmap-content">
      <div className="heatmap-range">
        <span>
          {first
            ? `${formatDate(first.date)} – ${formatDate(visible.at(-1)!.date)}`
            : "No dates"}
        </span>
        {windowCount > 1 && (
          <div>
            <button
              aria-label="Previous heatmap window"
              disabled={windowIndex === 0}
              onClick={() => {
                const n = windowIndex - 1;
                setWindowIndex(n);
                setSelected(data[n * pageSize].date);
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label="Next heatmap window"
              disabled={windowIndex === windowCount - 1}
              onClick={() => {
                const n = windowIndex + 1;
                setWindowIndex(n);
                setSelected(data[n * pageSize].date);
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      <svg
        className="heatmap"
        viewBox={`0 0 ${36 + weeks * 20} 132`}
        role="grid"
        aria-label="Daily activity. Arrow keys move one day or one week. Home and End jump to the first or last day."
        tabIndex={0}
        onKeyDown={(e) => {
          const delta: Record<string, number> = {
            ArrowLeft: -7,
            ArrowRight: 7,
            ArrowUp: -1,
            ArrowDown: 1,
            Home: -data.length,
            End: data.length,
          };
          if (e.key in delta) {
            e.preventDefault();
            move(delta[e.key]);
          }
        }}
      >
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <text key={i} x="4" y={i * 18 + 12} className="heat-label">
            {d}
          </text>
        ))}
        {visible.map((d) => {
          const offset = Math.round(
              (dateObject(d.date).getTime() - dateObject(start).getTime()) /
                86400000,
            ),
            x = 30 + Math.floor(offset / 7) * 20,
            y = dateObject(d.date).getUTCDay() * 18;
          return (
            <g key={d.date} role="row">
              <rect
                role="gridcell"
                aria-label={`${formatDate(d.date)}: ${d.future ? "Future" : d.scheduled ? `${percent(d.rate)}, ${d.completed} of ${d.scheduled}` : "No scheduled tasks"}`}
                aria-selected={day?.date === d.date}
                className={`heat-cell ${intensity(d)} ${day?.date === d.date ? "selected" : ""}`}
                x={x}
                y={y}
                width="14"
                height="14"
                rx="3"
                onMouseEnter={() => setSelected(d.date)}
                onClick={() => setSelected(d.date)}
              >
                <title>{`${formatDate(d.date)} · ${d.future ? "Upcoming" : d.scheduled ? `${d.completed}/${d.scheduled} complete` : "No schedule"}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="heatmap-inspector">
        <button
          onClick={() => move(-1)}
          disabled={selectedIndex === 0}
          aria-label="Previous activity day"
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
          <span>
            {day?.future
              ? "Upcoming"
              : day?.scheduled
                ? `${day.completed} of ${day.scheduled} · ${percent(day.rate)}`
                : "No scheduled activities"}
          </span>
        </div>
        <button
          onClick={() => move(1)}
          disabled={selectedIndex === data.length - 1}
          aria-label="Next activity day"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="heatmap-legend">
        <span>0%</span>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={`level-${i}`} />
        ))}
        <span>100%</span>
        <span className="legend-upcoming">
          <i className="future" /> Upcoming
        </span>
      </div>
    </div>
  );
}
