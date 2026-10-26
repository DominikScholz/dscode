import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import type { UsageProviderKind } from "@t3tools/contracts";
import { useLayoutEffect, useRef, useState } from "react";

import type { DailyTotals, HourlyTotals, SeriesTotals } from "@t3tools/shared/usageMerge";
import {
  formatDayShort,
  formatHourShort,
  formatRelativeHourShort,
  formatSeriesSlot,
  formatTokens,
  formatUsd,
} from "@t3tools/shared/usageFormat";
import { cn } from "~/lib/utils";
import { PROVIDER_ORDER, PROVIDER_PRESENTATION } from "./usageProviders";
import { observeResize } from "~/lib/observeResize";

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 260;
// Lines use the top; the per-slot volume bars keep their own band below.
const LINE_TOP = 18;
const LINE_BOTTOM = 196;
const VOLUME_TOP = 214;
const NONE_LOADING: ReadonlySet<UsageProviderKind> = new Set();

export type UsageChartMetric = "tokens" | "cost";

/** What one volume bar covers: "hour", "4 hours", or "day". */
export function usageChartSlot(resolution: "day" | "hour", series: SeriesTotals | null): string {
  if (series !== null) return series.stepHours === 1 ? "hour" : `${series.stepHours} hours`;
  return resolution === "hour" ? "hour" : "day";
}

interface UsageProviderChartProps {
  readonly providers: readonly UsageProviderKind[];
  readonly loadingProviders?: ReadonlySet<UsageProviderKind>;
  readonly days: readonly string[];
  readonly daily: readonly DailyTotals[];
  readonly hours: readonly string[];
  readonly hourly: readonly HourlyTotals[];
  readonly metric: UsageChartMetric;
  readonly referenceTime: string | undefined;
  readonly resolution: "day" | "hour";
  /** Replaces the daily periods when every contributing environment sent one. */
  readonly series?: SeriesTotals | null;
  readonly timeZone: string;
  readonly hour12: boolean;
}

type PeriodTotals = Pick<DailyTotals, "byProvider">;

export interface DayColumn {
  readonly bands: readonly {
    readonly provider: UsageProviderKind;
    readonly value: number;
  }[];
  readonly total: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function valueFor(
  totals: PeriodTotals | undefined,
  provider: UsageProviderKind,
  metric: UsageChartMetric,
): number {
  const entry = totals?.byProvider.get(provider);
  if (entry === undefined) return 0;
  return metric === "tokens" ? entry.totalTokens : entry.costUsd;
}

export function buildPeriodColumns(
  periods: readonly string[],
  byPeriod: ReadonlyMap<string, PeriodTotals>,
  metric: UsageChartMetric,
): readonly DayColumn[] {
  return periods.map((period) => {
    const entry = byPeriod.get(period);
    const bands = PROVIDER_ORDER.map((provider) => ({
      provider,
      value: valueFor(entry, provider, metric),
    }));
    return { bands, total: bands.reduce((sum, band) => sum + band.value, 0) };
  });
}

function linePath(points: readonly Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}

function buildChart(
  periods: readonly string[],
  byPeriod: ReadonlyMap<string, PeriodTotals>,
  metric: UsageChartMetric,
  providers: readonly UsageProviderKind[],
) {
  const columns = buildPeriodColumns(periods, byPeriod, metric);
  const stepX = periods.length < 2 ? 0 : VIEW_WIDTH / (periods.length - 1);
  const lines = providers.map((provider) => {
    const slot = PROVIDER_ORDER.indexOf(provider);
    const values = columns.map((column) => column.bands[slot]?.value ?? 0);
    return { provider, values, total: values.reduce((sum, value) => sum + value, 0) };
  });
  const lineMax = Math.max(0, ...lines.flatMap((line) => line.values));
  const lineY = (value: number) =>
    lineMax === 0 ? LINE_BOTTOM : LINE_BOTTOM - (value / lineMax) * (LINE_BOTTOM - LINE_TOP);
  const slotTotals = columns.map((column) =>
    providers.reduce(
      (sum, provider) => sum + (column.bands[PROVIDER_ORDER.indexOf(provider)]?.value ?? 0),
      0,
    ),
  );
  const barMax = Math.max(0, ...slotTotals);
  const barWidth = Math.max(1, Math.min(stepX * 0.5, 4));
  const bars = slotTotals.map((value, index) => {
    const height = barMax === 0 ? 0 : (value / barMax) * (VIEW_HEIGHT - VOLUME_TOP);
    return {
      x: Math.min(Math.max(0, index * stepX - barWidth / 2), VIEW_WIDTH - barWidth),
      y: VIEW_HEIGHT - height,
      width: barWidth,
      height,
    };
  });

  return {
    columns,
    stepX,
    bars,
    slotTotals,
    lines: lines
      .map((line) => {
        const points = line.values.map((value, index) => ({ x: index * stepX, y: lineY(value) }));
        const average = line.values.length === 0 ? 0 : line.total / line.values.length;
        return { ...line, points, path: linePath(points), average, averageY: lineY(average) };
      })
      .toSorted((a, b) => b.total - a.total),
  };
}

type ChartLine = ReturnType<typeof buildChart>["lines"][number];

function percentLeft(x: number) {
  return `${(x / VIEW_WIDTH) * 100}%`;
}

function percentTop(y: number) {
  return `${(y / VIEW_HEIGHT) * 100}%`;
}

function ChartDot({
  point,
  color,
  glow,
}: {
  readonly point: Point;
  readonly color: string;
  readonly glow: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-current",
        glow ? "size-2 chart-glow" : "size-1.5",
      )}
      style={{ left: percentLeft(point.x), top: percentTop(point.y), color }}
    />
  );
}

function UsageChartTooltip({
  tooltipRef,
  label,
  index,
  lines,
  slotTotal,
  loadingProviders,
  format,
}: {
  readonly tooltipRef: React.Ref<HTMLDivElement>;
  readonly label: string;
  readonly index: number;
  readonly lines: readonly ChartLine[];
  readonly slotTotal: number;
  readonly loadingProviders: ReadonlySet<UsageProviderKind>;
  readonly format: (value: number) => string;
}) {
  const partial = lines.some((line) => loadingProviders.has(line.provider));
  return (
    <div
      ref={tooltipRef}
      className="popup-surface panel-edge pointer-events-none absolute z-10 min-w-40 max-w-full rounded-xl px-2.5 py-2 text-xs"
      style={{
        left: "var(--usage-tooltip-left, 0px)",
        top: "var(--usage-tooltip-top, 0px)",
      }}
    >
      <div className="mb-1 text-muted-foreground">{label}</div>
      {lines.map(({ provider, values }) => {
        const { label: providerLabel, driverKind } = PROVIDER_PRESENTATION[provider];
        return (
          <div key={provider} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <ProviderInstanceIcon
                driverKind={driverKind}
                displayName={providerLabel}
                iconClassName="size-3"
              />
              {providerLabel}
            </span>
            <span
              className={cn(
                "tabular-nums",
                loadingProviders.has(provider) ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {format(values[index] ?? 0)}
            </span>
          </div>
        );
      })}
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1">
        <span className="text-muted-foreground">Total</span>
        <span className={cn("tabular-nums", partial ? "text-muted-foreground" : "text-foreground")}>
          {format(slotTotal)}
        </span>
      </div>
    </div>
  );
}

function UsageChartPlot({
  periods,
  lines,
  bars,
  slotTotals,
  stepX,
  marker,
  loadingProviders,
  format,
  formatTooltipPeriod,
  ariaLabel,
}: {
  readonly periods: readonly string[];
  readonly lines: readonly ChartLine[];
  readonly bars: ReturnType<typeof buildChart>["bars"];
  readonly slotTotals: readonly number[];
  readonly stepX: number;
  readonly marker: { readonly index: number; readonly label: string } | null;
  readonly loadingProviders: ReadonlySet<UsageProviderKind>;
  readonly format: (value: number) => string;
  readonly formatTooltipPeriod: (period: string) => string;
  readonly ariaLabel: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hoverPositionRef = useRef<{ x: number; y: number } | null>(null);

  const positionTooltip = () => {
    const plot = plotRef.current;
    const tooltip = tooltipRef.current;
    const hoverPosition = hoverPositionRef.current;
    if (plot === null || tooltip === null || hoverPosition === null) return;

    const gap = 12;
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const plotWidth = plot.clientWidth;
    const plotHeight = plot.clientHeight;
    const preferredLeft =
      hoverPosition.x + gap + tooltipWidth <= plotWidth
        ? hoverPosition.x + gap
        : hoverPosition.x - gap - tooltipWidth;
    const preferredTop =
      hoverPosition.y + gap + tooltipHeight <= plotHeight
        ? hoverPosition.y + gap
        : hoverPosition.y - gap - tooltipHeight;
    const left = Math.min(Math.max(0, preferredLeft), Math.max(0, plotWidth - tooltipWidth));
    const top = Math.min(Math.max(0, preferredTop), Math.max(0, plotHeight - tooltipHeight));
    plot.style.setProperty("--usage-tooltip-left", `${left}px`);
    plot.style.setProperty("--usage-tooltip-top", `${top}px`);
  };

  useLayoutEffect(() => {
    if (hoverIndex === null) return;
    positionTooltip();

    const plot = plotRef.current;
    const tooltip = tooltipRef.current;
    if (plot === null || tooltip === null) return;

    return observeResize([plot, tooltip], positionTooltip);
  }, [hoverIndex, positionTooltip]);

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const plot = plotRef.current;
    if (plot === null || periods.length === 0) return;
    const bounds = plot.getBoundingClientRect();
    if (bounds.width === 0) return;
    const localX = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
    const localY = Math.min(bounds.height, Math.max(0, event.clientY - bounds.top));
    const fraction = localX / bounds.width;
    const index = Math.round(fraction * (periods.length - 1));
    hoverPositionRef.current = { x: localX, y: localY };
    positionTooltip();
    setHoverIndex(Math.min(periods.length - 1, Math.max(0, index)));
  };

  const hoveredPeriod = hoverIndex === null ? undefined : periods[hoverIndex];
  const lineClassName = (provider: UsageProviderKind) =>
    cn("transition-opacity", loadingProviders.has(provider) && "opacity-40 delay-150");

  return (
    <div
      ref={plotRef}
      className="relative h-64 w-full"
      onMouseMove={handleMove}
      onMouseLeave={() => {
        hoverPositionRef.current = null;
        setHoverIndex(null);
      }}
    >
      <div aria-hidden="true" className="chart-dot-grid absolute inset-0" />
      {lines.map((line) =>
        line.average > 0 ? (
          <div
            key={line.provider}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 border-t border-dotted"
            style={{
              top: percentTop(line.averageY),
              borderColor: `color-mix(in srgb, ${PROVIDER_PRESENTATION[line.provider].color} 55%, transparent)`,
            }}
          />
        ) : null,
      )}
      {marker === null ? null : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/20"
          style={{ left: percentLeft(marker.index * stepX) }}
        >
          <span className="absolute top-0 left-1.5 whitespace-nowrap text-3xs text-muted-foreground tabular-nums">
            {marker.label}
          </span>
        </div>
      )}
      <svg
        className="relative h-full w-full"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        {bars.map((bar, index) =>
          bar.height === 0 ? null : (
            <rect
              // oxlint-disable-next-line react/no-array-index-key -- Bars are positional slots of a fixed window.
              key={index}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill="currentColor"
              shapeRendering="crispEdges"
              className={index === hoverIndex ? "text-foreground/60" : "text-foreground/20"}
            />
          ),
        )}
        {hoverIndex === null ? null : (
          <line
            x1={hoverIndex * stepX}
            x2={hoverIndex * stepX}
            y1={0}
            y2={VIEW_HEIGHT}
            stroke="currentColor"
            strokeWidth={1}
            className="text-foreground/25"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {lines.map(({ provider, path }) => (
          <path
            key={provider}
            d={path}
            className={lineClassName(provider)}
            fill="none"
            stroke={PROVIDER_PRESENTATION[provider].color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {lines.map(({ provider, points }) => {
        const point = hoverIndex === null ? points.at(-1) : points[hoverIndex];
        return point === undefined ? null : (
          <ChartDot
            key={provider}
            point={point}
            color={PROVIDER_PRESENTATION[provider].color}
            glow={hoverIndex === null}
          />
        );
      })}

      {hoverIndex === null || hoveredPeriod === undefined ? null : (
        <UsageChartTooltip
          tooltipRef={tooltipRef}
          label={formatTooltipPeriod(hoveredPeriod)}
          index={hoverIndex}
          lines={lines}
          slotTotal={slotTotals[hoverIndex] ?? 0}
          loadingProviders={loadingProviders}
          format={format}
        />
      )}
    </div>
  );
}

export function UsageProviderChart({
  providers,
  loadingProviders = NONE_LOADING,
  days,
  daily,
  hours,
  hourly,
  metric,
  referenceTime,
  resolution,
  series = null,
  timeZone,
  hour12,
}: UsageProviderChartProps) {
  const slotKey = (slot: { readonly day: string; readonly hour: number }) =>
    `${slot.day}T${slot.hour}`;
  const totals: readonly (DailyTotals | HourlyTotals)[] = resolution === "hour" ? hourly : daily;
  const periods =
    series === null ? (resolution === "hour" ? hours : days) : series.slots.map(slotKey);
  const slotByPeriod = new Map(series?.slots.map((slot) => [slotKey(slot), slot]));
  const byPeriod: ReadonlyMap<string, PeriodTotals> =
    series === null
      ? new Map(totals.map((entry) => ["hourStart" in entry ? entry.hourStart : entry.day, entry]))
      : slotByPeriod;
  const { lines, bars, slotTotals, stepX } = buildChart(periods, byPeriod, metric, providers);
  const format = metric === "tokens" ? formatTokens : formatUsd;
  const slot = usageChartSlot(resolution, series);
  const formatPeriod = (period: string) => {
    const seriesSlot = slotByPeriod.get(period);
    if (seriesSlot !== undefined) return formatDayShort(seriesSlot.day);
    return resolution === "hour"
      ? formatHourShort(period, timeZone, hour12)
      : formatDayShort(period);
  };
  const formatTooltipPeriod = (period: string) => {
    const seriesSlot = slotByPeriod.get(period);
    if (seriesSlot !== undefined && series !== null) {
      return formatSeriesSlot(seriesSlot.day, seriesSlot.hour, series.stepHours, hour12);
    }
    return resolution === "hour" && referenceTime !== undefined
      ? formatRelativeHourShort(period, referenceTime, timeZone, hour12)
      : formatPeriod(period);
  };
  // Series windows end now, so the last slot's day is today.
  const today = series?.slots.at(-1)?.day;
  const todayIndex = series?.slots.findIndex((seriesSlot) => seriesSlot.day === today) ?? -1;
  const marker =
    todayIndex > 0 && todayIndex < periods.length - 1
      ? {
          index: todayIndex,
          label: `Today ${format(slotTotals.slice(todayIndex).reduce((sum, value) => sum + value, 0))}`,
        }
      : null;
  const middle = periods[Math.floor(periods.length / 2)];
  const last = periods.at(-1);

  // Average labels live in a gutter beside the plot so they never sit on a line.
  const averageLabels: { provider: UsageProviderKind; value: number; y: number }[] = [];
  for (const line of lines.toSorted((a, b) => a.averageY - b.averageY)) {
    if (line.average <= 0) continue;
    const previous = averageLabels.at(-1);
    averageLabels.push({
      provider: line.provider,
      value: line.average,
      y: previous === undefined ? line.averageY : Math.max(line.averageY, previous.y + 16),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <UsageChartPlot
            periods={periods}
            lines={lines}
            bars={bars}
            slotTotals={slotTotals}
            stepX={stepX}
            marker={marker}
            loadingProviders={loadingProviders}
            format={format}
            formatTooltipPeriod={formatTooltipPeriod}
            ariaLabel={`${metric === "tokens" ? "Processed tokens" : "Cost"} per ${slot} by provider`}
          />
        </div>
        <div aria-hidden="true" className="relative h-64 w-20 shrink-0">
          {averageLabels.map((label) => (
            <span
              key={label.provider}
              className="absolute left-0 -translate-y-1/2 whitespace-nowrap text-3xs tabular-nums uppercase"
              style={{
                top: percentTop(label.y),
                color: PROVIDER_PRESENTATION[label.provider].color,
              }}
            >
              Avg {format(label.value)}
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-between pe-23 text-3xs text-muted-foreground uppercase">
        <span>{periods[0] === undefined ? "" : formatPeriod(periods[0])}</span>
        <span>{middle === undefined ? "" : formatPeriod(middle)}</span>
        <span>{last === undefined ? "" : formatPeriod(last)}</span>
      </div>
    </div>
  );
}
