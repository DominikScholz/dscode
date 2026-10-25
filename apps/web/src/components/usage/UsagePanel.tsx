import type * as React from "react";

import { cn } from "~/lib/utils";

/** The charcoal card every Usage section sits on; `glow` tints it from the top-left. */
export function UsagePanel({
  className,
  glow,
  style,
  ...props
}: React.ComponentProps<"section"> & { readonly glow?: string | undefined }) {
  return (
    <section
      className={cn(
        "relative min-w-0 rounded-2xl bg-(--panel-surface) p-5 panel-edge squircle",
        glow === undefined ? "bg-(image:--panel-sheen)" : "surface-glow",
        className,
      )}
      style={
        glow === undefined ? style : ({ ...style, "--glow-color": glow } as React.CSSProperties)
      }
      {...props}
    />
  );
}
