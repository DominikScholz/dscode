import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import type { LimitProjection } from "@t3tools/shared/usageLimits";
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

/** What is left, large, with one quiet line under it. */
export function LeftFigure({
  percent,
  note,
  tone = "muted",
}: {
  readonly percent: number;
  readonly note?: ReactNode;
  readonly tone?: "muted" | "warning" | "destructive";
}) {
  return (
    <span className="order-2 flex flex-col items-end text-end md:order-none md:ps-8">
      <span className="text-figure leading-5 font-semibold text-foreground tabular-nums">
        {Math.round(percent)}%
        <span className="ms-1 text-xs font-normal text-foreground/58">left</span>
      </span>
      {note ? (
        <span
          className={cn(
            "mt-1 text-xs leading-4",
            tone === "destructive"
              ? "text-destructive-foreground"
              : tone === "warning"
                ? "usage-warning-badge text-2xs font-medium whitespace-nowrap"
                : "text-foreground/52",
          )}
        >
          {note}
        </span>
      ) : null}
    </span>
  );
}

export const LIMIT_ROW_CLASS =
  "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-3 py-5 md:grid-cols-[10rem_minmax(0,1fr)_12rem] md:gap-x-0";

/** One row of a provider's limits: its name, the bar upstream draws, and what is left. */
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
  const { runsOutAt, projectedPercent, elapsed } = projection;
  const reached = used >= 100;
  const runsOutEarly = !reached && runsOutAt !== null;
  const leftAtReset = runsOutEarly ? 0 : Math.max(0, 100 - projectedPercent);
  const timeLeft = Math.round((1 - elapsed) * 100);
  const [barRef, paceMark] = usePaceMark(timeLeft);
  const endMs = Date.parse(window.resetsAt ?? "");
  const forecast = reached
    ? "Limit reached"
    : runsOutEarly
      ? `Runs out ${windowTime(runsOutAt, now, hour12)}`
      : `About ${Math.round(leftAtReset)}% at reset`;

  // Two baseline rows: name and what is left, then the reset and the forecast, with the bar
  // spanning both between them.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 py-6 md:grid-cols-[10rem_minmax(0,1fr)_12rem] md:gap-x-0">
      <div className="col-start-1 row-start-1 min-w-0">
        <StatLabel label={label} description={description} />
      </div>
      <span className="col-start-1 row-start-2 text-xs leading-none text-foreground/52">
        Resets {windowTime(endMs, now, hour12)}
      </span>
      <span className="col-start-2 row-start-1 justify-self-end text-figure leading-none font-semibold text-foreground tabular-nums md:col-start-3">
        {Math.round(left)}%<span className="ms-1 text-xs font-normal text-foreground/58">left</span>
      </span>
      <span
        className={cn(
          "col-start-2 row-start-2 justify-self-end text-xs leading-none md:col-start-3",
          reached
            ? "text-destructive-foreground"
            : runsOutEarly
              ? "usage-warning-badge font-medium whitespace-nowrap"
              : "text-foreground/52",
        )}
      >
        {forecast}
      </span>
      {/* Line boxes carry space above the capitals; the nudge centres the bar on the visible text. */}
      <div className="col-span-2 row-start-3 self-center md:col-span-1 md:col-start-2 md:row-span-2 md:row-start-1 md:translate-y-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                ref={barRef}
                role="img"
                tabIndex={0}
                aria-label={`${label}: ${Math.round(left)}% left, ${timeLeft}% of the window left. ${forecast}.`}
                className="relative h-5 w-full cursor-default rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              />
            }
          >
            <div className="absolute inset-0" style={paceMark?.gap}>
              {/* The track shows only where nothing is left, so the projected dots sit on bare card. */}
              <div
                className="absolute top-1/2 right-0 h-px -translate-y-1/2 bg-foreground/16"
                style={{ left: `${left}%` }}
              />
              {left > 0 ? (
                <div
                  className="absolute inset-y-2.25 left-0 overflow-hidden rounded-full"
                  style={{ width: `${left}%` }}
                >
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${(leftAtReset / left) * 100}%`, backgroundColor: color }}
                  />
                  <div
                    className="absolute inset-y-0 right-0"
                    style={{
                      width: `${100 - (leftAtReset / left) * 100}%`,
                      // Projected use reads as a dotted line in full colour, as Fey draws forecasts;
                      // rose when it runs out, matching the badge.
                      backgroundImage: `radial-gradient(circle, ${runsOutEarly ? "rgb(235 86 122)" : color} 1px, transparent 1.25px)`,
                      backgroundSize: "5px 100%",
                    }}
                  />
                </div>
              ) : null}
            </div>
            {paceMark ? (
              <span
                aria-hidden
                className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-foreground/70"
                // Snapped to a whole pixel; a centred 1px line otherwise smears across two.
                style={{ left: `round(down, ${paceMark.tick.left}, 1px)` }}
              />
            ) : null}
            {/* The head draws last so its ring masks the pace tick when the two meet. */}
            {left > 0 ? (
              <span
                aria-hidden
                className="absolute top-1/2 size-1.5 -translate-1/2 rounded-full bar-head"
                style={{
                  left: `${left}%`,
                  backgroundColor: runsOutEarly ? "rgb(235 86 122)" : color,
                }}
              />
            ) : null}
          </TooltipTrigger>
          <TooltipPopup side="top">
            <div className="flex max-w-64 flex-col gap-0.5 text-start">
              <span className="text-foreground">
                {Math.round(left)}% left · {timeLeft}% of the window left
              </span>
              <span className="text-muted-foreground">
                The line is where even spending would be. The dotted end is what your pace so far
                uses before the reset. {forecast}.
              </span>
            </div>
          </TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
}
