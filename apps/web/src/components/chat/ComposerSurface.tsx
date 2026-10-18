import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

function Shell({
  contextStrip = false,
  className,
  ...props
}: ComponentProps<"div"> & { contextStrip?: boolean }) {
  return (
    <div
      data-slot="composer-shell"
      data-with-context={contextStrip || undefined}
      className={cn(
        "@container/composer-surface group/composer-surface relative isolate mx-auto w-full max-w-(--chat-content-max-width)",
        // The shared panel surface (see --panel-surface in index.css).
        "[--chat-composer-drawer-inset:1.375rem] [--chat-composer-glass-surface:var(--panel-surface)] [--chat-composer-outline:var(--panel-edge)] [--chat-composer-highlight:transparent]",
        "before:pointer-events-none before:absolute before:inset-0 before:z-0 before:rounded-3xl before:squircle before:bg-(--chat-composer-glass-surface)/(--glass-opacity) before:bg-(image:--panel-sheen) before:backdrop-blur-(--glass-blur) before:backdrop-saturate-(--glass-saturation)",
        "not-supports-[((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:before:bg-(--chat-composer-glass-surface)",
        "has-data-[composer-banner-surface=attached]:before:hidden data-model-strip-transition:before:hidden",
        contextStrip && [
          "[--chat-composer-context-extension:2.25rem] sm:[--chat-composer-context-extension:2rem]",
          // One continuous backdrop under the composer and the strip. The top
          // corners keep the composer's own radius; the path draws the rest with
          // the same radii as the outlines (rounded-3xl, rounded-2xl). Its curves
          // follow squircle corners where the browser draws them, else round ones.
          "[--chat-composer-radius:calc(var(--radius)+12px)] [--chat-composer-strip-radius:calc(var(--radius)+8px)] [--chat-composer-corner-control:0.4477] supports-[corner-shape:squircle]:[--chat-composer-corner-control:0.081]",
          "before:[clip-path:shape(from_0_0,line_to_100%_0,line_to_100%_calc(100%-var(--chat-composer-context-extension)-var(--chat-composer-radius)),curve_to_calc(100%-var(--chat-composer-radius))_calc(100%-var(--chat-composer-context-extension))_with_100%_calc(100%-var(--chat-composer-context-extension)-var(--chat-composer-radius)*var(--chat-composer-corner-control))/calc(100%-var(--chat-composer-radius)*var(--chat-composer-corner-control))_calc(100%-var(--chat-composer-context-extension)),line_to_calc(100%-var(--chat-composer-drawer-inset))_calc(100%-var(--chat-composer-context-extension)),line_to_calc(100%-var(--chat-composer-drawer-inset))_calc(100%-var(--chat-composer-strip-radius)),curve_to_calc(100%-var(--chat-composer-drawer-inset)-var(--chat-composer-strip-radius))_100%_with_calc(100%-var(--chat-composer-drawer-inset))_calc(100%-var(--chat-composer-strip-radius)*var(--chat-composer-corner-control))/calc(100%-var(--chat-composer-drawer-inset)-var(--chat-composer-strip-radius)*var(--chat-composer-corner-control))_100%,line_to_calc(var(--chat-composer-drawer-inset)+var(--chat-composer-strip-radius))_100%,curve_to_var(--chat-composer-drawer-inset)_calc(100%-var(--chat-composer-strip-radius))_with_calc(var(--chat-composer-drawer-inset)+var(--chat-composer-strip-radius)*var(--chat-composer-corner-control))_100%/var(--chat-composer-drawer-inset)_calc(100%-var(--chat-composer-strip-radius)*var(--chat-composer-corner-control)),line_to_var(--chat-composer-drawer-inset)_calc(100%-var(--chat-composer-context-extension)),line_to_var(--chat-composer-radius)_calc(100%-var(--chat-composer-context-extension)),curve_to_0_calc(100%-var(--chat-composer-context-extension)-var(--chat-composer-radius))_with_calc(var(--chat-composer-radius)*var(--chat-composer-corner-control))_calc(100%-var(--chat-composer-context-extension))/0_calc(100%-var(--chat-composer-context-extension)-var(--chat-composer-radius)*var(--chat-composer-corner-control)),close)]",
          "not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:bottom-(--chat-composer-context-extension)",
        ],
        className,
      )}
      {...props}
    />
  );
}

const outlineClasses =
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:squircle after:panel-edge-ring dark:after:inset-shadow-2xs dark:after:inset-shadow-(color:--chat-composer-highlight)";

const contextSeamClasses =
  "group-data-with-context/composer-surface:after:[clip-path:polygon(0_0,100%_0,100%_100%,calc(100%-22px)_100%,calc(100%-22px)_calc(100%-2px),22px_calc(100%-2px),22px_100%,0_100%)]";

/** Frames the input while leaving the shared edge open for the context strip's outline. */
function Host({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-host"
      className={cn(
        "relative z-10 w-full rounded-3xl shadow-(--panel-drop) squircle after:z-1",
        outlineClasses,
        contextSeamClasses,
        "group-has-data-[composer-banner-surface=attached]/composer-surface:shadow-none group-has-data-[composer-banner-surface=attached]/composer-surface:after:hidden",
        className,
      )}
      {...props}
    />
  );
}

/** Covers the input surface when an attached banner or the model strip transition replaces the outer glass backdrop. */
function Main({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-chat-composer-main-surface="true"
      className={cn(
        "group relative z-10 rounded-3xl squircle p-px",
        "group-data-model-strip-transition/composer-surface:bg-(--chat-composer-glass-surface)/(--glass-opacity) group-data-model-strip-transition/composer-surface:backdrop-blur-(--glass-blur) group-data-model-strip-transition/composer-surface:backdrop-saturate-(--glass-saturation)",
        outlineClasses,
        contextSeamClasses,
        "after:z-20 after:hidden group-has-data-[composer-banner-surface=attached]/composer-surface:after:block group-data-model-strip-transition/composer-surface:after:block",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:bg-(--chat-composer-glass-surface)/(--glass-opacity) group-has-data-[composer-banner-surface=attached]/composer-surface:backdrop-blur-(--glass-blur) group-has-data-[composer-banner-surface=attached]/composer-surface:backdrop-saturate-(--glass-saturation)",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:shadow-composer dark:group-has-data-[composer-banner-surface=attached]/composer-surface:shadow-none",
        "not-supports-[((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:group-has-data-[composer-banner-surface=attached]/composer-surface:bg-(--chat-composer-glass-surface)",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:**:data-[chat-composer-mobile-collapsed=true]:min-h-[calc(1rem+1px)]",
        className,
      )}
      {...props}
    />
  );
}

/** Extends the composer outline below the input, masking its overlap up to one pixel above the shared edge so no seam shows. */
function ContextStrip({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-context-strip"
      className={cn(
        "group/composer-context relative isolate mx-auto -mt-4 flex w-[calc(100%-2*var(--chat-composer-drawer-inset))] items-center gap-2 overflow-x-clip overflow-y-visible px-2 pt-5 pb-1",
        // The strip continues the composer's edge; its top fades into the seam.
        "before:absolute before:inset-0 before:-z-1 before:rounded-b-2xl before:squircle before:border before:border-(--chat-composer-outline) before:shadow-(--panel-drop) before:mask-b-from-transparent before:mask-b-from-(length:--spacing-composer-seam) before:mask-b-to-black before:mask-b-to-(length:--spacing-composer-seam)",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:before:bg-(--chat-composer-glass-surface)/(--glass-opacity) group-has-data-[composer-banner-surface=attached]/composer-surface:before:backdrop-blur-(--glass-blur) group-has-data-[composer-banner-surface=attached]/composer-surface:before:backdrop-saturate-(--glass-saturation)",
        "not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:bg-(--chat-composer-glass-surface)/(--glass-opacity) not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:backdrop-blur-(--glass-blur) not-supports-[clip-path:shape(from_0_0,line_to_1px_1px)]:before:backdrop-saturate-(--glass-saturation)",
        className,
      )}
      {...props}
    />
  );
}

export const ComposerSurface = { Shell, Host, Main, ContextStrip };
