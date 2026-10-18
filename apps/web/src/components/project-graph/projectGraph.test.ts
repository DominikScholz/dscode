import { describe, expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type VcsProjectGraph,
} from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { makeThreadFixture } from "../../test-fixtures";
import {
  BRANCH_LABEL_WIDTH,
  graphAuthorIdentity,
  canCloseGraphWorktree,
  graphEdgePath,
  layoutProjectGraph,
  ROW_HEIGHT,
} from "./projectGraph";

const tree: VcsProjectGraph["worktrees"][number] = {
  path: "/repo/worktree",
  head: "feature",
  branch: "feat/new",
  isMain: false,
  locked: false,
  prunable: false,
};
const graph: VcsProjectGraph = {
  defaultBranch: "main",
  truncated: false,
  branches: [
    { name: "main", head: "root", current: true, merged: true },
    { name: "feat/new", head: "feature", current: false, merged: false },
    { name: "alias", head: "feature", current: false, merged: false },
  ],
  commits: [
    { id: "feature", parents: ["root"], subject: "New work" },
    { id: "root", parents: [], subject: "Initial" },
  ],
  worktrees: [tree],
};
function thread(overrides: Partial<EnvironmentThreadShell> = {}): EnvironmentThreadShell {
  return makeThreadFixture({
    id: ThreadId.make("thread"),
    environmentId: EnvironmentId.make("local"),
    projectId: ProjectId.make("project"),
    title: "Design canvas",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: "feat/new",
    worktreePath: null,
    latestRun: null,
    runtime: null,
    createdAt: "2026-09-16T10:00:00.000Z",
    updatedAt: "2026-09-16T10:00:00.000Z",
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
describe("project graph", () => {
  it("keeps shared-tip branches separate and orders unsettled threads first", () => {
    const layout = layoutProjectGraph(graph, [
      thread({ id: ThreadId.make("settled"), settledAt: "2026-09-16T10:00:00.000Z" }),
      thread(),
      thread({ id: ThreadId.make("alias-thread"), branch: "alias" }),
    ]);
    const feature = layout.nodes.find((entry) => entry.id === "branch:feat/new")!;
    const alias = layout.nodes.find((entry) => entry.id === "branch:alias")!;
    const commit = layout.nodes.find((entry) => entry.id === "feature")!;
    expect(feature.branches.map((branch) => branch.name)).toEqual(["feat/new"]);
    expect(alias.branches.map((branch) => branch.name)).toEqual(["alias"]);
    expect(feature.commitId).toBe(alias.commitId);
    expect(feature.threads.map((entry) => entry.id)).toEqual(["thread", "settled"]);
    expect(alias.threads.map((entry) => entry.id)).toEqual(["alias-thread"]);
    expect(commit.threads).toHaveLength(0);
    expect(feature.y).toBe(alias.y);
    expect(commit.y).toBeGreaterThanOrEqual(alias.y);
    expect(commit.y).toBe(feature.y);
    expect(layout.lanes.map((lane) => lane.name)).toEqual(["main", "alias", "feat/new"]);
    expect(commit.station).toBeDefined();
    expect(commit.x).toBe(alias.x);
    expect(
      layout.edges.filter(({ from, to }) => from.id === "feature" && to.id === "root"),
    ).toHaveLength(1);
    expect(
      layout.edges
        .filter(({ from }) => from.kind === "commit")
        .every(({ from, to }) => from.y < to.y),
    ).toBe(true);
  });
  it("keeps three shared-tip worktrees and their threads on their respective branches", () => {
    const branches = ["cube-collection", "cube-draw", "mvp"];
    const worktrees = branches.map((branch) => ({ ...tree, branch, path: `/repo/${branch}` }));
    const layout = layoutProjectGraph(
      {
        ...graph,
        branches: branches.map((name) => ({
          name,
          head: "feature",
          current: false,
          merged: false,
        })),
        worktrees,
      },
      worktrees.map((worktree, index) =>
        thread({
          id: ThreadId.make(`thread-${index}`),
          branch: "stale-branch",
          worktreePath: worktree.path,
        }),
      ),
    );
    const cards = layout.nodes.filter((node) => node.worktrees.length > 0);
    expect(cards).toHaveLength(3);
    for (const [index, card] of cards.entries()) {
      expect(card.branches.map((branch) => branch.name)).toEqual([branches[index]]);
      expect(card.worktrees.map((worktree) => worktree.path)).toEqual([worktrees[index]!.path]);
      expect(card.threads.map((entry) => entry.id)).toEqual([`thread-${index}`]);
    }
    expect(new Set(cards.map((card) => card.y)).size).toBe(1);
    expect(cards.every((card) => card.kind === "ref")).toBe(true);
    expect(layout.rows.filter((row) => row.thread)).toHaveLength(3);
    expect(layout.rows).toHaveLength(layout.commitNodes.length + 3);
  });
  it("attaches worktree threads by checkout even when branch metadata is stale", () => {
    const layout = layoutProjectGraph(graph, [thread({ branch: "main", worktreePath: tree.path })]);
    expect(layout.nodes.find((node) => node.id === "branch:feat/new")?.threads).toHaveLength(1);
    expect(layout.nodes.find((node) => node.id === "branch:main")?.threads).toHaveLength(0);
  });
  it("keeps missing worktrees and deleted branches visible without assigning them to live checkouts", () => {
    const layout = layoutProjectGraph(graph, [
      thread({ worktreePath: "/gone" }),
      thread({ id: ThreadId.make("deleted"), branch: "deleted" }),
      thread({ id: ThreadId.make("archived"), archivedAt: "2026-09-16T10:00:00.000Z" }),
    ]);
    expect(layout.nodes.find((node) => node.id === "missing-worktree:/gone")?.threads).toHaveLength(
      1,
    );
    expect(layout.nodes.find((node) => node.id === "missing-branch:deleted")?.threads).toHaveLength(
      1,
    );
    expect(layout.nodes.flatMap((node) => node.threads)).toHaveLength(2);
  });
  it("retains tips outside truncated history and detached worktrees", () => {
    const layout = layoutProjectGraph(
      {
        ...graph,
        commits: [],
        worktrees: [{ ...tree, head: "detached", branch: null }],
        truncated: true,
      },
      [],
    );
    expect(new Set(layout.nodes.map((node) => node.id))).toEqual(
      new Set([
        "branch:main",
        "root",
        "branch:feat/new",
        "branch:alias",
        "feature",
        "worktree:/repo/worktree",
        "detached",
      ]),
    );
    expect(layout.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(
      true,
    );
  });
  it("does not mix detached worktrees with branches or other detached checkouts at the same commit", () => {
    const detached = { ...tree, branch: null };
    const second = { ...detached, path: "/repo/other" };
    const layout = layoutProjectGraph({ ...graph, worktrees: [detached, second] }, [
      thread({ worktreePath: detached.path }),
      thread({ id: ThreadId.make("other"), worktreePath: second.path }),
    ]);
    expect(layout.nodes.find((node) => node.id === "branch:feat/new")?.threads).toHaveLength(0);
    const cards = layout.nodes.filter((node) => node.worktrees.length > 0);
    expect(
      cards
        .find((node) => node.worktrees[0]?.path === detached.path)
        ?.threads.map((entry) => entry.id),
    ).toEqual(["thread"]);
    expect(
      cards
        .find((node) => node.worktrees[0]?.path === second.path)
        ?.threads.map((entry) => entry.id),
    ).toEqual(["other"]);
    expect(cards.every((node) => node.commitId === "feature" && node.branches.length === 0)).toBe(
      true,
    );
  });
  it("shows unborn checkouts without a fake all-zero history node", () => {
    const layout = layoutProjectGraph(
      {
        defaultBranch: null,
        truncated: false,
        branches: [],
        commits: [],
        worktrees: [{ ...tree, head: "0".repeat(40) }],
      },
      [thread({ worktreePath: tree.path })],
    );
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]?.commitId).toBeNull();
    expect(layout.nodes[0]?.threads).toHaveLength(1);
    expect(layout.edges).toHaveLength(0);
  });
  it("renders every commit in a diverging and merging history with distinct tracks", () => {
    const commits = [
      { id: "merge", parents: ["main-tip", "feature-tip"], subject: "Merge" },
      { id: "main-tip", parents: ["root"], subject: "Main change" },
      { id: "feature-tip", parents: ["feature-start"], subject: "Feature change" },
      { id: "feature-start", parents: ["root"], subject: "Branch starts here" },
      { id: "root", parents: [], subject: "Base" },
    ];
    const layout = layoutProjectGraph({ ...graph, branches: [], worktrees: [], commits }, []);
    expect(layout.nodes.filter((node) => node.kind === "commit").map((node) => node.id)).toEqual(
      commits.map((commit) => commit.id),
    );
    const [merge, main, feature, start, root] = layout.nodes;
    expect(main!.x).toBe(root!.x);
    expect(feature!.x).toBe(start!.x);
    expect(main!.x).not.toBe(feature!.x);
    expect(main!.color).not.toBe(feature!.color);
    expect(layout.edges).toHaveLength(5);
    expect(
      layout.edges.find(({ from, to }) => from.id === "merge" && to.id === "feature-tip")?.color,
    ).toBe(feature!.color);
    expect(
      layout.edges.find(({ from, to }) => from.id === "merge" && to.id === "main-tip")?.color,
    ).toBe(merge!.color);
    expect(
      layout.edges
        .filter(({ from }) => from.kind === "commit")
        .every(({ from, to }) => from.y < to.y),
    ).toBe(true);
    // The merge's second-parent line leaves before the next main-line commit.
    const path = graphEdgePath(merge!, feature!);
    expect(path).toContain(`V ${merge!.y + ROW_HEIGHT - 8}`);
    expect(graphEdgePath(main!, root!)).toBe(
      `M ${main!.x} ${main!.y + ROW_HEIGHT / 2} V ${root!.y + ROW_HEIGHT / 2}`,
    );
  });
  it("keeps four branch lanes and draws common history exactly once on the originating branch", () => {
    const branches = ["mvp", "cube-draw", "main", "cube-collection"].map((name) => ({
      name,
      head: name === "main" ? "root" : "feature",
      current: name === "main",
      merged: name === "main",
      ...(!["main", "mvp"].includes(name) ? { createdFrom: "mvp" } : {}),
    }));
    const first = layoutProjectGraph({ ...graph, branches, worktrees: [] }, []);
    const reordered = layoutProjectGraph(
      { ...graph, branches: branches.toReversed(), worktrees: [] },
      [],
    );
    expect(first.lanes.map((lane) => lane.name)).toEqual([
      "main",
      "mvp",
      "cube-collection",
      "cube-draw",
    ]);
    expect(first.lanes).toEqual(reordered.lanes);
    const tip = first.nodes.find((node) => node.id === "feature")!;
    const root = first.nodes.find((node) => node.id === "root")!;
    expect(tip.station).toBeDefined();
    expect(tip.x).toBe(first.lanes[1]?.x);
    expect(root.station).toBeDefined();
    expect(root.x).toBe(first.lanes[0]?.x);
    expect(
      first.edges.filter(({ from, to }) => from.id === "feature" && to.id === "root"),
    ).toHaveLength(1);
    for (const lane of first.lanes.slice(1, 4)) {
      const ref = first.nodes.find((node) => node.id === lane.id)!;
      expect(ref.x).toBe(lane.x);
      expect(first.edges.find(({ from, to }) => from.id === ref.id && to.id === tip.id)?.to.x).toBe(
        tip.x,
      );
    }
  });
  it("draws diverging branches separately until their common ancestor, with no repeated commit dots", () => {
    const history: VcsProjectGraph = {
      defaultBranch: "main",
      truncated: false,
      worktrees: [],
      branches: [
        { name: "main", head: "root", current: true, merged: true },
        { name: "left", head: "left-tip", current: false, merged: false },
        { name: "right", head: "right-tip", current: false, merged: false },
      ],
      commits: [
        { id: "left-tip", parents: ["shared"], subject: "Left only" },
        { id: "right-tip", parents: ["shared"], subject: "Right only" },
        { id: "shared", parents: ["root"], subject: "Common history" },
        { id: "root", parents: [], subject: "Base" },
      ],
    };
    const layout = layoutProjectGraph(history, []);
    const commits = layout.nodes.filter((node) => node.kind === "commit");
    expect(commits).toHaveLength(4);
    expect(commits.every((node) => node.station !== undefined)).toBe(true);
    expect(commits.find((node) => node.id === "left-tip")?.x).not.toBe(
      commits.find((node) => node.id === "right-tip")?.x,
    );
    const incoming = layout.edges.filter(
      ({ from, to }) => from.kind === "commit" && to.id === "shared",
    );
    expect(incoming).toHaveLength(2);
    expect(new Set(incoming.map(({ to }) => to.x)).size).toBe(1);
    expect(layout.edges.filter(({ from }) => from.id === "shared")).toHaveLength(1);
  });
  it("handles cyclic or missing origin hints without duplicating commits", () => {
    const layout = layoutProjectGraph(
      {
        ...graph,
        branches: graph.branches.map((branch) => ({
          ...branch,
          createdFrom: branch.name === "alias" ? "feat/new" : "alias",
        })),
      },
      [],
    );
    expect(
      layout.nodes
        .filter((node) => node.kind === "commit")
        .every((node) => node.station !== undefined),
    ).toBe(true);
    expect(layout.lanes.map((lane) => lane.name)).not.toContain("Shared history");
  });
  it("places source branches first and newer siblings to the right regardless of names", () => {
    const branches = [
      {
        name: "aaa-new",
        head: "feature",
        current: false,
        merged: false,
        createdFrom: "mvp",
        createdAtEpochSeconds: 300,
      },
      {
        name: "zzz-old",
        head: "feature",
        current: false,
        merged: false,
        createdFrom: "mvp",
        createdAtEpochSeconds: 200,
      },
      {
        name: "mvp",
        head: "feature",
        current: false,
        merged: false,
        createdFrom: "main",
        createdAtEpochSeconds: 100,
      },
      { name: "main", head: "root", current: true, merged: true },
    ];
    const layout = layoutProjectGraph({ ...graph, branches, worktrees: [] }, []);
    expect(layout.lanes.map((lane) => lane.name)).toEqual(["main", "mvp", "zzz-old", "aaa-new"]);
    const appended = layoutProjectGraph(
      {
        ...graph,
        branches: [
          ...branches,
          {
            name: "000-latest",
            head: "feature",
            current: false,
            merged: false,
            createdFrom: "mvp",
            createdAtEpochSeconds: 400,
          },
        ],
        worktrees: [],
      },
      [],
    );
    // Adding a lane must not stretch the rainbow and recolor existing lanes.
    expect(appended.lanes.slice(0, 4)).toEqual(layout.lanes);
    expect(appended.lanes[4]?.name).toBe("000-latest");
  });
  it("orders actual divergence before local ref creation and ignores later merges from main", () => {
    const history: VcsProjectGraph = {
      ...graph,
      worktrees: [],
      branches: [
        { name: "main", head: "main-tip", current: true, merged: true },
        {
          name: "old-fork",
          head: "old-tip",
          current: false,
          merged: false,
          createdAtEpochSeconds: 900,
        },
        {
          name: "new-fork",
          head: "new-tip",
          current: false,
          merged: false,
          createdAtEpochSeconds: 100,
        },
      ],
      commits: [
        {
          id: "old-tip",
          parents: ["old-start", "main-tip"],
          subject: "Merge main into old branch",
          committedAtEpochSeconds: 90,
        },
        {
          id: "new-tip",
          parents: ["main-middle"],
          subject: "New branch",
          committedAtEpochSeconds: 50,
        },
        { id: "main-tip", parents: ["main-middle"], subject: "Main", committedAtEpochSeconds: 40 },
        {
          id: "main-middle",
          parents: ["root"],
          subject: "Main middle",
          committedAtEpochSeconds: 30,
        },
        { id: "old-start", parents: ["root"], subject: "Old branch", committedAtEpochSeconds: 20 },
        { id: "root", parents: [], subject: "Root", committedAtEpochSeconds: 10 },
      ],
    };
    const layout = layoutProjectGraph(history, []);
    expect(layout.lanes.map((lane) => lane.name)).toEqual(["main", "old-fork", "new-fork"]);
    // Older servers still sort by the visible fork topology.
    const undated = layoutProjectGraph(
      {
        ...history,
        commits: history.commits.map(({ id, parents, subject }) => ({ id, parents, subject })),
      },
      [],
    );
    expect(undated.lanes.map((lane) => lane.name)).toEqual(["main", "old-fork", "new-fork"]);
  });
  it("keeps surviving ancestor history on its source even without a reflog", () => {
    const layout = layoutProjectGraph(
      {
        ...graph,
        worktrees: [],
        branches: [
          { name: "main", head: "root", current: true, merged: true },
          {
            name: "aaa-child",
            head: "child",
            current: false,
            merged: false,
            createdAtEpochSeconds: 1,
          },
          { name: "zzz-source", head: "source", current: false, merged: false },
        ],
        commits: [
          { id: "child", parents: ["source"], subject: "Child" },
          { id: "source", parents: ["root"], subject: "Source" },
          { id: "root", parents: [], subject: "Root" },
        ],
      },
      [],
    );
    expect(layout.lanes.map((lane) => lane.name)).toEqual(["main", "zzz-source", "aaa-child"]);
    expect(layout.commitNodes.find((node) => node.id === "source")?.x).toBe(layout.lanes[1]?.x);
  });
  it("labels merged history without inventing a branch and retains that label when collapsed", () => {
    const layout = layoutProjectGraph(
      {
        ...graph,
        worktrees: [],
        branches: [{ name: "main", head: "merge", current: true, merged: true }],
        commits: [
          { id: "merge", parents: ["root", "side"], subject: "Merge command center" },
          { id: "side", parents: ["a"], subject: "Crown details" },
          { id: "a", parents: ["b"], subject: "Crown" },
          { id: "b", parents: ["root"], subject: "Base geometry" },
          { id: "root", parents: [], subject: "Root" },
        ],
      },
      [],
      { collapse: true },
    );
    const merged = layout.rows.find((row) => row.commit?.id === "side")?.commit;
    expect(merged?.historyLabel).toBe("Merged history");
    expect(merged?.historyDetail).toContain("Merge command center");
    expect(merged?.branches).toEqual([]);
    expect(layout.rows.find((row) => row.collapsed)?.collapsed?.map((node) => node.id)).toEqual([
      "a",
      "b",
    ]);
  });
  it("reuses non-overlapping lane spans and their colors without changing rows or main's column", () => {
    const history: VcsProjectGraph = {
      ...graph,
      worktrees: [],
      branches: [
        { name: "main", head: "tip", current: true, merged: true },
        { name: "old", head: "old", current: false, merged: true },
        { name: "new", head: "new", current: false, merged: true },
      ],
      commits: [
        { id: "tip", parents: ["middle", "new"], subject: "New merge" },
        { id: "new", parents: ["recent-base"], subject: "New branch" },
        { id: "middle", parents: ["recent-base"], subject: "Main change" },
        { id: "recent-base", parents: ["old-merge"], subject: "New fork" },
        { id: "old-merge", parents: ["root", "old"], subject: "Old merge" },
        { id: "old", parents: ["root"], subject: "Old branch" },
        { id: "root", parents: [], subject: "Old fork" },
      ],
    };
    const normal = layoutProjectGraph(history, []);
    const compact = layoutProjectGraph(history, [], { compactLanes: true, collapse: true });
    const lane = (name: string) => compact.lanes.find((entry) => entry.name === name)!;
    expect(lane("old").x).toBe(lane("new").x);
    expect(lane("main").x).toBe(normal.lanes[0]!.x);
    expect(lane("old").x).toBeGreaterThan(lane("main").x);
    expect(compact.width).toBeLessThan(normal.width);
    expect(lane("old").color).toBe(lane("new").color);
    expect(lane("main").color).toBe(normal.lanes[0]!.color);
    for (const node of compact.nodes) {
      if (node.station) expect(node.color).toBe(node.station.color);
    }
    expect(compact.edges.find(({ from, to }) => from.id === "tip" && to.id === "new")?.color).toBe(
      lane("new").color,
    );
    expect(compact.nodes.find((node) => node.id === "branch:new")?.color).toBe(lane("old").color);
    expect(compact.rows.map(({ id }) => id)).toEqual(normal.rows.map(({ id }) => id));
    expect(layoutProjectGraph(history, []).lanes).toEqual(normal.lanes);

    // A second merge keeps the old track open past the newer branch. The dots
    // alone do not overlap, but their connecting stems do, so reuse is unsafe.
    const overlapping = layoutProjectGraph(
      {
        ...history,
        commits: history.commits.map((commit) =>
          commit.id === "tip" ? { ...commit, parents: ["middle", "old"] } : commit,
        ),
      },
      [],
      { compactLanes: true },
    );
    expect(overlapping.lanes.find((entry) => entry.name === "old")!.x).toBeLessThan(
      overlapping.lanes.find((entry) => entry.name === "new")!.x,
    );
  });
  it("keeps settled threads collapsed per branch and expands them inline or through search", () => {
    const threads = [
      thread(),
      thread({
        id: ThreadId.make("settled-one"),
        title: "Finished lighting",
        settledAt: "2026-09-16T10:00:00Z",
      }),
      thread({
        id: ThreadId.make("settled-two"),
        title: "Finished terrain",
        settledAt: "2026-09-16T10:00:00Z",
      }),
      thread({
        id: ThreadId.make("archived"),
        settledAt: "2026-09-16T10:00:00Z",
        archivedAt: "2026-09-16T11:00:00Z",
      }),
    ];
    const closed = layoutProjectGraph(graph, threads);
    const group = closed.rows.find((row) => row.settledThreads)!;
    expect(group.settledThreads!.map((entry) => entry.id)).toEqual(["settled-one", "settled-two"]);
    expect(group.expanded).toBe(false);
    expect(closed.rows.flatMap((row) => (row.thread ? [row.thread.id] : []))).toEqual(["thread"]);
    expect(group.y).toBeGreaterThan(group.ref!.y);
    const open = layoutProjectGraph(graph, threads, { expandedSettled: new Set([group.ref!.id]) });
    expect(open.rows.find((row) => row.settledThreads)?.expanded).toBe(true);
    expect(open.rows.flatMap((row) => (row.thread ? [row.thread.id] : []))).toEqual([
      "thread",
      "settled-one",
      "settled-two",
    ]);
    expect(open.height - closed.height).toBe(2 * ROW_HEIGHT);
    expect(layoutProjectGraph(graph, threads).rows.map((row) => row.id)).toEqual(
      closed.rows.map((row) => row.id),
    );
    const searched = layoutProjectGraph(graph, threads, { threadSearch: "finished lighting" });
    expect(searched.rows.some((row) => row.thread?.id === "settled-one")).toBe(true);
  });
  it("attaches clean branch labels to commits and gives only dirty worktrees separate tips", () => {
    const clean = layoutProjectGraph(graph, [thread()]);
    expect(clean.rows.filter((row) => row.ref && !row.thread)).toHaveLength(0);
    expect(clean.rows.flatMap((row) => row.refs ?? [])).toHaveLength(3);
    for (const row of clean.rows)
      for (const ref of row.refs ?? []) expect(ref.y).toBe(row.commit!.y);
    const dirty = layoutProjectGraph({ ...graph, worktrees: [{ ...tree, dirty: true }] }, [
      thread(),
    ]);
    const tips = dirty.rows.filter((row) => row.ref && !row.thread);
    expect(tips).toHaveLength(1);
    expect(tips[0]!.ref!.id).toBe("branch:feat/new");
    expect(tips[0]!.y).toBeLessThan(dirty.commitNodes.find((node) => node.id === "feature")!.y);
    expect(dirty.rows.flatMap((row) => row.refs ?? []).map((ref) => ref.id)).not.toContain(
      "branch:feat/new",
    );
    expect(dirty.commitNodes).toHaveLength(2);
    const unknown = layoutProjectGraph({ ...graph, worktrees: [{ ...tree, dirty: null }] }, []);
    expect(unknown.rows.filter((row) => row.ref)).toHaveLength(0);
    for (const layout of [clean, dirty, unknown]) {
      const ref = layout.nodes.find((node) => node.id === "branch:feat/new")!;
      expect(ref.worktrees.map((entry) => entry.path)).toEqual([tree.path]);
      const pendingThread = layout.rows.find((row) => row.thread);
      if (pendingThread) expect(pendingThread.y).toBe(ref.y + ROW_HEIGHT);
    }
  });
  it("collapses only ordinary linear history and supports expanding it again", () => {
    const history: VcsProjectGraph = {
      ...graph,
      worktrees: [],
      branches: [
        { name: "main", head: "tip", current: true, merged: true },
        { name: "feature", head: "side", current: false, merged: false },
      ],
      commits: [
        { id: "tip", parents: ["a", "side"], subject: "Merge" },
        { id: "a", parents: ["b"], subject: "A" },
        { id: "b", parents: ["fork"], subject: "B" },
        { id: "side", parents: ["fork"], subject: "Side" },
        { id: "fork", parents: ["root"], subject: "Fork" },
        { id: "root", parents: [], subject: "Root" },
      ],
    };
    const compact = layoutProjectGraph(history, [], { collapse: true });
    const summary = compact.rows.find((row) => row.collapsed)!;
    expect(summary.collapsed!.map((commit) => commit.id)).toEqual(["a", "b"]);
    expect(compact.rows.flatMap((row) => (row.commit ? [row.commit.id] : []))).toEqual([
      "tip",
      "side",
      "fork",
      "root",
    ]);
    const expanded = layoutProjectGraph(history, [], {
      collapse: true,
      expanded: new Set([summary.id]),
    });
    expect(expanded.rows.flatMap((row) => (row.commit ? [row.commit.id] : []))).toEqual(
      history.commits.map((commit) => commit.id),
    );
    expect(expanded.rows.find((row) => row.id === summary.id)?.expanded).toBe(true);
    expect(
      compact.edges
        .filter(({ from }) => from.kind === "commit")
        .every(({ from, to }) => from.y < to.y),
    ).toBe(true);
  });
  it("aligns messages beside narrow tracks while keeping labels to their left", () => {
    const layout = layoutProjectGraph(graph, []);
    expect(layout.lanes[1]!.x - layout.lanes[0]!.x).toBeLessThan(36);
    expect(layout.lanes.every((lane) => lane.x > BRANCH_LABEL_WIDTH)).toBe(true);
    const rightmost = layout.lanes.at(-1)!;
    expect(layout.labelX - rightmost.x).toBeLessThan(36);
  });
  it("keeps commit messages clear of other tracks that continue through the row", () => {
    const commits = [
      { id: "merge", parents: ["left", "right"], subject: "Merge" },
      { id: "left", parents: ["root"], subject: "Left" },
      { id: "left-extra", parents: ["root"], subject: "Another tip" },
      { id: "right", parents: ["root"], subject: "Right" },
      { id: "root", parents: [], subject: "Base" },
    ];
    const layout = layoutProjectGraph({ ...graph, branches: [], worktrees: [], commits }, []);
    const right = layout.commitNodes.find((node) => node.id === "right")!;
    expect(layout.labelX).toBeGreaterThan(right.x);
  });
  it("gives each shared-tip branch and unsettled thread its own uniform row", () => {
    const empty = layoutProjectGraph(graph, []);
    const many = layoutProjectGraph(
      graph,
      Array.from({ length: 12 }, (_, index) => thread({ id: ThreadId.make(`thread-${index}`) })),
    );
    expect(many.rows.filter((row) => row.thread)).toHaveLength(12);
    expect(many.rows.filter((row) => row.commit).map((row) => row.commit!.id)).toEqual([
      "feature",
      "root",
    ]);
    expect(many.rows.flatMap((row) => row.refs ?? []).map((ref) => ref.id)).toHaveLength(3);
    expect(new Set(many.rows.map((row) => row.id)).size).toBe(many.rows.length);
    expect(many.height - empty.height).toBe(12 * ROW_HEIGHT);
    expect(many.height).toBe(many.rows.length * ROW_HEIGHT);
    for (const [index, row] of many.rows.entries()) expect(row.y).toBe(index * ROW_HEIGHT);
    const featureRef = many.nodes.find((node) => node.id === "branch:feat/new")!;
    expect(
      many.rows
        .filter((row) => row.thread)
        .every((row) => row.ref === featureRef && row.y > featureRef.y),
    ).toBe(true);
    expect(many.commitNodes[0]!.y).toBe(empty.commitNodes[0]!.y);
  });
  it("protects main, locked and missing worktrees", () => {
    expect(canCloseGraphWorktree(tree, [])).toBe(true);
    expect(canCloseGraphWorktree({ ...tree, isMain: true }, [])).toBe(false);
    expect(canCloseGraphWorktree({ ...tree, locked: true }, [])).toBe(false);
    expect(canCloseGraphWorktree({ ...tree, prunable: true }, [])).toBe(false);
  });
});

it("protects worktrees with live background tasks and normalizes checkout paths", () => {
  const windowsTree = { ...tree, path: "C:/repo/worktree" };
  const active = thread({
    worktreePath: "c:\\repo\\worktree\\",
    pendingBackgroundTasks: [
      { kind: "command", taskId: "background-command", description: "Dev server" },
    ],
  });
  expect(canCloseGraphWorktree(windowsTree, [active])).toBe(false);
  const layout = layoutProjectGraph({ ...graph, worktrees: [windowsTree] }, [active]);
  expect(layout.nodes.find((node) => node.id === "branch:feat/new")?.threads).toHaveLength(1);
});

it.each([
  ["preparing", false],
  ["queued", false],
  ["starting", false],
  ["running", false],
  ["waiting", false],
  ["idle", true],
  ["completed", true],
  ["interrupted", true],
  ["failed", true],
  ["cancelled", true],
  ["rolled_back", true],
] as const)("checks worktree closure against a %s runtime", (status, canClose) => {
  const active = thread({
    worktreePath: tree.path,
    runtime: {
      status,
      activeRunId: null,
      providerInstanceId: ProviderInstanceId.make("codex"),
      providerName: null,
      lastError: null,
      updatedAt: "2026-09-16T10:00:00.000Z",
    },
  });
  expect(canCloseGraphWorktree(tree, [active])).toBe(canClose);
  expect(canCloseGraphWorktree(tree, [{ ...active, worktreePath: "/repo/other" }])).toBe(true);
});

it("offers GitHub and Gravatar portraits with local initials as the final fallback", () => {
  expect(graphAuthorIdentity({ name: "Ada Lovelace", email: "private@example.com" })).toEqual({
    name: "Ada Lovelace",
    initials: "AL",
    avatarUrl: null,
    gravatarUrl:
      "https://www.gravatar.com/avatar/8172a023f8733c1c6377deccd97aefc669393f2a8f077b5bee2d1682d9bc307e?s=40&d=404",
  });
  expect(
    graphAuthorIdentity({ name: "Ada", email: "123+octocat@users.noreply.github.com" }).avatarUrl,
  ).toBe("https://github.com/octocat.png?size=40");
  expect(
    graphAuthorIdentity({ name: "Ada", email: "octocat@users.noreply.github.com" }).avatarUrl,
  ).toBe("https://github.com/octocat.png?size=40");
  expect(graphAuthorIdentity(undefined)).toEqual({
    name: "Unknown author",
    initials: "?",
    avatarUrl: null,
    gravatarUrl: null,
  });
  expect(graphAuthorIdentity({ name: "Ada", email: " Private@Example.Com  " }).gravatarUrl).toBe(
    graphAuthorIdentity({ name: "Ada", email: "private@example.com" }).gravatarUrl,
  );
  expect(graphAuthorIdentity({ name: "李 明", email: "" }).initials).toBe("李明");
  const author = { name: "Ada Lovelace", email: "ada@example.com" };
  const layout = layoutProjectGraph(
    { ...graph, commits: graph.commits.map((commit) => ({ ...commit, author })) },
    [],
  );
  expect(layout.commitNodes.every((node) => node.author === author)).toBe(true);
});
