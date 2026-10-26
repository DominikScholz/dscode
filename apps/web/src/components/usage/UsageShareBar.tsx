import { formatPercent } from "@t3tools/shared/usageFormat";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface ShareSegment {
  readonly label: string;
  readonly value: number;
}

export function UsageShareBar({
  label,
  segments,
  format,
  aside,
  layout = "columns",
}: {
  readonly label: string;
  readonly segments: readonly ShareSegment[];
  readonly format: (value: number) => string;
  readonly aside?: ReactNode;
  /** Columns side by side, or a compact list for a narrow side card. */
  readonly layout?: "columns" | "list";
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return null;

  return (
    <div className="flex min-w-0 flex-col">
      <div
        className={cn(
          "flex items-baseline justify-between gap-3",
          layout === "list" ? "mb-3" : "mb-4",
        )}
      >
        <h3 className="text-label font-semibold text-foreground/58">{label}</h3>
        {aside}
      </div>
      {/* Each part owns its own share line, so nothing has to line up with a joined bar. */}
      <div
        className={cn(
          layout === "list"
            ? "flex flex-col gap-3.5"
            : "grid grid-cols-2 gap-x-8 gap-y-5 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none",
        )}
      >
        {visible.map((segment) => (
          <Tooltip key={segment.label}>
            <TooltipTrigger
              render={
                <span
                  className={cn(
                    "flex min-w-0 cursor-default outline-none",
                    layout === "list" ? "flex-col-reverse gap-2" : "flex-col gap-3",
                  )}
                />
              }
            >
              <span className="relative h-0.5 overflow-hidden rounded-full bg-foreground/7">
                {/* One ink for every share; a grey per type read as size where there is none. */}
                <span
                  className="absolute inset-y-0 left-0 min-w-0.5 rounded-full bg-foreground/90"
                  style={{ width: `${(segment.value / total) * 100}%` }}
                />
              </span>
              {layout === "list" ? (
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-foreground/70">{segment.label}</span>
                  <span className="shrink-0 font-medium text-foreground tabular-nums">
                    {format(segment.value)}
                  </span>
                </span>
              ) : (
                <>
                  <span className="text-xs text-foreground/58">{segment.label}</span>
                  <span className="-mt-1 text-sm leading-none font-semibold text-foreground tabular-nums">
                    {format(segment.value)}
                  </span>
                </>
              )}
            </TooltipTrigger>
            <TooltipPopup>
              {segment.label} · {format(segment.value)} · {formatPercent(segment.value / total)}
            </TooltipPopup>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
