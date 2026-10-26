import {
  type OrchestrationProjectShell,
  type OrchestrationV2ThreadShell,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import {
  advanceAwayClock,
  bucketActivity,
  countByBranch,
  digestThreadEntry,
  digestWindow,
  parseCommitLog,
  parseStatusLines,
  planDailyDigests,
  windowThreads,
} from "./dailyDigestPlan.ts";

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

describe("digestWindow", () => {
  it("runs from the project's previous digest to this one, or a day back without one", () => {
    const current = thread("now", "a", { digest: true, createdAt: at(0) });
    const threads = [
      current,
      thread("older", "a", { digest: true, createdAt: at(40) }),
      thread("previous", "a", { digest: true, createdAt: at(10) }),
      thread("elsewhere", "b", { digest: true, createdAt: at(2) }),
    ];
    expect(digestWindow(current, threads)).toEqual({
      sinceMs: NOW_MS - 10 * HOUR_MS,
      untilMs: NOW_MS,
    });
    expect(digestWindow(current, [current])).toEqual({
      sinceMs: NOW_MS - 24 * HOUR_MS,
      untilMs: NOW_MS,
    });
  });
});

describe("bucketActivity", () => {
  it("counts commits into even slots and drops ones outside the window", () => {
    const window = { sinceMs: 0, untilMs: 4 * HOUR_MS };
    expect(
      bucketActivity([0, HOUR_MS + 1, 2 * HOUR_MS, 4 * HOUR_MS, 5 * HOUR_MS], window, 4),
    ).toEqual([1, 1, 1, 1]);
  });
});

describe("windowThreads", () => {
  it("lists main threads active in the window or still running, newest first", () => {
    const window = { sinceMs: NOW_MS - 24 * HOUR_MS, untilMs: NOW_MS };
    const listed = windowThreads(
      { projectId: ProjectId.make("a") },
      [
        thread("old", "a", { latestUserMessageAt: at(30) }),
        thread("still-running", "a", { latestUserMessageAt: at(40), status: "running" }),
        thread("recent", "a", { latestRunCompletedAt: at(2) }),
        thread("digest", "a", { digest: true, latestRunCompletedAt: at(1) }),
        thread("other-project", "b", { latestRunCompletedAt: at(1) }),
      ],
      window,
    );
    expect(listed.map((entry) => entry.id)).toEqual(["recent", "still-running"]);
  });
});

describe("digestThreadEntry", () => {
  it("carries what the sidebar row shows: branch, provider mark, and an unread Done", () => {
    const entry = digestThreadEntry(
      thread("t", "a", {
        branch: "feat/digest",
        providerInstanceId: ProviderInstanceId.make("claudeAgent"),
        status: "completed",
        latestRunCompletedAt: at(1),
        lastVisitedAt: at(3),
      }),
    );
    expect(entry).toMatchObject({ branch: "feat/digest", provider: "claude", done: true });
    expect(digestThreadEntry(thread("u", "a"))).toMatchObject({ provider: "openai" });
    expect(
      digestThreadEntry(
        thread("v", "a", {
          status: "completed",
          latestRunCompletedAt: at(3),
          lastVisitedAt: at(1),
        }),
      ),
    ).not.toHaveProperty("done");
  });
});

describe("git output parsers", () => {
  it("reads commits, changed files, and unpushed commits per branch", () => {
    expect(parseCommitLog(["abc1234\x1f1793000000\x1frefs/heads/feat/x\x1fAdd a\x1fb"])).toEqual([
      { hash: "abc1234", timeMs: 1_793_000_000_000, subject: "Add a\x1fb", branch: "feat/x" },
    ]);
    expect(parseStatusLines([" M src/a.ts", "?? notes.md", "R  old.ts -> new.ts"])).toEqual([
      { status: "M", path: "src/a.ts" },
      { status: "??", path: "notes.md" },
      { status: "R", path: "new.ts" },
    ]);
    expect(countByBranch(["refs/heads/a", "refs/heads/b", "refs/heads/b"])).toEqual([
      { branch: "b", count: 2 },
      { branch: "a", count: 1 },
    ]);
  });
});
