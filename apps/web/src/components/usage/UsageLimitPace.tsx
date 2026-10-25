import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { useId } from "react";
import type { LimitProjection } from "@t3tools/shared/usageLimits";

import { usePrimarySettings } from "../../hooks/useSettings";
import { cn } from "~/lib/utils";
import { formatUpcomingTimestamp, resolveHour12 } from "../../timestampFormat";

const HOUR = 3_600_000;
const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 56;
const TOP_Y = 6;
const BOTTOM_Y = 54;

export type LimitCurve = readonly { readonly atMs: number; readonly percent: number }[];

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const TIME_FORMATS = {
  hour12: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
  hour24: new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }),
};

/** "Oct 26" over "4:00" with a smaller AM/PM, so axis times stay short and scannable. */
function TimeLabel({ ms, hour12 }: { readonly ms: number; readonly hour12: boolean }) {
  const date = new Date(ms);
  const parts = TIME_FORMATS[hour12 ? "hour12" : "hour24"].formatToParts(date);
  const time = parts
    .filter((part) => part.type !== "dayPeriod")
    .map((part) => part.value)
    .join("")
    .trim();
  const period = parts.find((part) => part.type === "dayPeriod")?.value;
  return (
    <>
      <span>{DAY_FORMAT.format(date)}</span>
      <span className="tabular-nums">
        {time}
        {period ? <span className="ms-0.5 text-[0.86em]">{period}</span> : null}
      </span>
    </>
  );
}

function formatRate(percentPerHour: number, windowMins: number | undefined): string {
  // Long windows read better per day; an hourly figure there is a tiny decimal.
  return (windowMins ?? 0) * 60_000 > 8 * 24 * HOUR
    ? `${(percentPerHour * 24).toFixed(1)}% a day`
    : `${percentPerHour.toFixed(1)}% an hour`;
}

function LegendLine({ dash, className }: { readonly dash?: string; readonly className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("h-2 w-5 shrink-0", className)} viewBox="0 0 20 8">
      <line
        x1={1}
        x2={19}
        y1={4}
        y2={4}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        {...(dash === undefined ? {} : { strokeDasharray: dash })}
      />
    </svg>
  );
}

/** Explains the burndown charts once for the whole limits view. */
export function LimitChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <LegendLine className="text-foreground" />
        Left so far
      </span>
      <span className="flex items-center gap-1.5">
        <LegendLine dash="1 3" className="text-foreground" />
        Your pace
      </span>
      <span className="flex items-center gap-1.5">
        <LegendLine dash="3 3" className="text-foreground/45" />
        Even pace
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2.5 rounded-xs bg-foreground/15" />
        <span aria-hidden="true" className="-ms-1 size-2.5 rounded-xs bg-warning/30" />
        Ahead of or behind even pace
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current text-warning" />
        Where it runs out
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 border-l border-dashed border-foreground/50" />
        Reset
      </span>
    </div>
  );
}

/**
 * One limit window as a small burndown from 100% left to the reset at the right edge. The pace so
 * far carries on to the reset, below zero when it would run out first.
 */
export function LimitPaceRow({
  label,
  window,
  projection,
  curve,
  color,
  now,
}: {
  readonly label: string;
  readonly window: ServerProviderUsageWindow;
  readonly projection: LimitProjection;
  readonly curve: LimitCurve | null;
  readonly color: string;
  readonly now: number;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const hour12 = resolveHour12(timestampFormat);
  const used = Math.max(0, Math.min(100, window.usedPercent));
  const left = 100 - used;
  const { runsOutAt, projectedPercent } = projection;
  const reached = used >= 100;
  const runsOutEarly = !reached && runsOutAt !== null;
  const endMs = Date.parse(window.resetsAt ?? "");
  const windowMs = (window.windowDurationMins ?? 0) * 60_000;
  const startMs = endMs - windowMs;
  const leftAtReset = 100 - projectedPercent;
  // Room below zero only when the pace overshoots, so the overdraft at the reset stays visible.
  const floor = Math.max(-100, Math.min(0, leftAtReset));
  const at = (ms: number) =>
    formatUpcomingTimestamp(new Date(ms).toISOString(), timestampFormat, now);
  const x = (ms: number) => ((ms - startMs) / windowMs) * VIEW_WIDTH;
  const y = (leftPercent: number) =>
    BOTTOM_Y - ((leftPercent - floor) / (100 - floor)) * (BOTTOM_Y - TOP_Y);
  const xPercent = (ms: number) => `${(x(ms) / VIEW_WIDTH) * 100}%`;
  const yPercent = (leftPercent: number) => `${(y(leftPercent) / VIEW_HEIGHT) * 100}%`;

  const points = curve ?? [
    { atMs: startMs, percent: 0 },
    { atMs: now, percent: used },
  ];
  const history = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.atMs)},${y(100 - point.percent)}`)
    .join(" ");
  const paceEndLeft = Math.max(floor, leftAtReset);
  const evenLeft = (ms: number) => 100 * (1 - (ms - startMs) / windowMs);
  // The gap between use so far and even pace, closed back along the diagonal.
  const gap = `${history} L${x(now)},${y(evenLeft(now))} L${x(startMs)},${y(100)} Z`;
  const clipId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ahead = `${clipId}-ahead`;
  const behind = `${clipId}-behind`;
  // Positive when more is used than even use would have by now.
  const paceGap = Math.round(evenLeft(now) - left);

  const status = reached
    ? "Limit reached"
    : runsOutEarly
      ? `Runs out ${at(runsOutAt)}`
      : `About ${Math.max(0, Math.round(leftAtReset))}% left at reset`;
  const endLabel = reached
    ? null
    : leftAtReset < 0
      ? `${Math.round(-leftAtReset)}% over at reset`
      : `${Math.round(leftAtReset)}% left at reset`;
  // Past two thirds of the way, the run-out label reads leftward so it stays inside the chart.
  const runsOutLabelLeftward = runsOutAt !== null && x(runsOutAt) > (VIEW_WIDTH * 2) / 3;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 md:grid-cols-[8rem_minmax(0,1fr)_6.5rem]">
      <span className="truncate text-sm text-foreground">{label}</span>
      <div className="order-3 col-span-2 flex flex-col gap-1 md:order-none md:col-span-1">
        <div className="flex gap-2">
          <div
            role="img"
            aria-label={`${label}: ${Math.round(left)}% left. ${status}.`}
            className="relative h-20 min-w-0 flex-1"
          >
            {runsOutEarly && runsOutAt !== null ? (
              <div
                aria-hidden="true"
                className="absolute right-0 bottom-0 bg-warning/8"
                style={{ left: xPercent(runsOutAt), top: yPercent(0) }}
              />
            ) : null}
            <svg
              aria-hidden="true"
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              preserveAspectRatio="none"
            >
              <defs>
                <clipPath id={ahead}>
                  <polygon points={`0,-1 ${VIEW_WIDTH},-1 ${VIEW_WIDTH},${y(0)} 0,${y(100)}`} />
                </clipPath>
                <clipPath id={behind}>
                  <polygon
                    points={`0,${y(100)} ${VIEW_WIDTH},${y(0)} ${VIEW_WIDTH},${VIEW_HEIGHT + 1} 0,${VIEW_HEIGHT + 1}`}
                  />
                </clipPath>
              </defs>
              <path
                d={gap}
                clipPath={`url(#${ahead})`}
                style={{ fill: `color-mix(in srgb, ${color} 16%, transparent)` }}
              />
              <path d={gap} clipPath={`url(#${behind})`} className="fill-warning/22" />
              <line
                x1={0}
                x2={VIEW_WIDTH}
                y1={y(100)}
                y2={y(0)}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="3 3"
                className="text-foreground/40"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={0}
                x2={VIEW_WIDTH}
                y1={y(0)}
                y2={y(0)}
                stroke="currentColor"
                strokeWidth={1}
                className="text-foreground/25"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={VIEW_WIDTH}
                x2={VIEW_WIDTH}
                y1={0}
                y2={VIEW_HEIGHT}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="2 3"
                className="text-foreground/50"
                vectorEffect="non-scaling-stroke"
              />
              {reached ? null : (
                <line
                  x1={x(now)}
                  y1={y(left)}
                  x2={VIEW_WIDTH}
                  y2={y(paceEndLeft)}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeDasharray="1 4"
                  strokeLinecap="round"
                  className={runsOutEarly ? "text-warning" : undefined}
                  style={runsOutEarly ? undefined : { color }}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <path
                d={history}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current chart-glow"
              style={{ left: xPercent(now), top: yPercent(left), color }}
            />
            {runsOutEarly && runsOutAt !== null ? (
              <>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current text-warning chart-glow"
                  style={{ left: xPercent(runsOutAt), top: yPercent(0) }}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute flex -translate-y-full flex-col pb-1 text-xs leading-tight whitespace-nowrap text-warning-foreground",
                    runsOutLabelLeftward ? "-translate-x-full items-end pe-2" : "ps-2",
                  )}
                  style={{ left: xPercent(runsOutAt), top: yPercent(0) }}
                >
                  <TimeLabel ms={runsOutAt} hour12={hour12} />
                  <span className="text-2xs opacity-80">Runs out</span>
                </span>
              </>
            ) : null}
          </div>
          <div aria-hidden="true" className="relative h-20 w-32 shrink-0">
            {endLabel === null ? null : (
              <span
                className={cn(
                  "absolute left-0 -translate-y-1/2 text-xs whitespace-nowrap tabular-nums",
                  leftAtReset < 0 ? "text-warning-foreground" : "text-muted-foreground",
                )}
                style={{ top: yPercent(paceEndLeft) }}
              >
                {endLabel}
              </span>
            )}
          </div>
        </div>
        <div
          aria-hidden="true"
          className="me-34 flex justify-between gap-3 text-xs leading-tight whitespace-nowrap text-foreground/80"
        >
          <span className="flex flex-col">
            <TimeLabel ms={startMs} hour12={hour12} />
            <span className="text-2xs text-muted-foreground">Started</span>
          </span>
          <span className="flex flex-col items-end">
            <TimeLabel ms={endMs} hour12={hour12} />
            <span className="text-2xs text-muted-foreground">Resets</span>
          </span>
        </div>
      </div>
      <span className="order-2 flex flex-col items-end text-sm text-muted-foreground tabular-nums md:order-none">
        <span>
          <span className="font-semibold text-foreground">{Math.round(left)}%</span> left
        </span>
        {reached ? null : (
          <span className={cn("text-xs", paceGap > 0 && "text-warning-foreground")}>
            {paceGap === 0
              ? "On even pace"
              : `${Math.abs(paceGap)}% ${paceGap > 0 ? "over" : "under"} pace`}
          </span>
        )}
        {reached ? (
          <span className="text-xs text-destructive-foreground">Limit reached</span>
        ) : runsOutEarly ? (
          <span className="text-xs text-warning-foreground">
            Max {formatRate(projection.evenPercentPerHour, window.windowDurationMins)}
          </span>
        ) : null}
      </span>
    </div>
  );
}
