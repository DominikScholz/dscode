import {
  ChartBarIcon,
  ChatsCircleIcon,
  GearIcon,
  GitPullRequestIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { memo } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { cn } from "../../lib/utils";
import { usePullRequestsSupported } from "../../state/environments";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { T3Wordmark } from "../T3Wordmark";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";

function AppRailItem(props: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={props.label}
            aria-current={props.active ? "page" : undefined}
            disabled={props.disabled}
            onClick={props.onClick}
            className={cn(
              "flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none squircle transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[17px]",
              props.active
                ? "relative bg-(--panel-surface-active) text-foreground shadow-(--panel-drop) panel-edge"
                : "hover:bg-(--panel-surface) hover:text-foreground",
            )}
          />
        }
      >
        {props.icon}
      </TooltipTrigger>
      <TooltipPopup side="right">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * Slim app-level navigation left of the thread sidebar. Desktop only; the
 * mobile sheet keeps these destinations in its footer. The bottom pair lines
 * up with the two rows of the sidebar dock beside it.
 */
export const AppRail = memo(function AppRail() {
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const pathname = useLocation({ select: (location) => location.pathname });
  const pullRequestsSupported = usePullRequestsSupported();
  const onSettings = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <nav
      aria-label="App"
      className="relative z-20 hidden w-(--app-rail-width) shrink-0 flex-col items-center gap-1.5 border-r border-(--rail-border) bg-(--rail-surface) pt-(--workspace-topbar-height) shadow-(--rail-shadow) pb-6 md:flex"
    >
      {/* The app's mark: the black T3 tile, raised like the other ornaments. */}
      <div
        role="img"
        aria-label="T3 Code"
        className="relative mb-3 flex size-8 shrink-0 items-center justify-center rounded-lg bg-black text-white shadow-(--panel-drop) panel-edge squircle"
      >
        <T3Wordmark aria-hidden className="h-2.5 w-auto" />
      </div>
      <AppRailItem
        icon={<ChatsCircleIcon />}
        label="Chats"
        active={!isSidebarUtilityPage(pathname)}
        onClick={() => void navigateToMainApp()}
      />
      <AppRailItem icon={<SquaresFourIcon />} label="Dashboard (coming soon)" disabled />
      {pullRequestsSupported ? (
        <AppRailItem
          icon={<GitPullRequestIcon />}
          label="Pull Requests"
          active={pathname === "/pull-requests"}
          onClick={() =>
            void navigate({ to: "/pull-requests", search: readPullRequestListPreferences() })
          }
        />
      ) : null}
      <div className="mt-auto flex flex-col items-center gap-1">
        <AppRailItem
          icon={<ChartBarIcon />}
          label="Usage & limits"
          active={pathname === "/usage"}
          onClick={() => void navigate({ to: "/usage" })}
        />
        <AppRailItem
          icon={<GearIcon />}
          label="Settings"
          active={onSettings}
          onClick={() => void navigate({ to: "/settings" })}
        />
      </div>
    </nav>
  );
});
