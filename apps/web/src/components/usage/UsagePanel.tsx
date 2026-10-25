import type * as React from "react";

import { cn } from "~/lib/utils";

/** The card every Usage section sits on: a faint lift that fades downward, and a hairline edge. */
export function UsagePanel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "relative min-w-0 rounded-2xl border border-foreground/6 bg-linear-to-b from-foreground/4 to-foreground/1 p-5 squircle",
        className,
      )}
      {...props}
    />
  );
}
