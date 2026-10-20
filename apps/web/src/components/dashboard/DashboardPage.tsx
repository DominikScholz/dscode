import {
  ArchiveIcon,
  ChatsCircleIcon,
  ClockCountdownIcon,
  HammerIcon,
  type Icon,
} from "@phosphor-icons/react";
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
import { selectSectionFilter } from "../Sidebar.logic";
import { useSettingsProjectGroups } from "../settings/useSettingsProjectGroups";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  type DashboardProject,
  type DashboardSection,
  summarizeDashboardProjects,
} from "./dashboardProjects";

// Icons match the sidebar's section filters.
const DASHBOARD_SECTIONS: ReadonlyArray<{
  section: DashboardSection;
  label: string;
  icon: Icon;
}> = [
  { section: "active", label: "Active", icon: ChatsCircleIcon },
  { section: "working", label: "Working", icon: HammerIcon },
  { section: "snoozed", label: "Snoozed", icon: ClockCountdownIcon },
  { section: "settled", label: "Settled", icon: ArchiveIcon },
];
const DASHBOARD_SECTION_FILTER_KEY = "t3code:dashboard:section-filter";
const DashboardSectionFilter = Schema.Array(
  Schema.Literals(["active", "working", "snoozed", "settled"]),
);
const DEFAULT_DASHBOARD_SECTION_FILTER: readonly DashboardSection[] = [
  "active",
  "working",
  "snoozed",
  "settled",
];

export function DashboardPage() {
  useEscapeToGoBack();
  // Scratch threads have no repository to graph.
  const groups = useSettingsProjectGroups().filter((group) => !group.isScratch);
  const threads = useThreadShells();
  const serverConfigs = useServerConfigs();
  const projectsReady = useAllEnvironmentProjectSnapshotsReady();
  const [sectionFilter, setSectionFilter] = useLocalStorage(
    DASHBOARD_SECTION_FILTER_KEY,
    DEFAULT_DASHBOARD_SECTION_FILTER,
    DashboardSectionFilter,
  );
  // Snooze wake times are compared against this minute, so a woken thread can
  // count as snoozed for up to a minute; the sidebar is exact.
  const nowMinute = useNowMinute();
  const sections = summarizeDashboardProjects({
    groups,
    threads,
    capabilities: (environmentId) => serverConfigs.get(environmentId)?.environment.capabilities,
    now: `${nowMinute}:00.000Z`,
  });
  const shownSections = DASHBOARD_SECTIONS.filter(
    ({ section }) => sectionFilter.includes(section) && sections[section].length > 0,
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {/* Keeps the window drag strip and the collapsed-sidebar toggle's room. */}
        <WorkspacePageHeader electron={isElectron} />
        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 pb-5 pl-(--workspace-gutter-start) pr-(--workspace-gutter-end)">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Dashboard</h1>
          {groups.length > 0 ? (
            <DashboardSectionFilterBar
              selected={sectionFilter}
              counts={sections}
              onSelect={(section, additive) =>
                setSectionFilter((current) => selectSectionFilter(current, section, additive))
              }
            />
          ) : null}
        </div>
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
            <div className="flex flex-col gap-6 pb-12 pl-(--workspace-gutter-start) pr-(--workspace-gutter-end)">
              {shownSections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects here.</p>
              ) : null}
              {shownSections.map(({ section, label, icon: SectionIcon }) => (
                <section key={section} aria-label={label} className="flex flex-col gap-2">
                  {/* With one section shown, the pressed filter already names it. */}
                  {shownSections.length > 1 ? (
                    <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
                      <SectionIcon aria-hidden />
                      {label}
                    </h2>
                  ) : null}
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2">
                    {sections[section].map((project) => (
                      <li key={project.group.projectKey} className="min-w-0">
                        <ProjectCard project={project} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </SidebarInset>
  );
}

// The sidebar's section filter, with names since the page has room: a click
// shows one section, shift+click adds or removes one.
function DashboardSectionFilterBar(props: {
  selected: readonly DashboardSection[];
  counts: Record<DashboardSection, ReadonlyArray<unknown>>;
  onSelect: (section: DashboardSection, additive: boolean) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Project sections (shift-click to show several)"
      className="flex shrink-0 gap-0.5 rounded-lg p-0.5 panel-well"
    >
      {DASHBOARD_SECTIONS.map(({ section, label, icon: SectionIcon }) => {
        const pressed = props.selected.includes(section);
        return (
          <button
            key={section}
            type="button"
            aria-pressed={pressed}
            onClick={(event) => props.onSelect(section, event.shiftKey)}
            className={cn(
              "flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none squircle transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&_svg]:size-3.5",
              pressed
                ? "relative bg-(--panel-surface-active) text-foreground shadow-(--panel-drop) panel-edge"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <SectionIcon aria-hidden />
            {label}
            <span className="text-muted-foreground tabular-nums">
              {props.counts[section].length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ProjectCard({
  project: { group, working, active, snoozed, settled, lastActivityMs },
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
        <ThreadCounts working={working} active={active} snoozed={snoozed} settled={settled} />
      </div>
    </Link>
  );
}

// Icons match the sidebar's section filters.
function ThreadCounts(props: {
  working: number;
  active: number;
  snoozed: number;
  settled: number;
}) {
  const counts = [
    { label: "working", count: props.working, icon: HammerIcon, className: "text-info" },
    { label: "active", count: props.active, icon: ChatsCircleIcon },
    { label: "snoozed", count: props.snoozed, icon: ClockCountdownIcon },
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
