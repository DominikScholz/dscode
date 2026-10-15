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

import { usePullRequestsSupported } from "../../state/environments";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { Toggle } from "../ui/toggle";
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
          <Toggle
            variant="ghost"
            size="sm"
            pressed={props.active === true}
            disabled={props.disabled}
            aria-label={props.label}
            aria-current={props.active ? "page" : undefined}
            onClick={props.onClick}
          />
        }
      >
        {props.icon}
      </TooltipTrigger>
      <TooltipPopup side="right">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

/** Slim app-level navigation left of the thread sidebar. Desktop only; the
 * mobile sheet keeps these destinations in its footer. */
export const AppRail = memo(function AppRail() {
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const pathname = useLocation({ select: (location) => location.pathname });
  const pullRequestsSupported = usePullRequestsSupported();
  const onSettings = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <nav
      aria-label="App"
      className="relative z-20 hidden w-(--app-rail-width) shrink-0 flex-col items-center gap-1 bg-sidebar pt-(--workspace-topbar-height) pb-2 md:flex"
    >
      <AppRailItem icon={<SquaresFourIcon />} label="Dashboard (coming soon)" disabled />
      <AppRailItem
        icon={<ChatsCircleIcon />}
        label="Chats"
        active={!isSidebarUtilityPage(pathname)}
        onClick={() => void navigateToMainApp()}
      />
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
      <AppRailItem
        icon={<ChartBarIcon />}
        label="Usage & limits"
        active={pathname === "/usage"}
        onClick={() => void navigate({ to: "/usage" })}
      />
      <div className="mt-auto">
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
