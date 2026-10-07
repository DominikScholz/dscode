import { describe, expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type VcsProjectGraph,
} from "@t3tools/contracts";
import {
  ROW_HEIGHT,
  graphEdgePath,
  layoutProjectGraph,
} from "@t3tools/client-runtime/project-graph";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { makeThreadShellFixture } from "../../test-fixtures";
import { branchStatus, graphNodeTitle, graphRowMatches, rowSearchText } from "./mobileProjectGraph";

const graph: VcsProjectGraph = {
  defaultBranch: "main",
  truncated: false,
  branches: [
    { name: "main", head: "root", current: false, merged: true },
    { name: "feature", head: "tip", current: true, merged: false },
  ],
  commits: [
    {
      id: "tip",
      subject: "Add visualization",
      parents: ["root"],
      author: { name: "Dominik", email: "test@example.test" },
    },
    { id: "root", subject: "Initial commit", parents: [] },
  ],
  worktrees: [
    {
      path: "/repo/feature",
      branch: "feature",
      head: "tip",
      isMain: false,
      locked: false,
      prunable: false,
    },
  ],
};
function thread(overrides: Partial<EnvironmentThreadShell> = {}): EnvironmentThreadShell {
  return makeThreadShellFixture({
    id: ThreadId.make("thread"),
    environmentId: EnvironmentId.make("remote"),
    projectId: ProjectId.make("project"),
    title: "Mobile design",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: "feature",
    worktreePath: "/repo/feature",
    latestRun: null,
    runtime: null,
    createdAt: "2026-09-21T10:00:00.000Z",
    updatedAt: "2026-09-21T10:00:00.000Z",
    archivedAt: null,
    settledAt: null,
    settledOverride: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    pullRequests: [],
    ...overrides,
  });
}
const options = {
  colors: ["#06b6d4", "#3b82f6"],
  rowHeight: ROW_HEIGHT,
  compactLanes: true,
} as const;

describe("mobile project graph", () => {
  it("preserves the web graph topology and row spacing", () => {
    const desktop = layoutProjectGraph(graph, [thread()], { colors: options.colors });
    const mobile = layoutProjectGraph(graph, [thread()], options);
    expect(mobile.rows.map((row) => row.id)).toEqual(desktop.rows.map((row) => row.id));
    expect(mobile.rows.map((row) => row.y)).toEqual(desktop.rows.map((row) => row.y));
    expect(mobile.edges.map((edge) => [edge.from.id, edge.to.id])).toEqual(
      desktop.edges.map((edge) => [edge.from.id, edge.to.id]),
    );
    const edge = mobile.edges.find((edge) => edge.from.id === "tip")!;
    expect(graphEdgePath(edge.from, edge.to, false, ROW_HEIGHT)).toContain("16");
    expect(graphEdgePath(edge.from, edge.to, false, ROW_HEIGHT)).toContain("80");
    expect(
      mobile.nodes.every((node) =>
        options.colors.includes(node.color as (typeof options.colors)[number]),
      ),
    ).toBe(true);
  });
  it("retains unlinked remote threads with their original navigation identity", () => {
    const missing = thread({ worktreePath: "/repo/deleted" });
    const layout = layoutProjectGraph(graph, [missing], options);
    expect(layout.unlinkedNodes[0]?.threads).toEqual([missing]);
    expect(layout.unlinkedNodes[0]?.subject).toBe("Worktree no longer present");
    expect(layout.rows.some((row) => row.thread === missing)).toBe(false);
  });
  it("hides settled threads until expanded, and search reveals matching conversations", () => {
    const settled = thread({ settledAt: "2026-09-21T11:00:00.000Z" });
    const collapsed = layoutProjectGraph(graph, [settled], options).rows;
    expect(collapsed.some((row) => row.thread)).toBe(false);
    expect(collapsed.find((row) => row.settledThreads)?.settledThreads).toEqual([settled]);
    const expanded = layoutProjectGraph(graph, [settled], {
      ...options,
      expandedSettled: new Set(["branch:feature"]),
    }).rows;
    expect(expanded.some((row) => row.thread === settled)).toBe(true);
    const searched = layoutProjectGraph(graph, [settled], {
      ...options,
      threadSearch: "mobile",
    }).rows;
    expect(searched.some((row) => row.thread === settled)).toBe(true);
  });
  it("searches commit messages, authors, branch names, and worktree paths", () => {
    const row = layoutProjectGraph(graph, [], options).rows.find(
      (row) => row.commit?.id === "tip",
    )!;
    const text = rowSearchText(row);
    for (const term of ["add visualization", "dominik", "feature", "/repo/feature", "tip"])
      expect(text).toContain(term);
  });
  it("excludes archived conversations even when their worktree disappeared", () => {
    const layout = layoutProjectGraph(
      graph,
      [thread({ archivedAt: "2026-09-21T11:00:00.000Z", worktreePath: "/gone" })],
      options,
    );
    expect(layout.rows.some((row) => row.thread)).toBe(false);
    expect(layout.unlinkedNodes).toEqual([]);
  });
  it("keeps matching branch cards visible for thread searches and dims settled-only rows", () => {
    const active = thread();
    const settled = thread({
      id: ThreadId.make("settled"),
      title: "Old design",
      settledAt: "2026-09-21T11:00:00.000Z",
    });
    const layout = layoutProjectGraph(graph, [active, settled], {
      ...options,
      expandedSettled: new Set(["branch:feature"]),
    });
    const branch = layout.rows.find((row) => row.refs?.some((ref) => ref.id === "branch:feature"))!;
    expect(graphRowMatches(branch, "mobile design", false)).toBe(true);
    expect(graphRowMatches(branch, "feature", true)).toBe(true);
    expect(
      graphRowMatches(
        layout.rows.find((row) => row.thread === active)!,
        "old design",
        false,
      ),
    ).toBe(false);
    expect(
      graphRowMatches(
        layout.rows.find((row) => row.thread === settled)!,
        "old design",
        false,
      ),
    ).toBe(true);
    expect(
      graphRowMatches(
        layout.rows.find((row) => row.thread === settled)!,
        "",
        true,
      ),
    ).toBe(false);
    expect(
      graphRowMatches(
        layout.rows.find((row) => row.thread === active)!,
        "absent",
        true,
      ),
    ).toBe(false);
    expect(
      graphRowMatches(
        layout.rows.find((row) => row.commit?.id === "root")!,
        "",
        true,
      ),
    ).toBe(false);
  });
  it("labels dirty and unborn checkouts without repeating the last commit subject", () => {
    const dirty = layoutProjectGraph(
      { ...graph, worktrees: graph.worktrees.map((tree) => ({ ...tree, dirty: true })) },
      [],
      options,
    );
    expect(graphNodeTitle(dirty.rows[0]?.ref)).toBe("Uncommitted changes");
    expect(graphNodeTitle(dirty.rows.find((row) => row.commit?.id === "tip")?.commit)).toBe(
      "Add visualization",
    );
    const unborn = layoutProjectGraph(
      {
        ...graph,
        commits: [],
        worktrees: [],
        branches: [{ name: "main", head: "", current: true, merged: null }],
      },
      [],
      options,
    );
    expect(graphNodeTitle(unborn.rows[0]?.ref)).toBe("No commits yet");
  });
  it("distinguishes default, merged, unmerged, and unknown branch states", () => {
    const branch = graph.branches[1]!;
    expect(branchStatus(branch, "feature")).toBe("Default branch");
    expect(branchStatus(branch, "main")).toBe("Not merged into main");
    expect(branchStatus({ ...branch, merged: true }, "main")).toBe("Merged into main");
    expect(branchStatus({ ...branch, merged: null }, null)).toBe("Merge status unknown");
  });
});
