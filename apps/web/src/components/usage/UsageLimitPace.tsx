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
      {hour12 ? <span className="ms-0.5 text-4xs">{part("dayPeriod")}</span> : null}
    </>
  );
}

/**
 * One limit window as the bar upstream draws: the share left, and a line at the share of time
 * left, so fill short of the line is spending ahead of an even pace. The hatched end of the fill
 * is what the pace so far spends before the reset. Under it, the window's reset and start.
 */
export function LimitPaceRow({
  label,
  window,
  projection,
  color,
  now,
}: {
  readonly label: string;
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
  const startMs = endMs - (window.windowDurationMins ?? 0) * 60_000;
  const status = reached
    ? "Limit reached"
    : runsOutEarly
      ? `Runs out ${formatUpcomingTimestamp(new Date(runsOutAt).toISOString(), timestampFormat, now)}`
      : `About ${Math.round(leftAtReset)}% left at reset`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 md:grid-cols-[8rem_minmax(0,1fr)_11rem]">
      <span className="truncate text-sm text-foreground">{label}</span>
      <div className="order-3 col-span-2 md:order-none md:col-span-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                ref={barRef}
                role="img"
                tabIndex={0}
                aria-label={`${label}: ${Math.round(left)}% left, ${timeLeft}% of the window left. ${status}.`}
                className="relative h-4 cursor-default rounded-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
            }
          >
            <div className="absolute inset-0" style={paceMark?.gap}>
              <div className="absolute inset-x-0 inset-y-1 rounded-full bg-muted" />
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
                className="absolute inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                style={paceMark.tick}
              />
            ) : null}
          </TooltipTrigger>
          <TooltipPopup side="top">
            <div className="flex max-w-64 flex-col gap-0.5">
              <span className="text-foreground">
                {Math.round(left)}% left · {timeLeft}% of the window left
              </span>
              <span className="text-muted-foreground">
                The line is where even spending would be. Hatching is what your pace so far uses
                before the reset.
              </span>
            </div>
          </TooltipPopup>
        </Tooltip>
        <div className="flex justify-between text-3xs whitespace-nowrap text-muted-foreground tabular-nums">
          <span>
            Resets <WindowTime ms={endMs} now={now} hour12={hour12} />
          </span>
          <span>
            Started <WindowTime ms={startMs} now={now} hour12={hour12} />
          </span>
        </div>
      </div>
      <span className="order-2 flex min-w-0 flex-col items-end text-xs md:order-none md:items-start">
        <span className="text-sm text-muted-foreground tabular-nums">
          <span className="font-semibold text-foreground">{Math.round(left)}%</span> left
        </span>
        <span
          className={cn(
            "truncate",
            reached
              ? "text-destructive-foreground"
              : runsOutEarly
                ? "text-warning-foreground"
                : "text-muted-foreground",
          )}
        >
          {status}
        </span>
      </span>
    </div>
  );
}
