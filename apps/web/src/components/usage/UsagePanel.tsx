import type * as React from "react";

import { cn } from "~/lib/utils";

/** The card every Usage section sits on: a solid lift off the window and a hairline edge. */
export function UsagePanel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("relative min-w-0 rounded-xl p-5 usage-card ", className)} {...props} />
  );
}
