import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import { getThreadSortTimestamp } from "@t3tools/client-runtime/state/thread-sort";
import type {
  EnvironmentId,
  ExecutionEnvironmentCapabilities,
  ProjectId,
} from "@t3tools/contracts";

import type { SidebarThreadSummary } from "../../types";
import { filterSidebarV2VisibleThreads, isSidebarThreadWorking } from "../Sidebar.logic";

export type DashboardSection = "active" | "working" | "snoozed" | "settled";

export interface DashboardProject<TGroup> {
  group: TGroup;
  working: number;
  active: number;
  snoozed: number;
  settled: number;
  /** When the user last wrote in any of the project's threads, as the sidebar sorts. */
  lastActivityMs: number | null;
}

/**
 * Files each project under its first non-empty sidebar section (active, working,
 * snoozed, settled; settled also takes empty projects), using the sidebar's own
 * section rules. Sections list the most recently active projects first.
 */
export function summarizeDashboardProjects<
  TGroup extends {
    memberProjects: ReadonlyArray<{ environmentId: EnvironmentId; id: ProjectId }>;
  },
>(input: {
  groups: ReadonlyArray<TGroup>;
  threads: ReadonlyArray<SidebarThreadSummary>;
  capabilities: (
    environmentId: EnvironmentId,
  ) => Pick<ExecutionEnvironmentCapabilities, "threadSettlement" | "threadSnooze"> | undefined;
  now: string;
}): Record<DashboardSection, DashboardProject<TGroup>[]> {
  const threadsByProject = new Map<string, SidebarThreadSummary[]>();
  for (const thread of filterSidebarV2VisibleThreads(input.threads, null)) {
    const key = `${thread.environmentId}:${thread.projectId}`;
    const threads = threadsByProject.get(key);
    if (threads) threads.push(thread);
    else threadsByProject.set(key, [thread]);
  }
  const sections: Record<DashboardSection, DashboardProject<TGroup>[]> = {
    active: [],
    working: [],
    snoozed: [],
    settled: [],
  };
  for (const group of input.groups) {
    const project: DashboardProject<TGroup> = {
      group,
      working: 0,
      active: 0,
      snoozed: 0,
      settled: 0,
      lastActivityMs: null,
    };
    for (const member of group.memberProjects) {
      for (const thread of threadsByProject.get(`${member.environmentId}:${member.id}`) ?? []) {
        const capabilities = input.capabilities(thread.environmentId);
        if (capabilities?.threadSnooze === true && effectiveSnoozed(thread, { now: input.now })) {
          project.snoozed += 1;
        } else if (
          capabilities?.threadSettlement === true &&
          thread.settledOverride === "settled"
        ) {
          project.settled += 1;
        } else if (isSidebarThreadWorking(thread)) {
          project.working += 1;
        } else {
          project.active += 1;
        }
        const activityMs = getThreadSortTimestamp(thread, "updated_at");
        if (Number.isFinite(activityMs)) {
          project.lastActivityMs = Math.max(project.lastActivityMs ?? activityMs, activityMs);
        }
      }
    }
    sections[
      project.active > 0
        ? "active"
        : project.working > 0
          ? "working"
          : project.snoozed > 0
            ? "snoozed"
            : "settled"
    ].push(project);
  }
  for (const projects of Object.values(sections)) projects.sort(compareByRecency);
  return sections;
}

function compareByRecency(
  left: Pick<DashboardProject<unknown>, "lastActivityMs">,
  right: Pick<DashboardProject<unknown>, "lastActivityMs">,
): number {
  if (left.lastActivityMs === right.lastActivityMs) return 0;
  if (left.lastActivityMs === null) return 1;
  if (right.lastActivityMs === null) return -1;
  return right.lastActivityMs - left.lastActivityMs;
}
