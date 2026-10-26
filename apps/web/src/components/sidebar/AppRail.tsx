import {
  ChartBarIcon,
  ChatsCircleIcon,
  GearIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import * as Schema from "effect/Schema";
import type { ReactNode } from "react";
import { memo, useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { useLocalStorage } from "../../hooks/useLocalStorage";
import { cn } from "../../lib/utils";
import { usePullRequestsSupported } from "../../state/environments";
import { useOpenProjectGraph } from "../project-graph/projectGraphNavigation";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { isAppModalPage, isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";

// Redesign exploration: app navigation as a slim rail left of the sidebar, or
// as a menu at the top of the sidebar, where the bottom-up thread list leaves room.
const APP_NAV_VARIANT_KEY = "t3code:redesign:app-nav";
const AppNavVariant = Schema.Literals(["rail", "seamless", "menu"]);
const isAppNavVariant = Schema.is(AppNavVariant);

/**
 * `?nav=seamless` (the default: a rail on the canvas color, without separation),
 * `?nav=rail` or `?nav=menu` picks the variant, which then sticks across navigation.
 */
export function useAppNavVariant() {
  const [storedVariant, setStoredVariant] = useLocalStorage(
    APP_NAV_VARIANT_KEY,
    "seamless",
    AppNavVariant,
  );
  const requested = useLocation({
    select: (location) => new URLSearchParams(location.searchStr).get("nav"),
  });
  const requestedVariant = isAppNavVariant(requested) ? requested : null;
  useEffect(() => {
    if (requestedVariant) setStoredVariant(requestedVariant);
  }, [requestedVariant, setStoredVariant]);
  return requestedVariant ?? storedVariant;
}

interface AppNavItem {
  key: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function useAppNavItems(): { primary: AppNavItem[]; secondary: AppNavItem[] } {
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const pathname = useLocation({ select: (location) => location.pathname });
  const pullRequestsSupported = usePullRequestsSupported();
  const openProjectGraph = useOpenProjectGraph();

  const primary: AppNavItem[] = [
    {
      key: "chats",
      icon: <ChatsCircleIcon />,
      label: "Chats",
      active: !isSidebarUtilityPage(pathname) && !isAppModalPage(pathname),
      onClick: () => void navigateToMainApp(),
    },
    {
      key: "dashboard",
      icon: <SquaresFourIcon />,
      label: "Dashboard",
      active: pathname === "/dashboard",
      onClick: () => void navigate({ to: "/dashboard" }),
    },
    {
      key: "project-graph",
      icon: <GitBranchIcon />,
      label: "Project graph",
      active: pathname.startsWith("/project-graph/"),
      onClick: openProjectGraph,
    },
  ];
  if (pullRequestsSupported) {
    primary.push({
      key: "pull-requests",
      icon: <GitPullRequestIcon />,
      label: "Pull Requests",
      active: pathname === "/pull-requests",
      onClick: () =>
        void navigate({ to: "/pull-requests", search: readPullRequestListPreferences() }),
    });
  }
  const secondary: AppNavItem[] = [
    {
      key: "usage",
      icon: <ChartBarIcon />,
      label: "Usage & limits",
      active: pathname === "/usage",
      onClick: () => void navigate({ to: "/usage" }),
    },
    {
      key: "settings",
      icon: <GearIcon />,
      label: "Settings",
      active: pathname === "/settings" || pathname.startsWith("/settings/"),
      onClick: () => void navigate({ to: "/settings" }),
    },
  ];
  return { primary, secondary };
}

function AppRailItem({ item }: { item: AppNavItem }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={item.label}
            aria-current={item.active ? "page" : undefined}
            onClick={item.onClick}
            className={cn(
              "flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&_svg]:size-[18px]",
              item.active
                ? "relative bg-(--panel-surface) text-foreground panel-edge"
                : "hover:bg-(--panel-surface) hover:text-foreground",
            )}
          />
        }
      >
        {item.icon}
      </TooltipTrigger>
      <TooltipPopup side="right">{item.label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * Slim app-level navigation left of the thread sidebar. Desktop only; the
 * mobile sheet keeps these destinations in its footer. The bottom pair lines
 * up with the two rows of the sidebar dock beside it.
 */
export const AppRail = memo(function AppRail({ seamless }: { seamless: boolean }) {
  const { primary, secondary } = useAppNavItems();

  return (
    <nav
      aria-label="App"
      className={cn(
        "relative z-20 hidden w-(--app-rail-width) shrink-0 flex-col gap-1 pt-(--workspace-topbar-height) pb-5 md:flex",
        // Without a visible edge the icons hug the sidebar, so the gap to the
        // thread cards matches the gap to the window edge. The canvas fill is
        // still opaque: a collapsed sidebar tucks its edge under the rail.
        seamless ? "items-end bg-background surface-grain" : "items-center",
        !seamless &&
          "bg-(--rail-surface) surface-grain shadow-(--rail-shadow) after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-(image:--rail-edge)",
      )}
    >
      {primary.map((item) => (
        <AppRailItem key={item.key} item={item} />
      ))}
      <div className="mt-auto flex flex-col items-center gap-2">
        {secondary.map((item) => (
          <AppRailItem key={item.key} item={item} />
        ))}
      </div>
    </nav>
  );
});

function SidebarNavMenuItem({ item }: { item: AppNavItem }) {
  return (
    <button
      type="button"
      aria-current={item.active ? "page" : undefined}
      onClick={item.onClick}
      className={cn(
        "flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0",
        item.active
          ? "relative bg-(--panel-surface) text-foreground panel-edge"
          : "text-muted-foreground hover:bg-(--panel-surface) hover:text-foreground",
      )}
    >
      {item.icon}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </button>
  );
}

/** The app navigation as a menu under the sidebar brand (the "menu" variant). */
export const SidebarNavMenu = memo(function SidebarNavMenu() {
  const { primary, secondary } = useAppNavItems();

  return (
    <nav aria-label="App" className="mx-3 mt-1 mb-3 hidden shrink-0 flex-col gap-0.5 md:flex">
      {primary.map((item) => (
        <SidebarNavMenuItem key={item.key} item={item} />
      ))}
      <div className="mx-2.5 my-1.5 h-px bg-(--panel-edge)" />
      {secondary.map((item) => (
        <SidebarNavMenuItem key={item.key} item={item} />
      ))}
    </nav>
  );
});
