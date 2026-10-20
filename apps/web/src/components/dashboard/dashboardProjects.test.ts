import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

import { makeThreadFixture } from "../../test-fixtures";
import { summarizeDashboardProjects } from "./dashboardProjects";

const local = EnvironmentId.make("local");
const legacy = EnvironmentId.make("legacy");
let nextThread = 0;

function group(key: string, environmentId = local) {
  return { key, memberProjects: [{ environmentId, id: ProjectId.make(key) }] };
}

const NOW = "2026-10-20T12:00:00.000Z";

function thread(
  projectId: string,
  state: "working" | "active" | "snoozed" | "settled",
  overrides: Parameters<typeof makeThreadFixture>[0] = {},
) {
  nextThread += 1;
  return makeThreadFixture({
    id: ThreadId.make(`thread-${nextThread}`),
    environmentId: local,
    projectId: ProjectId.make(projectId),
    runtime:
      state === "working"
        ? {
            status: "running",
            activeRunId: null,
            providerInstanceId: ProviderInstanceId.make("codex"),
            providerName: "Codex",
            lastError: null,
            updatedAt: "2026-10-20T10:00:00.000Z",
          }
        : null,
    settledOverride: state === "settled" ? "settled" : null,
    ...(state === "snoozed"
      ? { snoozedAt: "2026-10-20T08:00:00.000Z", snoozedUntil: "2026-10-21T08:00:00.000Z" }
      : {}),
    ...overrides,
  });
}

function summarize(
  groups: ReturnType<typeof group>[],
  threads: ReturnType<typeof thread>[],
  supportsSettlement = (_environmentId: EnvironmentId) => true,
) {
  const result = summarizeDashboardProjects({
    groups,
    threads,
    capabilities: (environmentId) => ({
      threadSettlement: supportsSettlement(environmentId),
      threadSnooze: true,
    }),
    now: NOW,
  });
  const view = (projects: typeof result.active) =>
    projects.map(({ group, working, active, snoozed, settled, lastActivityMs }) => ({
      key: group.key,
      working,
      active,
      snoozed,
      settled,
      lastActivityMs,
    }));
  return {
    active: view(result.active),
    working: view(result.working),
    snoozed: view(result.snoozed),
    settled: view(result.settled),
  };
}

describe("summarizeDashboardProjects", () => {
  it("files each project under its first section: active, working, snoozed, then settled", () => {
    expect(
      summarize(
        [group("needs-you"), group("busy"), group("later"), group("done"), group("empty")],
        [
          thread("needs-you", "working"),
          thread("needs-you", "active"),
          thread("busy", "working"),
          thread("busy", "snoozed"),
          thread("later", "snoozed"),
          thread("later", "settled"),
          thread("done", "settled"),
        ],
      ),
    ).toMatchObject({
      active: [{ key: "needs-you", working: 1, active: 1 }],
      working: [{ key: "busy", working: 1, snoozed: 1 }],
      snoozed: [{ key: "later", snoozed: 1, settled: 1 }],
      settled: [
        { key: "done", settled: 1 },
        { key: "empty", working: 0, active: 0, snoozed: 0, settled: 0, lastActivityMs: null },
      ],
    });
  });

  it("lists the most recently active projects first, then projects without threads", () => {
    const { settled } = summarize(
      [group("empty"), group("older"), group("newer")],
      [
        thread("older", "settled", { latestUserMessageAt: "2026-10-01T09:00:00.000Z" }),
        thread("newer", "settled", { latestUserMessageAt: "2026-10-19T09:00:00.000Z" }),
      ],
    );
    expect(settled.map((project) => project.key)).toEqual(["newer", "older", "empty"]);
  });

  it("reports the latest user message across the project's threads", () => {
    const { settled } = summarize(
      [group("done")],
      [
        thread("done", "settled", { latestUserMessageAt: "2026-10-18T09:00:00.000Z" }),
        thread("done", "settled", { latestUserMessageAt: "2026-10-19T09:00:00.000Z" }),
      ],
    );
    expect(settled[0]?.lastActivityMs).toBe(Date.parse("2026-10-19T09:00:00.000Z"));
  });

  it("counts a woken thread as active and a snoozed one as snoozed even when settled", () => {
    expect(
      summarize(
        [group("waiting"), group("woken")],
        [
          thread("waiting", "snoozed"),
          thread("waiting", "settled"),
          thread("woken", "active", { snoozedUntil: "2026-10-20T11:00:00.000Z" }),
          thread("woken", "snoozed", { settledOverride: "settled" }),
        ],
      ),
    ).toMatchObject({
      active: [{ key: "woken", active: 1, snoozed: 1, settled: 0 }],
      snoozed: [{ key: "waiting", active: 0, snoozed: 1, settled: 1 }],
    });
  });

  it("ignores archived and subagent threads, as the sidebar does", () => {
    const { active } = summarize(
      [group("hidden")],
      [
        thread("hidden", "active", { archivedAt: "2026-10-01T00:00:00.000Z" }),
        thread("hidden", "active", {
          lineage: {
            rootThreadId: ThreadId.make("root"),
            parentThreadId: ThreadId.make("root"),
            relationshipToParent: "subagent",
          },
        }),
      ],
    );
    expect(active).toEqual([]);
  });

  it("keeps threads active on environments that cannot settle", () => {
    expect(
      summarize(
        [group("old", legacy)],
        [thread("old", "settled", { environmentId: legacy })],
        (environmentId) => environmentId !== legacy,
      ).active,
    ).toMatchObject([{ key: "old", active: 1, settled: 0 }]);
  });
});
