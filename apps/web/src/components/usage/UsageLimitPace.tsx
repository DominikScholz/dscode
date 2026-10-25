import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import type { LimitProjection } from "@t3tools/shared/usageLimits";

import { usePrimarySettings } from "../../hooks/useSettings";
import { cn } from "~/lib/utils";
import { formatUpcomingTimestamp, resolveHour12 } from "../../timestampFormat";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { usePaceMark } from "./UsageLimits";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const TIME_FORMAT = {
  h12: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
  h23: new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
};

function WindowTime({
  ms,
  now,
  hour12,
}: {
  readonly ms: number;
  readonly now: number;
  readonly hour12: boolean;
}) {
  const parts = (hour12 ? TIME_FORMAT.h12 : TIME_FORMAT.h23).formatToParts(
    Math.round(ms / 60_000) * 60_000,
  );
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const minute = part("minute");
  const date = DATE_FORMAT.format(ms);
  return (
    <>
      {date === DATE_FORMAT.format(now) ? null : `${date}, `}
      {hour12 && minute === "00" ? part("hour") : `${part("hour")}:${minute}`}
      {hour12 ? <span className="ms-0.5 text-3xs">{part("dayPeriod")}</span> : null}
    </>
  );
}

/** A limit row's name; a window that needs explaining explains itself on hover. */
export function StatLabel({
  label,
  description,
}: {
  readonly label: string;
  readonly description?: string | undefined;
}) {
  if (!description) return <span className="truncate text-sm text-muted-foreground">{label}</span>;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="cursor-default truncate text-sm text-muted-foreground underline decoration-dotted underline-offset-4" />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipPopup side="top">
        <span className="block max-w-64">{description}</span>
      </TooltipPopup>
    </Tooltip>
  );
}

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
      ? `Runs out ${formatUpcomingTimestamp(new Date(runsOutAt).toISOString(), timestampFormat, now)}`
      : `About ${Math.round(leftAtReset)}% left at reset`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-8 gap-y-2 py-4 md:grid-cols-[9rem_minmax(0,1fr)_9rem]">
      <StatLabel label={label} description={description} />
      <div className="order-3 col-span-2 flex flex-col gap-1 md:order-none md:col-span-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                ref={barRef}
                role="img"
                tabIndex={0}
                aria-label={`${label}: ${Math.round(left)}% left, ${timeLeft}% of the window left. ${forecast}.`}
                className="relative h-3.5 w-full cursor-default rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              />
            }
          >
            <div className="absolute inset-0" style={paceMark?.gap}>
              <div className="absolute inset-x-0 inset-y-1 rounded-full bg-foreground/8" />
              {left > 0 ? (
                <div
                  className="absolute inset-y-1 left-0 overflow-hidden rounded-full"
                  style={{ width: `${left}%` }}
                >
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${(leftAtReset / left) * 100}%`, backgroundColor: color }}
                  />
                  <div
                    className={cn(
                      "absolute inset-y-0 right-0 chart-hatch",
                      runsOutEarly && "text-warning",
                    )}
                    style={{
                      width: `${100 - (leftAtReset / left) * 100}%`,
                      ...(runsOutEarly ? {} : { color }),
                    }}
                  />
                </div>
              ) : null}
            </div>
            {paceMark ? (
              <span
                aria-hidden
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                style={paceMark.tick}
              />
            ) : null}
          </TooltipTrigger>
          <TooltipPopup side="top">
            <div className="flex max-w-64 flex-col gap-0.5 text-start">
              <span className="text-foreground">
                {Math.round(left)}% left · {timeLeft}% of the window left
              </span>
              <span className="text-muted-foreground">
                The line is where even spending would be. Hatching is what your pace so far uses
                before the reset. {forecast}.
              </span>
            </div>
          </TooltipPopup>
        </Tooltip>
        <span className="text-xs text-muted-foreground tabular-nums">
          Resets <WindowTime ms={endMs} now={now} hour12={hour12} />
        </span>
      </div>
      <span className="order-2 flex flex-col items-end text-end md:order-none">
        <span className="text-2xl font-semibold text-foreground tabular-nums">
          {Math.round(left)}%
          <span className="ms-1 text-sm font-normal text-muted-foreground">left</span>
        </span>
        <span
          className={cn(
            "text-xs",
            reached
              ? "text-destructive-foreground"
              : runsOutEarly
                ? "text-warning-foreground"
                : "text-muted-foreground",
          )}
        >
          {reached || runsOutEarly ? forecast : `About ${Math.round(leftAtReset)}% at reset`}
        </span>
      </span>
    </div>
  );
}
