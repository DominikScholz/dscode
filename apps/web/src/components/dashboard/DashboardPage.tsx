import { ArchiveIcon, ChatsCircleIcon, HammerIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import * as Schema from "effect/Schema";

import { isElectron } from "../../env";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useEscapeToGoBack } from "../../hooks/useNavigateBack";
import { useNowMinute } from "../../hooks/useNowMinute";
import { cn } from "../../lib/utils";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import {
  useAllEnvironmentProjectSnapshotsReady,
  useServerConfigs,
  useThreadShells,
} from "../../state/entities";
import { formatRelativeElapsed } from "../../timestampFormat";
import { ProjectFavicon } from "../ProjectFavicon";
import { useSettingsProjectGroups } from "../settings/useSettingsProjectGroups";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { type DashboardProject, summarizeDashboardProjects } from "./dashboardProjects";

export function DashboardPage() {
  useEscapeToGoBack();
  // Scratch threads have no repository to graph.
  const groups = useSettingsProjectGroups().filter((group) => !group.isScratch);
  const threads = useThreadShells();
  const serverConfigs = useServerConfigs();
  const projectsReady = useAllEnvironmentProjectSnapshotsReady();
  const { open, allSettled } = summarizeDashboardProjects({
    groups,
    threads,
    supportsSettlement: (environmentId) =>
      serverConfigs.get(environmentId)?.environment.capabilities.threadSettlement === true,
  });

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {/* Keeps the window drag strip and the collapsed-sidebar toggle's room. */}
        <WorkspacePageHeader electron={isElectron} />
        <h1 className="shrink-0 pb-4 pl-(--workspace-gutter-start) pr-(--workspace-gutter-end) text-2xl font-semibold tracking-tight sm:text-3xl">
          Dashboard
        </h1>
        {groups.length === 0 ? (
          // A pending environment cannot prove the workspace is empty.
          projectsReady ? (
            <Empty className="flex-1">
              <EmptyHeader>
                <EmptyTitle>No projects yet</EmptyTitle>
                <EmptyDescription>Add a project to see it here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 pb-12 pl-(--workspace-gutter-start) pr-(--workspace-gutter-end)">
              {open.length > 0 ? (
                <ProjectSection id="active" title="Active" projects={open} />
              ) : null}
              {allSettled.length > 0 ? (
                <ProjectSection id="settled" title="Settled" projects={allSettled} />
              ) : null}
            </div>
          </ScrollArea>
        )}
      </div>
    </SidebarInset>
  );
}

function ProjectSection({
  id,
  title,
  projects,
}: {
  id: "active" | "settled";
  title: string;
  projects: ReadonlyArray<DashboardProject<SidebarProjectSnapshot>>;
}) {
  const [collapsed, setCollapsed] = useLocalStorage(
    `t3code.dashboard.${id}Collapsed`,
    false,
    Schema.Boolean,
  );
  return (
    <section className="flex flex-col gap-2">
      <h2>
        <CollapsibleSectionHeader expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          {title} <span className="tabular-nums">{projects.length}</span>
        </CollapsibleSectionHeader>
      </h2>
      {collapsed ? null : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2">
          {projects.map((project) => (
            <li key={project.group.projectKey} className="min-w-0">
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectCard({
  project: { group, working, active, settled, lastActivityMs },
}: {
  project: DashboardProject<SidebarProjectSnapshot>;
}) {
  return (
    <Link
      to="/project-graph/$projectKey"
      params={{ projectKey: group.projectKey }}
      className="flex items-center gap-3 rounded-xl bg-(--row-surface) px-3 py-2.5 outline-none squircle transition-colors hover:bg-(--row-surface-hover) focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <ProjectFavicon project={group} className="size-8 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {group.displayName}
          </span>
          {lastActivityMs === null ? null : (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              <LastActivityLabel timestampMs={lastActivityMs} />
            </span>
          )}
        </div>
        <ThreadCounts working={working} active={active} settled={settled} />
      </div>
    </Link>
  );
}

// Icons match the sidebar's section filters.
function ThreadCounts(props: { working: number; active: number; settled: number }) {
  const counts = [
    { label: "working", count: props.working, icon: HammerIcon, className: "text-info" },
    { label: "active", count: props.active, icon: ChatsCircleIcon },
    { label: "settled", count: props.settled, icon: ArchiveIcon },
  ].filter((entry) => entry.count > 0);
  const row = "flex h-4 items-center gap-2.5 text-xs text-muted-foreground tabular-nums";
  if (counts.length === 0) return <span className={row}>No threads</span>;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn(row, "self-start")} />}>
        {counts.map(({ label, count, icon: CountIcon, className }) => (
          <span key={label} className={cn("inline-flex items-center gap-1", className)}>
            <CountIcon aria-hidden className="size-3.5" />
            {count}
            <span className="sr-only"> {label}</span>
          </span>
        ))}
      </TooltipTrigger>
      <TooltipPopup>
        {counts.map(({ label, count }) => `${count} ${label}`).join(" · ")}
      </TooltipPopup>
    </Tooltip>
  );
}

// Subscribes to the minute tick itself, so only the label re-renders each minute.
// Compact like the sidebar's thread times.
function LastActivityLabel(props: { timestampMs: number }) {
  const nowMinute = useNowMinute();
  const elapsed = formatRelativeElapsed(
    Math.max(0, Date.parse(`${nowMinute}:00.000Z`) - props.timestampMs),
  );
  return <>{elapsed.value === "just now" ? "now" : elapsed.value}</>;
}
