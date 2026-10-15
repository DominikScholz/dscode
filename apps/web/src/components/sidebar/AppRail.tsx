import {
  ChartBarIcon,
  ChatsCircleIcon,
  GearIcon,
  GitPullRequestIcon,
  LayoutIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { memo } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import { cn } from "../../lib/utils";
import { usePullRequestsSupported } from "../../state/environments";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import {
  THREAD_ARRANGEMENTS,
  THREAD_ARRANGEMENT_LABELS,
  type ThreadArrangement,
  useThreadArrangement,
} from "../chat/threadArrangement";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";

/** The rail's own button: a squircle that fills on hover and for the current page. */
function AppRailButton({
  active = false,
  className,
  ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex size-9 cursor-pointer items-center justify-center rounded-xl text-muted-foreground outline-none squircle transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[18px]",
        active
          ? "relative bg-(--panel-surface-active) text-foreground shadow-(--panel-drop) panel-edge"
          : "hover:bg-(--panel-surface) hover:text-foreground data-popup-open:bg-(--panel-surface) data-popup-open:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

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
          <AppRailButton
            active={props.active === true}
            disabled={props.disabled === true}
            aria-label={props.label}
            {...(props.onClick ? { onClick: props.onClick } : {})}
          />
        }
      >
        {props.icon}
      </TooltipTrigger>
      <TooltipPopup side="right">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

/** Where a thread's workspace context and actions live (see threadArrangement). */
function ThreadArrangementMenu() {
  const [threadArrangement, setThreadArrangement] = useThreadArrangement();
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={<MenuTrigger render={<AppRailButton aria-label="Thread layout" />} />}
        >
          <LayoutIcon />
        </TooltipTrigger>
        <TooltipPopup side="right">Thread layout</TooltipPopup>
      </Tooltip>
      <MenuPopup side="right" align="end">
        <MenuGroup>
          <MenuGroupLabel>Thread layout</MenuGroupLabel>
          <MenuRadioGroup
            value={threadArrangement}
            onValueChange={(value) => setThreadArrangement(value as ThreadArrangement)}
          >
            {THREAD_ARRANGEMENTS.map((arrangement) => (
              <MenuRadioItem key={arrangement} value={arrangement}>
                {THREAD_ARRANGEMENT_LABELS[arrangement]}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
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
      className="relative z-20 hidden w-(--app-rail-width) shrink-0 flex-col items-center gap-1 bg-sidebar pt-(--workspace-topbar-height) pb-3 md:flex"
    >
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
        <ThreadArrangementMenu />
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
