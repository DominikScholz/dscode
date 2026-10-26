import {
  type OrchestrationProjectShell,
  type OrchestrationV2ThreadShell,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { advanceAwayClock, planDailyDigests } from "./dailyDigestPlan.ts";

const HOUR_MS = 60 * 60 * 1_000;
const NOW_MS = Date.parse("2026-10-26T08:00:00.000Z");
const at = (hoursAgo: number) => DateTime.makeUnsafe(NOW_MS - hoursAgo * HOUR_MS);

const project = (id: string): OrchestrationProjectShell => ({
  id: ProjectId.make(id),
  title: id,
  workspaceRoot: `/work/${id}`,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const thread = (
  id: string,
  projectId: string,
  fields: Partial<OrchestrationV2ThreadShell> = {},
): OrchestrationV2ThreadShell => ({
  id: ThreadId.make(id),
  projectId: ProjectId.make(projectId),
  title: id,
  providerInstanceId: ProviderInstanceId.make("codex"),
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  activeProviderThreadId: null,
  lineage: { rootThreadId: ThreadId.make(id), parentThreadId: null, relationshipToParent: null },
  forkedFrom: null,
  createdBy: "user",
  creationSource: "web",
  latestRunId: null,
  activeRunId: null,
  status: "idle",
  pendingRuntimeRequest: null,
  latestVisibleMessage: null,
  latestUserMessageAt: null,
  hasActionableProposedPlan: false,
  itemCount: 0,
  visibleItemCount: 0,
  createdAt: at(100),
  updatedAt: at(100),
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  lastVisitedAt: null,
  deletedAt: null,
  ...fields,
});

describe("planDailyDigests", () => {
  it("starts each window at the project's last digest, or a day back without one", () => {
    const [withDigest, withoutDigest] = planDailyDigests({
      projects: [project("a"), project("b")],
      threads: [
        thread("old-digest", "a", { digest: true, createdAt: at(50) }),
        thread("last-digest", "a", { digest: true, createdAt: at(30), archivedAt: at(20) }),
      ],
      nowMs: NOW_MS,
    });
    expect(withDigest?.sinceMs).toBe(NOW_MS - 30 * HOUR_MS);
    expect(withoutDigest?.sinceMs).toBe(NOW_MS - 24 * HOUR_MS);
  });

  it("lists threads active in the window, newest first, without digests or subagents", () => {
    const [candidate] = planDailyDigests({
      projects: [project("a")],
      threads: [
        thread("before", "a", { latestUserMessageAt: at(30) }),
        thread("asked", "a", { latestUserMessageAt: at(5) }),
        thread("finished", "a", { latestUserMessageAt: at(40), latestRunCompletedAt: at(2) }),
        thread("digest", "a", { digest: true, createdAt: at(26), latestRunCompletedAt: at(1) }),
        thread("child", "a", {
          latestRunCompletedAt: at(1),
          lineage: {
            rootThreadId: ThreadId.make("asked"),
            parentThreadId: ThreadId.make("asked"),
            relationshipToParent: "subagent",
          },
        }),
        thread("elsewhere", "b", { latestUserMessageAt: at(1) }),
      ],
      nowMs: NOW_MS,
    });
    expect(candidate?.threads.map((entry) => entry.id)).toEqual(["finished", "asked"]);
  });
});

describe("advanceAwayClock", () => {
  const away = { connected: false, enabled: true, awayMs: 8 * HOUR_MS };

  it("is due once after the away time, and again only after a client returns", () => {
    let clock = advanceAwayClock({ awaySinceMs: null, digested: false }, { ...away, nowMs: 0 });
    expect(clock.due).toBe(false);
    clock = advanceAwayClock(clock.clock, { ...away, nowMs: 8 * HOUR_MS - 1 });
    expect(clock.due).toBe(false);
    clock = advanceAwayClock(clock.clock, { ...away, nowMs: 8 * HOUR_MS });
    expect(clock.due).toBe(true);
    clock = advanceAwayClock(clock.clock, { ...away, nowMs: 30 * HOUR_MS });
    expect(clock.due).toBe(false);
    clock = advanceAwayClock(clock.clock, { ...away, connected: true, nowMs: 31 * HOUR_MS });
    clock = advanceAwayClock(clock.clock, { ...away, nowMs: 32 * HOUR_MS });
    clock = advanceAwayClock(clock.clock, { ...away, nowMs: 40 * HOUR_MS });
    expect(clock.due).toBe(true);
  });

  it("is never due while digests are off", () => {
    const clock = advanceAwayClock(
      { awaySinceMs: 0, digested: false },
      { ...away, enabled: false, nowMs: 100 * HOUR_MS },
    );
    expect(clock.due).toBe(false);
  });
});
