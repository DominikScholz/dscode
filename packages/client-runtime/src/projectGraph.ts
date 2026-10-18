import { normalizeProjectPathForComparison } from "@t3tools/shared/path";
import type { VcsProjectGraph } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "./state/shell.ts";
import { threadRuntimeIsActive } from "./state/models.ts";

export type GraphStation = { lane: number; x: number; color: string };
export type GraphNode = {
  id: string;
  commitId: string | null;
  subject: string;
  author?: VcsProjectGraph["commits"][number]["author"];
  committedAtEpochSeconds?: number;
  historyLabel?: string;
  historyDetail?: string;
  parents: readonly string[];
  branches: VcsProjectGraph["branches"][number][];
  worktrees: VcsProjectGraph["worktrees"][number][];
  threads: EnvironmentThreadShell[];
  x: number;
  y: number;
  color: string;
  kind: "commit" | "ref" | "orphan";
  station?: GraphStation;
};
export const NODE_WIDTH = 660;
export const ROW_HEIGHT = 32;
export const BRANCH_LABEL_WIDTH = 248;
const GRAPH_LEFT = BRANCH_LABEL_WIDTH + 40;
const LANE_WIDTH = 28;
/** Worktree identity wins over stale thread branch metadata after a checkout switch. */
export function layoutProjectGraph(
  graph: VcsProjectGraph,
  threads: readonly EnvironmentThreadShell[],
  options: {
    colors: readonly [string, ...string[]];
    rowHeight?: number;
    collapse?: boolean;
    expanded?: ReadonlySet<string>;
    compactLanes?: boolean;
    expandedSettled?: ReadonlySet<string>;
    threadSearch?: string;
  },
) {
  const LINE_COLORS = options.colors;
  const rowHeight = options.rowHeight ?? ROW_HEIGHT;
  const nodes = new Map<string, GraphNode>();
  const ensure = (
    id: string,
    subject = "History outside this view",
    parents: readonly string[] = [],
    commitId: string | null = null,
  ) => {
    let node = nodes.get(id);
    if (!node) {
      node = {
        id,
        commitId,
        subject,
        parents,
        branches: [],
        worktrees: [],
        threads: [],
        x: 0,
        y: 0,
        color: LINE_COLORS[0]!,
        kind: commitId === id ? "commit" : commitId ? "ref" : "orphan",
      };
      nodes.set(id, node);
    }
    return node;
  };
  const commits = new Map(graph.commits.map((commit) => [commit.id, commit]));
  const ensureCommit = (id: string) => {
    const commit = commits.get(id);
    const node = ensure(id, commit?.subject, commit?.parents, id);
    if (commit?.author) node.author = commit.author;
    if (commit?.committedAtEpochSeconds !== undefined)
      node.committedAtEpochSeconds = commit.committedAtEpochSeconds;
    return node;
  };
  for (const commit of graph.commits) ensureCommit(commit.id);
  const ensureCard = (id: string, head: string, fallback: string) => {
    const existing = nodes.get(id);
    if (existing) return existing;
    // An unborn worktree reports an empty or all-zero object id.
    const commit = head && !/^0+$/.test(head) ? ensureCommit(head) : null;
    const card = ensure(id, commit?.subject ?? fallback, commit ? [commit.id] : [], commit?.id);
    return card;
  };
  const branchesByName = new Map(
    graph.branches.map((branch) => {
      const node = ensureCard(`branch:${branch.name}`, branch.head, "Unborn branch");
      node.branches.push(branch);
      return [branch.name, node] as const;
    }),
  );
  const treesByPath = new Map<string, GraphNode>();
  for (const tree of graph.worktrees) {
    const branchNode = tree.branch ? branchesByName.get(tree.branch) : undefined;
    const node =
      branchNode?.commitId === tree.head
        ? branchNode
        : ensureCard(`worktree:${tree.path}`, tree.head, "Unborn checkout");
    node.worktrees.push(tree);
    treesByPath.set(normalizeProjectPathForComparison(tree.path), node);
  }
  for (const thread of threads) {
    if (thread.archivedAt !== null) continue;
    const treeNode = thread.worktreePath
      ? treesByPath.get(normalizeProjectPathForComparison(thread.worktreePath))
      : undefined;
    const branchNode = thread.branch ? branchesByName.get(thread.branch) : undefined;
    const node =
      treeNode ??
      (thread.worktreePath
        ? ensure(`missing-worktree:${thread.worktreePath}`, "Worktree no longer present")
        : (branchNode ??
          ensure(
            `missing-branch:${thread.branch ?? "unassigned"}`,
            `Branch no longer present: ${thread.branch ?? "unassigned"}`,
          )));
    node.threads.push(thread);
  }
  const refs = [...nodes.values()].filter(
    (node) => node.kind !== "commit" && !node.id.startsWith("missing-"),
  );
  const refName = (node: GraphNode) => node.branches[0]?.name ?? node.worktrees[0]?.path ?? node.id;
  refs.sort(
    (a, b) =>
      Number(b.branches[0]?.name === graph.defaultBranch) -
        Number(a.branches[0]?.name === graph.defaultBranch) ||
      (a.branches[0]?.createdAtEpochSeconds ??
        commits.get(a.commitId ?? "")?.committedAtEpochSeconds ??
        Number.MAX_SAFE_INTEGER) -
        (b.branches[0]?.createdAtEpochSeconds ??
          commits.get(b.commitId ?? "")?.committedAtEpochSeconds ??
          Number.MAX_SAFE_INTEGER) ||
      refName(a).localeCompare(refName(b)),
  );
  // Keep sources to the left of descendants even if names or timestamps disagree.
  // Creation time orders siblings; missing provenance falls back to the stable name sort.
  const lineageOrder: GraphNode[] = [];
  const visitedRefs = new Set<string>();
  const appendRef = (ref: GraphNode) => {
    if (visitedRefs.has(ref.id)) return;
    visitedRefs.add(ref.id);
    const originName = ref.branches[0]?.createdFrom;
    const origin = originName ? branchesByName.get(originName) : undefined;
    if (origin) appendRef(origin);
    lineageOrder.push(ref);
  };
  const defaultRef = refs.find((ref) => ref.branches[0]?.name === graph.defaultBranch);
  if (defaultRef) {
    visitedRefs.add(defaultRef.id);
    lineageOrder.push(defaultRef);
  }
  for (const ref of refs) appendRef(ref);
  refs.splice(0, refs.length, ...lineageOrder);
  const lanes: (GraphStation & { id: string; name: string })[] = [];
  const addLane = (id: string, name: string) => {
    const lane = {
      id,
      name,
      lane: lanes.length,
      x: GRAPH_LEFT + lanes.length * LANE_WIDTH,
      color: LINE_COLORS[lanes.length % LINE_COLORS.length]!,
    };
    lanes.push(lane);
    return lane;
  };
  const walk = (start: string, lane: GraphStation) => {
    let id: string | undefined = start;
    while (id) {
      const node = nodes.get(id);
      // A commit is one Git object, even when many branches can reach it.
      // Joining an assigned node ends this track instead of duplicating its ancestry.
      if (!node || node.kind !== "commit" || node.station) break;
      node.station = lane;
      id = node.parents[0];
    }
  };
  for (const ref of refs) {
    ref.station = addLane(ref.id, ref.branches[0]?.name ?? "Detached checkout");
  }
  // Claim source-branch ancestry before its descendants. Reflog provenance resolves
  // equal tips without inventing a separate shared branch or duplicating commits.
  const assignedRefs = new Set<string>();
  const refsAtHead = new Map<string, GraphNode[]>();
  for (const ref of refs) {
    if (!ref.commitId) continue;
    const group = refsAtHead.get(ref.commitId) ?? [];
    group.push(ref);
    refsAtHead.set(ref.commitId, group);
  }
  const assignHistory = (ref: GraphNode) => {
    if (assignedRefs.has(ref.id)) return;
    assignedRefs.add(ref.id);
    const originName = ref.branches[0]?.createdFrom;
    const origin = originName ? branchesByName.get(originName) : undefined;
    if (origin) assignHistory(origin);
    // A surviving ancestor branch owns its history even when its reflog expired.
    let ancestor = nodes.get(ref.commitId ?? "")?.parents[0];
    while (ancestor) {
      const source = refsAtHead.get(ancestor)?.[0];
      if (source) {
        assignHistory(source);
        break;
      }
      ancestor = nodes.get(ancestor)?.parents[0];
    }
    if (ref.commitId) walk(ref.commitId, ref.station!);
  };
  const base = refs.find((ref) => ref.branches[0]?.name === graph.defaultBranch);
  if (base) {
    assignedRefs.add(base.id);
    if (base.commitId) walk(base.commitId, base.station!);
  }
  for (const ref of refs) assignHistory(ref);
  // Merged ancestry without a live ref still has exactly one track.
  for (const node of nodes.values()) {
    if (node.kind === "commit" && !node.station) {
      walk(node.id, addLane(`history:${node.id}`, "Merged history"));
      node.historyLabel = "History without a local branch";
      node.historyDetail = "No local branch points to this history.";
    }
  }
  const commitOrder = new Map(graph.commits.map((commit, index) => [commit.id, index]));
  const forks = new Map<
    GraphStation,
    {
      parent: GraphStation | undefined;
      commit: string | undefined;
      first?: string;
    }
  >();
  for (const node of nodes.values()) {
    if (node.kind !== "commit") continue;
    const lane = node.station!;
    const parent = nodes.get(node.parents[0] ?? "");
    if (parent?.station !== lane)
      forks.set(lane, { parent: parent?.station, commit: parent?.id, first: node.id });
    for (const id of node.parents.slice(1)) {
      const merged = nodes.get(id);
      if (merged?.historyLabel) {
        merged.historyLabel = "Merged history";
        merged.historyDetail = `No local branch points to this history. Merged by “${node.subject}”.`;
      }
    }
  }
  for (const ref of refs) {
    const lane = ref.station!;
    const target = nodes.get(ref.commitId ?? "");
    if (!forks.has(lane) && target?.station !== lane)
      forks.set(lane, { parent: target?.station, commit: target?.id });
  }
  const compareForks = (a: (typeof lanes)[number], b: (typeof lanes)[number]) => {
    const aFork = forks.get(a);
    const bFork = forks.get(b);
    const aTime = commits.get(aFork?.commit ?? "")?.committedAtEpochSeconds;
    const bTime = commits.get(bFork?.commit ?? "")?.committedAtEpochSeconds;
    return (
      (aTime !== undefined && bTime !== undefined ? aTime - bTime : 0) ||
      // Topological order remains useful with older servers or timestamp ties.
      (commitOrder.get(bFork?.commit ?? "") ?? -1) - (commitOrder.get(aFork?.commit ?? "") ?? -1) ||
      (commits.get(aFork?.first ?? "")?.committedAtEpochSeconds ?? Number.MAX_SAFE_INTEGER) -
        (commits.get(bFork?.first ?? "")?.committedAtEpochSeconds ?? Number.MAX_SAFE_INTEGER) ||
      a.lane - b.lane
    );
  };
  // Order by actual divergence, not when a local ref happened to be created.
  // A source must still precede its descendants, including shared-tip aliases.
  const pending = new Set(lanes);
  const sorted: typeof lanes = [];
  const placed = new Set<GraphStation>();
  const baseLane = base?.station;
  while (pending.size) {
    const candidates = [...pending].filter((lane) => {
      const parent = forks.get(lane)?.parent;
      return !parent || placed.has(parent);
    });
    const next =
      (baseLane && !placed.has(baseLane) ? lanes.find((lane) => lane === baseLane) : undefined) ??
      candidates.sort(compareForks)[0] ??
      [...pending][0]!;
    pending.delete(next);
    placed.add(next);
    sorted.push(next);
  }
  lanes.splice(0, lanes.length, ...sorted);
  for (const [index, lane] of lanes.entries()) {
    lane.lane = index;
    lane.x = GRAPH_LEFT + index * LANE_WIDTH;
    lane.color = LINE_COLORS[index % LINE_COLORS.length]!;
  }
  refs.sort((a, b) => a.station!.lane - b.station!.lane);
  const orphans = [...nodes.values()].filter((node) => node.id.startsWith("missing-"));
  const ordered = [
    ...refs,
    ...[...nodes.values()].filter((node) => node.kind === "commit"),
    ...orphans,
  ];
  const refsByCommit = new Map<string, GraphNode[]>();
  for (const node of ordered) {
    const station = node.station;
    node.x = station?.x ?? GRAPH_LEFT;
    node.color = station?.color ?? LINE_COLORS[0]!;
    node.threads.sort(
      (a, b) =>
        Number(a.settledAt !== null) - Number(b.settledAt !== null) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  for (const ref of refs) {
    if (!ref.commitId) continue;
    const group = refsByCommit.get(ref.commitId) ?? [];
    group.push(ref);
    refsByCommit.set(ref.commitId, group);
  }
  let rows: {
    id: string;
    y: number;
    commit?: GraphNode;
    ref?: GraphNode;
    thread?: EnvironmentThreadShell;
    settledThreads?: readonly EnvironmentThreadShell[];
    refs?: GraphNode[];
    collapsed?: GraphNode[];
    expanded?: boolean;
  }[] = [];
  const appendRow = (row: Omit<(typeof rows)[number], "y">) => {
    const y = rows.length * rowHeight;
    rows.push({ ...row, y });
  };
  const appendDetails = (ref: GraphNode) => {
    for (const thread of ref.threads) {
      if (thread.settledAt === null)
        appendRow({ id: `thread:${thread.environmentId}:${thread.id}`, ref, thread });
    }
    const settledThreads = ref.threads.filter((thread) => thread.settledAt !== null);
    if (settledThreads.length) {
      const query = options.threadSearch?.trim().toLowerCase();
      const expanded =
        options.expandedSettled?.has(ref.id) ||
        Boolean(
          query && settledThreads.some((thread) => thread.title.toLowerCase().includes(query)),
        );
      appendRow({ id: `settled:${ref.id}`, ref, settledThreads, expanded });
      if (expanded)
        for (const thread of settledThreads)
          appendRow({ id: `thread:${thread.environmentId}:${thread.id}`, ref, thread });
    }
  };
  for (const commit of ordered.filter((node) => node.kind === "commit")) {
    const labels = refsByCommit.get(commit.id) ?? [];
    const clean = labels.filter((ref) => !ref.worktrees.some((tree) => tree.dirty === true));
    for (const ref of labels.filter((ref) => !clean.includes(ref))) {
      appendRow({ id: ref.id, ref });
      appendDetails(ref);
    }
    appendRow({ id: commit.id, commit, refs: clean });
    for (const ref of clean) appendDetails(ref);
  }
  // Unborn checkouts have rows but no fabricated commits.
  for (const ref of refs.filter((node) => !node.commitId)) {
    appendRow({ id: ref.id, ref });
    appendDetails(ref);
  }
  if (options.collapse) {
    const childCounts = new Map<string, number>();
    for (const commit of graph.commits) {
      for (const parent of commit.parents)
        childCounts.set(parent, (childCounts.get(parent) ?? 0) + 1);
    }
    const folded: typeof rows = [];
    let run: GraphNode[] = [];
    const flush = () => {
      if (!run.length) return;
      const id = `collapsed:${run[0]!.id}:${run.at(-1)!.id}`;
      if (run.length > 1) {
        const expanded = options.expanded?.has(id) ?? false;
        folded.push({ id, y: 0, collapsed: run, expanded });
        if (expanded) for (const commit of run) folded.push({ id: commit.id, y: 0, commit });
      } else for (const commit of run) folded.push({ id: commit.id, y: 0, commit });
      run = [];
    };
    for (const row of rows) {
      const commit = row.commit;
      const eligible =
        commit &&
        !commit.historyLabel &&
        !refsByCommit.has(commit.id) &&
        commit.parents.length === 1 &&
        (childCounts.get(commit.id) ?? 0) === 1;
      if (!eligible) {
        flush();
        folded.push(row);
        continue;
      }
      const previous = run.at(-1);
      if (previous && (previous.parents[0] !== commit.id || previous.x !== commit.x)) flush();
      run.push(commit);
    }
    flush();
    rows = folded;
  }
  for (const [index, row] of rows.entries()) {
    row.y = index * rowHeight;
    if (row.commit) row.commit.y = row.y;
    if (row.ref && !row.thread && !row.settledThreads) row.ref.y = row.y;
    for (const ref of row.refs ?? []) ref.y = row.y;
    if (!row.expanded) for (const commit of row.collapsed ?? []) commit.y = row.y;
  }

  if (options.compactLanes) {
    const spans = new Map<GraphStation, { start: number; end: number }>();
    const extend = (lane: GraphStation | undefined, y: number) => {
      if (!lane) return;
      const span = spans.get(lane);
      spans.set(lane, {
        start: Math.min(span?.start ?? y, y),
        end: Math.max(span?.end ?? y, y),
      });
    };
    for (const node of ordered) {
      extend(node.station, node.y);
      for (const [index, parentId] of node.parents.entries()) {
        const parent = nodes.get(parentId);
        if (!parent) continue;
        // First-parent tracks run down to the fork. Incoming merge tracks run
        // up to the merge row, so their connecting stems also reserve space.
        if (node.kind === "commit" && index > 0) extend(parent.station, node.y);
        else extend(node.station, parent.y);
      }
    }
    const occupied: { start: number; end: number; column: number }[] = [];
    for (const lane of lanes) {
      const span = spans.get(lane);
      if (!span) continue;
      let column = baseLane && lane !== baseLane ? 1 : 0;
      if (lane !== baseLane) {
        for (const previous of occupied) {
          if (previous.start <= span.end && span.start <= previous.end)
            column = Math.max(column, previous.column + 1);
        }
      }
      // Earlier divergences remain to the left wherever histories overlap.
      lane.x = GRAPH_LEFT + column * LANE_WIDTH;
      lane.color = LINE_COLORS[column % LINE_COLORS.length]!;
      occupied.push({ ...span, column });
    }
    for (const node of ordered) {
      node.x = node.station?.x ?? GRAPH_LEFT;
      node.color = node.station?.color ?? LINE_COLORS[0]!;
    }
  }

  const edges = ordered.flatMap((node) =>
    node.parents.flatMap((parent) => {
      const target = nodes.get(parent);
      if (!node.station || !target || (node.kind === "commit" && node.y === target.y)) return [];
      return [
        {
          from: node,
          to: target,
          color:
            node.kind === "commit" && node.parents.indexOf(parent) > 0 ? target.color : node.color,
        },
      ];
    }),
  );
  const commitNodes = ordered.filter((node) => node.kind === "commit");
  // A narrow, fixed graph column keeps commit messages aligned like a Git log.
  const labelX = ordered.reduce((rightmost, node) => Math.max(rightmost, node.x), GRAPH_LEFT) + 28;
  return {
    nodes: ordered,
    rows,
    labelX,
    commitNodes,
    unlinkedNodes: orphans,
    edges,
    lanes,
    width: labelX + NODE_WIDTH + 24,
    height: rows.length * rowHeight,
  };
}

export function graphEdgePath(
  from: GraphNode,
  to: GraphNode,
  includeRefLabel = true,
  rowHeight = ROW_HEIGHT,
) {
  const x1 = from.x,
    y1 = from.y + rowHeight / 2;
  const x2 = to.x,
    y2 = to.y + rowHeight / 2;
  if (from.kind === "ref") {
    if (y1 === y2) return `M ${BRANCH_LABEL_WIDTH + 8} ${y1} H ${x2}`;
    const start = includeRefLabel ? `M ${BRANCH_LABEL_WIDTH + 8} ${y1} H ${x1}` : `M ${x1} ${y1}`;
    if (x1 === x2) return `${start} V ${y2}`;
    const bendY = y2 - rowHeight / 2;
    const radius = Math.min(6, Math.abs(x1 - x2) / 2);
    const direction = Math.sign(x2 - x1);
    return `${start} V ${bendY - radius} Q ${x1} ${bendY} ${x1 + direction * radius} ${bendY} H ${x2 - direction * radius} Q ${x2} ${bendY} ${x2} ${bendY + radius} V ${y2}`;
  }
  if (x1 === x2) return `M ${x1} ${y1} V ${y2}`;
  const direction = Math.sign(x2 - x1);
  const radius = Math.min(8, Math.abs(x2 - x1) / 2);
  const bendY =
    from.kind === "commit" && from.parents.indexOf(to.id) > 0
      ? y1 + rowHeight / 2
      : y2 - rowHeight / 2;
  return `M ${x1} ${y1} V ${bendY - radius} Q ${x1} ${bendY} ${x1 + direction * radius} ${bendY} H ${x2 - direction * radius} Q ${x2} ${bendY} ${x2} ${bendY + radius} V ${y2}`;
}

export function canCloseGraphWorktree(
  tree: VcsProjectGraph["worktrees"][number],
  threads: readonly EnvironmentThreadShell[],
) {
  return (
    !tree.isMain &&
    !tree.locked &&
    !tree.prunable &&
    !threads.some(
      (thread) =>
        thread.worktreePath !== null &&
        normalizeProjectPathForComparison(thread.worktreePath) ===
          normalizeProjectPathForComparison(tree.path) &&
        (threadRuntimeIsActive(thread.runtime) || thread.pendingBackgroundTasks.length > 0),
    )
  );
}
