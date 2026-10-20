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

function thread(
  projectId: string,
  state: "working" | "active" | "settled",
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
    ...overrides,
  });
}

function summarize(
  groups: ReturnType<typeof group>[],
  threads: ReturnType<typeof thread>[],
  supportsSettlement = (_environmentId: EnvironmentId) => true,
) {
  const result = summarizeDashboardProjects({ groups, threads, supportsSettlement });
  const view = (projects: typeof result.open) =>
    projects.map(({ group, working, active, settled, lastActivityMs }) => ({
      key: group.key,
      working,
      active,
      settled,
      lastActivityMs,
    }));
  return { open: view(result.open), allSettled: view(result.allSettled) };
}

describe("summarizeDashboardProjects", () => {
  it("counts threads by section and puts all-settled or empty projects last", () => {
    expect(
      summarize(
        [group("busy"), group("done"), group("empty")],
        [
          thread("busy", "working"),
          thread("busy", "active"),
          thread("busy", "settled"),
          thread("done", "settled"),
        ],
      ),
    ).toMatchObject({
      open: [{ key: "busy", working: 1, active: 1, settled: 1 }],
      allSettled: [
        { key: "done", working: 0, active: 0, settled: 1 },
        { key: "empty", working: 0, active: 0, settled: 0, lastActivityMs: null },
      ],
    });
  });

  it("lists the most recently active projects first, then projects without threads", () => {
    const { allSettled } = summarize(
      [group("empty"), group("older"), group("newer")],
      [
        thread("older", "settled", { latestUserMessageAt: "2026-10-01T09:00:00.000Z" }),
        thread("newer", "settled", { latestUserMessageAt: "2026-10-19T09:00:00.000Z" }),
      ],
    );
    expect(allSettled.map((project) => project.key)).toEqual(["newer", "older", "empty"]);
  });

  it("reports the latest user message across the project's threads", () => {
    const { allSettled } = summarize(
      [group("done")],
      [
        thread("done", "settled", { latestUserMessageAt: "2026-10-18T09:00:00.000Z" }),
        thread("done", "settled", { latestUserMessageAt: "2026-10-19T09:00:00.000Z" }),
      ],
    );
    expect(allSettled[0]?.lastActivityMs).toBe(Date.parse("2026-10-19T09:00:00.000Z"));
  });

  it("ignores archived and subagent threads, as the sidebar does", () => {
    const { open } = summarize(
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
    expect(open).toEqual([]);
  });

  it("keeps threads active on environments that cannot settle", () => {
    expect(
      summarize(
        [group("old", legacy)],
        [thread("old", "settled", { environmentId: legacy })],
        (environmentId) => environmentId !== legacy,
      ).open,
    ).toMatchObject([{ key: "old", active: 1, settled: 0 }]);
  });
});
