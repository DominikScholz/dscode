import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { formatDuration, type LimitProjection } from "@t3tools/shared/usageLimits";
import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";

import { usePrimarySettings } from "../../hooks/useSettings";
import { cn } from "~/lib/utils";
import { resolveHour12 } from "../../timestampFormat";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { usePaceMark } from "./UsageLimits";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const TIME_FORMAT = {
  h12: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
  h23: new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
};

function windowTime(ms: number, now: number, hour12: boolean): string {
  const parts = (hour12 ? TIME_FORMAT.h12 : TIME_FORMAT.h23).formatToParts(
    Math.round(ms / 60_000) * 60_000,
  );
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const minute = part("minute");
  const date = DATE_FORMAT.format(ms);
  const time = hour12 && minute === "00" ? part("hour") : `${part("hour")}:${minute}`;
  return `${date === DATE_FORMAT.format(now) ? "" : `${date}, `}${time}${hour12 ? ` ${part("dayPeriod")}` : ""}`;
}

/**
 * A limit row's identity: its name, with an optional quiet line under it. A window that needs
 * explaining explains itself on hover.
 */
export function StatLabel({
  label,
  description,
  sub,
}: {
  readonly label: string;
  readonly description?: string | undefined;
  readonly sub?: ReactNode;
}) {
  const className = "truncate text-label leading-4 font-medium text-foreground/95";
  return (
    <span className="flex min-w-0 flex-col">
      {description ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  className,
                  "cursor-default underline decoration-foreground/30 decoration-dotted underline-offset-4",
                )}
              />
            }
          >
            {label}
          </TooltipTrigger>
          <TooltipPopup side="top">
            <span className="block max-w-64">{description}</span>
          </TooltipPopup>
        </Tooltip>
      ) : (
        <span className={className}>{label}</span>
      )}
      {sub ? <span className="mt-1 text-xs leading-4 text-foreground/52">{sub}</span> : null}
    </span>
  );
}

/** A limit's name over what is left, large, as main shows it; a warning only when it runs out. */
export function LimitFigure({
  label,
  description,
  percent,
  note,
}: {
  readonly label: string;
  readonly description?: string | undefined;
  readonly percent: number;
  readonly note?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <StatLabel label={label} description={description} />
      <span className="flex items-baseline gap-2">
        <span className="text-3xl leading-none font-semibold text-foreground tabular-nums">
          {Math.round(percent)}%
        </span>
        <span className="text-sm text-foreground/58">left</span>
      </span>
      {note}
    </div>
  );
}

export const LIMIT_ROW_CLASS =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 py-5 md:grid-cols-[10rem_minmax(0,1fr)_6rem] md:gap-x-0";

/** One row of a provider's limits: what is left, the bar, and when it resets. */
export function LimitRow({
  label,
  description,
  window,
  projection,
  color,
  now,
}: {
  readonly label: string;
  readonly description?: string | undefined;
  readonly window: ServerProviderUsageWindow;
  readonly projection: LimitProjection;
  readonly color: string;
  readonly now: number;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const hour12 = resolveHour12(timestampFormat);
  const used = Math.max(0, Math.min(100, window.usedPercent));
  const left = 100 - used;
  const { runsOutAt, projectedPercent, elapsed, forecastFrom } = projection;
  const reached = used >= 100;
  const forecasting = now >= forecastFrom;
  const runsOutEarly = forecasting && !reached && runsOutAt !== null;
  const leftAtReset = !forecasting ? left : runsOutEarly ? 0 : Math.max(0, 100 - projectedPercent);
  const timeLeft = Math.round((1 - elapsed) * 100);
  // Points spent beyond even pace; the bar tints that stretch rather than labelling it.
  const behind = forecasting && !reached ? Math.max(0, timeLeft - left) : 0;
  const [barRef, paceMark] = usePaceMark(timeLeft);
  const endMs = Date.parse(window.resetsAt ?? "");
  const forecast = reached
    ? "Limit reached"
    : !forecasting
      ? `Forecast in ${formatDuration(forecastFrom - now)}`
      : runsOutEarly
        ? `Runs out ${windowTime(runsOutAt, now, hour12)}`
        : `About ${Math.round(leftAtReset)}% at reset`;

  return (
    <div className={LIMIT_ROW_CLASS}>
      <LimitFigure label={label} description={description} percent={left} />
      <div className="relative order-3 col-span-2 md:order-none md:col-span-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                ref={barRef}
                role="img"
                tabIndex={0}
                aria-label={`${label}: ${Math.round(left)}% left, ${timeLeft}% of the window left. ${forecast}.`}
                className="relative h-6 w-full cursor-default rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              />
            }
          >
            <div className="absolute inset-0" style={paceMark?.gap}>
              <div className="absolute inset-x-0 inset-y-1.75 rounded-full limit-track" />
              {behind >= 2 ? (
                <div
                  className="absolute inset-y-1.75 pace-deficit"
                  style={{ left: `${left}%`, width: `${behind}%` }}
                />
              ) : null}
              {left > 0 ? (
                <div
                  className="absolute inset-y-1.75 left-0 rounded-full limit-fill"
                  style={{ width: `${left}%`, backgroundColor: color }}
                />
              ) : null}
            </div>
            {paceMark ? (
              <span
                aria-hidden
                className="absolute inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                style={paceMark.tick}
              />
            ) : null}
          </TooltipTrigger>
          <TooltipPopup side="top">
            <div className="flex max-w-64 flex-col gap-0.5 text-start">
              <span className="text-foreground">
                {forecast} · {timeLeft}% of the window left
              </span>
              <span className="text-muted-foreground">
                {behind >= 2
                  ? `${Math.round(behind)}% behind even pace`
                  : left > timeLeft
                    ? `${Math.round(left - timeLeft)}% ahead of even pace`
                    : "On even pace"}
              </span>
              {Number.isFinite(endMs) ? (
                <span className="text-muted-foreground">
                  Resets {windowTime(endMs, now, hour12)}
                </span>
              ) : null}
              <span className="text-muted-foreground">
                The line is where even spending would be; the red glow is how far past it you are.
              </span>
            </div>
          </TooltipPopup>
        </Tooltip>
        {/* Hangs below the bar so a warning never makes its row taller than the others. */}
        {reached || runsOutEarly ? (
          <span className="absolute top-full inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-destructive-foreground">
            <AlertTriangleIcon aria-hidden className="size-3.5 shrink-0" />
            {forecast}
          </span>
        ) : null}
      </div>
      {Number.isFinite(endMs) ? (
        <span className="justify-self-end text-xs text-foreground/60 tabular-nums">
          <span aria-hidden>↻ </span>
          <span className="sr-only">Resets in </span>
          {formatDuration(endMs - now)}
        </span>
      ) : null}
    </div>
  );
}
