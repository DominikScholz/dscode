import { getThreadSortTimestamp } from "@t3tools/client-runtime/state/thread-sort";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

import type { SidebarThreadSummary } from "../../types";
import { filterSidebarV2VisibleThreads, isSidebarThreadWorking } from "../Sidebar.logic";

export interface DashboardProject<TGroup> {
  group: TGroup;
  working: number;
  active: number;
  settled: number;
  /** When the user last wrote in any of the project's threads, as the sidebar sorts. */
  lastActivityMs: number | null;
}

/**
 * Counts each project's threads by the sidebar's sections and splits off
 * projects whose threads are all settled; projects without threads count as
 * settled. Settlement matches the sidebar: only environments that support it
 * settle, and snoozed or pinned threads are still active. Each part lists the
 * most recently active projects first; ties keep the incoming order.
 */
export function summarizeDashboardProjects<
  TGroup extends {
    memberProjects: ReadonlyArray<{ environmentId: EnvironmentId; id: ProjectId }>;
  },
>(input: {
  groups: ReadonlyArray<TGroup>;
  threads: ReadonlyArray<SidebarThreadSummary>;
  supportsSettlement: (environmentId: EnvironmentId) => boolean;
}): { open: DashboardProject<TGroup>[]; allSettled: DashboardProject<TGroup>[] } {
  const threadsByProject = new Map<string, SidebarThreadSummary[]>();
  for (const thread of filterSidebarV2VisibleThreads(input.threads, null)) {
    const key = `${thread.environmentId}:${thread.projectId}`;
    const threads = threadsByProject.get(key);
    if (threads) threads.push(thread);
    else threadsByProject.set(key, [thread]);
  }
  const open: DashboardProject<TGroup>[] = [];
  const allSettled: DashboardProject<TGroup>[] = [];
  for (const group of input.groups) {
    const project: DashboardProject<TGroup> = {
      group,
      working: 0,
      active: 0,
      settled: 0,
      lastActivityMs: null,
    };
    for (const member of group.memberProjects) {
      for (const thread of threadsByProject.get(`${member.environmentId}:${member.id}`) ?? []) {
        if (
          input.supportsSettlement(thread.environmentId) &&
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
    (project.working + project.active > 0 ? open : allSettled).push(project);
  }
  return { open: open.sort(compareByRecency), allSettled: allSettled.sort(compareByRecency) };
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
