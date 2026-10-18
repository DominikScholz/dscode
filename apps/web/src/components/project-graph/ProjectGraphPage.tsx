import { useNavigate } from "@tanstack/react-router";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";
import type { EnvironmentId, VcsProjectGraph } from "@t3tools/contracts";
import {
  CheckIcon,
  MessageSquareIcon,
  ChevronDownIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  FolderGitIcon,
  FolderIcon,
  Columns2Icon,
  FoldVerticalIcon,
  UnfoldVerticalIcon,
  UnlinkIcon,
  HistoryIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useNowMinute } from "../../hooks/useNowMinute";
import { formatRelativeTime } from "../../timestampFormat";
import { readLocalApi } from "../../localApi";
import type { SidebarProjectGroupMember } from "../../sidebarProjectGrouping";
import { readThreadShell, useProjects, useThreadShellsForProjectRefs } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { vcsEnvironment } from "../../state/vcs";
import { useSettingsProjectGroups } from "../settings/useSettingsProjectGroups";
import { ProjectFavicon } from "../ProjectFavicon";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { resolveGraphAvatar } from "./graphAvatar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  BRANCH_LABEL_WIDTH,
  graphAuthorIdentity,
  canCloseGraphWorktree,
  layoutProjectGraph,
  graphEdgePath,
  ROW_HEIGHT,
  NODE_WIDTH,
  type GraphNode,
} from "./projectGraph";

const BRANCH_LABEL_OPACITY = 0.2;

export function ProjectGraphPage({
  projectKey,
  gitEnvironment,
  checkout,
}: {
  projectKey: string;
  gitEnvironment?: string | undefined;
  checkout?: string | undefined;
}) {
  const { environments } = useEnvironments();
  const groups = useSettingsProjectGroups();
  const group = groups.find((entry) => entry.projectKey === projectKey);
  const navigate = useNavigate();
  const member =
    group?.memberProjects.find((entry) => `${entry.environmentId}:${entry.id}` === checkout) ??
    group?.memberProjects[0];
  if (!group || !member)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        This project is not available. Choose a project from the sidebar.
      </div>
    );
  const controls = (
    <div className="flex h-7 shrink-0 items-center gap-2">
      <ProjectFavicon project={group} className="size-4 shrink-0" />
      <Tooltip>
        <TooltipTrigger
          render={
            <span tabIndex={0} className="max-w-40 truncate text-xs font-medium leading-none" />
          }
        >
          {group.displayName}
        </TooltipTrigger>
        <TooltipPopup>{member.workspaceRoot}</TooltipPopup>
      </Tooltip>
      <Popover>
        <PopoverTrigger
          aria-label="Graph options"
          render={<Button variant="ghost" size="compact" className="size-7 p-0" />}
        >
          <SettingsIcon className="size-3.5" />
        </PopoverTrigger>
        <PopoverPopup align="start" className="w-80">
          <div className="flex flex-col gap-3 text-xs">
            <p className="break-all font-mono text-[10px] text-muted-foreground">
              {member.workspaceRoot}
            </p>
            {group.memberProjects.length > 1 && (
              <label className="flex flex-col gap-1.5">
                Project checkout
                <select
                  aria-label="Project checkout"
                  className="w-full rounded border border-border bg-background p-1.5"
                  value={`${member.environmentId}:${member.id}`}
                  onChange={(event) =>
                    void navigate({
                      to: "/project-graph/$projectKey",
                      params: { projectKey },
                      search: {
                        checkout: event.target.value,
                        ...(gitEnvironment ? { gitEnvironment } : {}),
                      },
                      replace: true,
                    })
                  }
                >
                  {group.memberProjects.map((entry) => (
                    <option
                      key={`${entry.environmentId}:${entry.id}`}
                      value={`${entry.environmentId}:${entry.id}`}
                    >
                      {entry.environmentLabel ?? "Local"} · {entry.workspaceRoot}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {environments.length > 1 && (
              <label className="flex flex-col gap-1.5">
                Read Git from
                <select
                  aria-label="Read Git from"
                  className="w-full rounded border border-border bg-background p-1.5"
                  value={gitEnvironment ?? member.environmentId}
                  onChange={(event) =>
                    void navigate({
                      to: "/project-graph/$projectKey",
                      params: { projectKey },
                      search: {
                        gitEnvironment: event.target.value,
                        checkout: `${member.environmentId}:${member.id}`,
                      },
                      replace: true,
                    })
                  }
                >
                  {environments.map((environment) => (
                    <option key={environment.environmentId} value={environment.environmentId}>
                      {environment.label} · {environment.displayUrl ?? environment.environmentId}
                      {environment.environmentId === member.environmentId
                        ? " (threads live here)"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {gitEnvironment && gitEnvironment !== member.environmentId && (
              <p className="text-[11px] text-muted-foreground">
                Threads stay live on {member.environmentLabel ?? "their environment"}. The Git
                source must have access to the same checkout path.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void navigate({
                  to: "/settings/projects",
                  search: { project: projectKey, machine: member.environmentId },
                })
              }
            >
              Project settings
            </Button>
          </div>
        </PopoverPopup>
      </Popover>
    </div>
  );
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
      <ProjectGraph
        key={`${member.environmentId}:${member.id}`}
        member={member}
        controls={controls}
        gitEnvironmentId={
          environments.find((entry) => entry.environmentId === gitEnvironment)?.environmentId ??
          member.environmentId
        }
      />
    </div>
  );
}

function ProjectGraph({
  member,
  gitEnvironmentId,
  controls,
}: {
  controls: ReactNode;
  member: SidebarProjectGroupMember;
  gitEnvironmentId: EnvironmentId;
}) {
  const [commitLimit, setCommitLimit] = useState(2_000);
  const query = useEnvironmentQuery(
    vcsEnvironment.listRefs({
      environmentId: gitEnvironmentId,
      input: {
        cwd: member.workspaceRoot,
        includeGraph: true,
        graphCommitLimit: commitLimit,
        refKind: "local",
        refresh: true,
      },
    }),
  );
  const removeWorktree = useAtomCommand(vcsEnvironment.removeWorktree, {
    label: "close graph worktree",
    reportFailure: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const closingRef = useRef(false);
  const navigate = useNavigate();
  const [loadedGraph, setLoadedGraph] = useState<{
    environmentId: EnvironmentId;
    graph: VcsProjectGraph;
  } | null>(null);

  const graph =
    query.data?.graph ??
    (loadedGraph?.environmentId === gitEnvironmentId ? loadedGraph.graph : undefined);
  const projects = useProjects();
  const projectRefs = useMemo(() => {
    const roots = new Set(
      graph?.worktrees.map((tree) => normalizeProjectPathForComparison(tree.path)) ?? [],
    );
    return projects
      .filter(
        (project) =>
          project.environmentId === member.environmentId &&
          (project.id === member.id ||
            roots.has(normalizeProjectPathForComparison(project.workspaceRoot))),
      )
      .map((project) => scopeProjectRef(project.environmentId, project.id));
  }, [graph?.worktrees, member.environmentId, member.id, projects]);
  const threads = useThreadShellsForProjectRefs(projectRefs);
  const refresh = query.refresh;
  const openThread = useCallback(
    (thread: EnvironmentThreadShell) => {
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
      });
    },
    [navigate],
  );
  const worktreeMenu = useCallback(
    async (tree: VcsProjectGraph["worktrees"][number], position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      let startedRemoval = false;
      try {
        const canClose = canCloseGraphWorktree(tree, threads) && closing === null;
        const choice = await api.contextMenu.show(
          [
            { id: "copy", label: "Copy worktree path" },
            {
              id: "close",
              label: tree.isMain
                ? "Main checkout cannot be closed"
                : tree.locked
                  ? "Worktree is locked"
                  : tree.prunable
                    ? "Worktree is missing"
                    : !canClose
                      ? "Worktree is in use"
                      : "Close worktree…",
              destructive: true,
              disabled: !canClose,
              separatorBefore: true,
            },
          ],
          position,
        );
        if (choice === "copy") {
          await navigator.clipboard.writeText(tree.path);
          return;
        }
        if (choice !== "close" || !canClose) return;
        const count = threads.filter((thread) => thread.worktreePath === tree.path).length;
        if (
          !(await api.dialogs.confirm(
            `Close worktree ${tree.path}?\n\nThe branch and ${count} thread${count === 1 ? "" : "s"} will be kept. Threads using this checkout will need another workspace to continue. Git will refuse removal if there are uncommitted or untracked files.`,
            { variant: "destructive" },
          ))
        )
          return;
        const currentThreads = threads.map(
          (thread) => readThreadShell(scopeThreadRef(thread.environmentId, thread.id)) ?? thread,
        );
        if (!canCloseGraphWorktree(tree, currentThreads)) {
          setError("This worktree is now in use. Stop its running sessions before closing it.");
          return;
        }
        if (closingRef.current) return;
        closingRef.current = true;
        startedRemoval = true;
        setClosing(tree.path);
        setError(null);
        const result = await removeWorktree({
          environmentId: member.environmentId,
          input: { cwd: member.workspaceRoot, path: tree.path, force: false },
        });
        if (result._tag === "Failure") {
          const cause = squashAtomCommandFailure(result);
          setError(cause instanceof Error ? cause.message : "Could not close worktree.");
        } else refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Worktree action failed.");
      } finally {
        if (startedRemoval) {
          closingRef.current = false;
          setClosing(null);
        }
      }
    },
    [closing, member.environmentId, member.workspaceRoot, refresh, removeWorktree, threads],
  );
  return (
    <>
      {(error || query.error) && (
        <div
          role="alert"
          className="border-b border-destructive/30 bg-destructive/10 px-5 py-3 text-sm text-destructive"
        >
          {error || query.error}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setError(null);
              query.refresh();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {graph ? (
        <GraphLog
          controls={controls}
          graph={graph}
          threads={threads}
          onOpenThread={openThread}
          onWorktreeMenu={worktreeMenu}
          refresh={query.refresh}
          closing={closing}
          loadOlder={() => {
            setLoadedGraph({ environmentId: gitEnvironmentId, graph });
            setCommitLimit((limit) => limit + 2_000);
          }}
          loadingOlder={!query.data?.graph && !query.error}
        />
      ) : (
        <>
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
            {controls}
          </div>
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            {query.isPending && !query.data && !query.error
              ? "Reading local branches and worktrees…"
              : query.data?.isRepo === false
                ? "This project is not a Git repository."
                : query.error
                  ? "The graph could not be loaded."
                  : "This environment does not support project graphs yet. Update it, or select a Git source on the same machine above."}
          </div>
        </>
      )}
    </>
  );
}

type GraphLogProps = {
  controls: ReactNode;
  graph: VcsProjectGraph;
  threads: readonly EnvironmentThreadShell[];
  onOpenThread: (thread: EnvironmentThreadShell) => void;
  onWorktreeMenu: (
    tree: VcsProjectGraph["worktrees"][number],
    position: { x: number; y: number },
  ) => void;
  refresh: () => void;
  closing: string | null;
  loadOlder: () => void;
  loadingOlder: boolean;
};

function GraphLog({
  controls,
  graph,
  threads,
  onOpenThread,
  onWorktreeMenu,
  refresh,
  closing,
  loadOlder,
  loadingOlder,
}: GraphLogProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unsettledOnly, setUnsettledOnly] = useState(false);
  const [collapse, setCollapse] = useState(true);
  const [compactLanes, setCompactLanes] = useState(true);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [expandedSettled, setExpandedSettled] = useState<ReadonlySet<string>>(() => new Set());
  const layout = useMemo(
    () =>
      layoutProjectGraph(graph, threads, {
        collapse: collapse && !search.trim() && !unsettledOnly,
        expanded,
        compactLanes,
        expandedSettled,
        threadSearch: search,
      }),
    [graph, threads, collapse, expanded, compactLanes, expandedSettled, search, unsettledOnly],
  );
  const branchCards = useMemo(() => {
    const cards = new Map<
      string,
      {
        node: GraphNode;
        labelIndex: number;
        labelCount: number;
        details: ReturnType<typeof layoutProjectGraph>["rows"];
      }
    >();
    for (const row of layout.rows) {
      if (row.thread || row.settledThreads) {
        if (row.ref) cards.get(row.ref.id)?.details.push(row);
        continue;
      }
      const refs = row.refs ?? (row.ref ? [row.ref] : []);
      refs.forEach((node, labelIndex) => {
        cards.set(node.id, { node, labelIndex, labelCount: refs.length, details: [] });
      });
    }
    return [...cards.values()];
  }, [layout.rows]);
  const scroller = useRef<HTMLDivElement>(null);
  const selected = layout.nodes.find((node) => node.id === selectedId);
  const selectedY = selected && selected.kind !== "orphan" ? selected.y : undefined;
  const query = search.trim().toLowerCase();
  const matches = useMemo(
    () =>
      new Set(
        layout.nodes
          .filter(
            (node) =>
              (!unsettledOnly || node.threads.some((thread) => thread.settledAt === null)) &&
              (!query ||
                [
                  ...node.branches.map((branch) => branch.name),
                  ...node.threads.map((thread) => thread.title),
                  ...node.worktrees.map((tree) => tree.path),
                  node.id,
                  node.commitId ?? "",
                  node.subject,
                ].some((text) => text.toLowerCase().includes(query))),
          )
          .map((node) => node.id),
      ),
    [layout.nodes, query, unsettledOnly],
  );
  const filtering = query.length > 0 || unsettledOnly;
  const unsettledCount = threads.filter(
    (thread) => thread.archivedAt === null && thread.settledAt === null,
  ).length;
  useEffect(() => {
    if (!scroller.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(scroller.current);
    return () => observer.disconnect();
  }, []);
  const focus = (node: GraphNode) => {
    setSelectedId(node.id);
    scroller.current?.scrollTo({ top: Math.max(0, node.y - size.height / 2), left: 0 });
  };
  const bounds = { top: scrollTop - 320, bottom: scrollTop + size.height + 320 };
  const visibleRows = layout.rows.slice(
    Math.max(0, Math.floor(bounds.top / ROW_HEIGHT)),
    Math.ceil(bounds.bottom / ROW_HEIGHT),
  );
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 overflow-x-auto border-b border-border px-3">
        {controls}
        <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
        <div className="relative w-48 min-w-36 shrink">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Find branch, thread or worktree"
            placeholder="Find in graph…"
            size="compact"
            className="h-7 [&_input]:h-full [&_input]:pl-7 [&_input]:leading-normal"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="compact"
            className="gap-1.5 text-xs sm:text-xs [&_svg]:mx-0"
            variant={unsettledOnly ? "secondary" : "ghost"}
            aria-pressed={unsettledOnly}
            onClick={() => setUnsettledOnly((value) => !value)}
          >
            <MessageSquareIcon aria-hidden className="size-3.5" />
            {unsettledCount} unsettled
          </Button>
          {layout.unlinkedNodes.length > 0 && (
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="compact"
                    className="gap-1.5 text-xs sm:text-xs [&_svg]:mx-0"
                  />
                }
              >
                <UnlinkIcon aria-hidden className="size-3.5" />
                {layout.unlinkedNodes.reduce((count, node) => count + node.threads.length, 0)}{" "}
                unlinked
              </PopoverTrigger>
              <PopoverPopup align="start" className="max-h-80 w-80 overflow-auto p-2">
                {layout.unlinkedNodes.map((node) => (
                  <div key={node.id}>
                    <p className="px-2 py-1 text-[10px] text-muted-foreground">{node.subject}</p>
                    {node.threads.map((thread) => (
                      <button
                        key={`${thread.environmentId}:${thread.id}`}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                        onClick={() => onOpenThread(thread)}
                      >
                        <MessageSquareIcon className="size-3 shrink-0" />
                        <span className="truncate">{thread.title}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </PopoverPopup>
            </Popover>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="mr-2 hidden shrink-0 text-xs tabular-nums text-muted-foreground 2xl:inline">
            {graph.commits.length} commits · {graph.branches.length} branches
          </span>
          <Button
            variant={compactLanes ? "secondary" : "ghost"}
            size="compact"
            className="gap-1.5 text-xs sm:text-xs [&_svg]:mx-0"
            aria-pressed={compactLanes}
            onClick={() => setCompactLanes((value) => !value)}
          >
            <Columns2Icon aria-hidden className="size-3.5" />
            Compact lanes
          </Button>
          <Button
            variant="ghost"
            size="compact"
            className="gap-1.5 text-xs sm:text-xs [&_svg]:mx-0"
            onClick={() => {
              setCollapse((value) => !value);
              setExpanded(new Set());
            }}
          >
            {collapse ? (
              <UnfoldVerticalIcon aria-hidden className="size-3.5" />
            ) : (
              <FoldVerticalIcon aria-hidden className="size-3.5" />
            )}
            {collapse ? "Expand all" : "Collapse all"}
          </Button>
          {graph.truncated && (
            <Button
              variant="ghost"
              size="compact"
              className="gap-1.5 text-xs sm:text-xs [&_svg]:mx-0"
              onClick={loadOlder}
              disabled={loadingOlder}
            >
              <HistoryIcon aria-hidden className="size-3.5" />
              {loadingOlder ? "Loading…" : "Load older"}
            </Button>
          )}
          <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
          <Button
            variant="ghost"
            size="compact"
            className="size-7 p-0"
            aria-label="Refresh graph"
            onClick={refresh}
          >
            <RefreshCwIcon className="size-3.5" />
          </Button>
        </div>
      </div>
      <div
        ref={scroller}
        role="region"
        aria-label="Project branch graph. Scroll vertically for history and horizontally for details."
        tabIndex={0}
        className="relative min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setSelectedId(null);
        }}
      >
        <div
          className="relative mt-3 min-w-full"
          style={{ width: layout.width, height: Math.max(layout.height, size.height) }}
        >
          {selectedY !== undefined && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 w-full bg-accent/20"
              style={{ top: selectedY, height: ROW_HEIGHT }}
            />
          )}
          {visibleRows.map((row) => {
            const node = row.commit ?? (row.thread || row.settledThreads ? undefined : row.ref);
            if (!node) return null;
            const active = selectedY === row.y;
            return (
              <div
                key={`track-band:${row.id}`}
                aria-hidden="true"
                className="pointer-events-none absolute border-r-2"
                style={{
                  left: node.x,
                  top: row.y + 2,
                  width: layout.labelX - node.x,
                  height: ROW_HEIGHT - 4,
                  backgroundColor: `color-mix(in srgb, ${node.color} ${active ? 12 : 6}%, transparent)`,
                  borderColor: `color-mix(in srgb, ${node.color} ${active ? 65 : 50}%, transparent)`,
                  opacity: !active && row.ref ? 0.5 : 1,
                }}
              />
            );
          })}
          <svg
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width={1}
            height={1}
            aria-hidden="true"
          >
            {layout.edges
              .filter(
                ({ from, to }) =>
                  Math.max(from.y, to.y) + ROW_HEIGHT >= bounds.top &&
                  Math.min(from.y, to.y) <= bounds.bottom,
              )
              .map(({ from, to, color }) => {
                const pending = from.kind === "ref" && from.worktrees.some((tree) => tree.dirty);
                const active = selectedY === from.y;
                return (
                  <g key={`${from.id}:${from.x}:${to.id}:${to.x}`}>
                    {pending && (
                      <path
                        d={`M ${BRANCH_LABEL_WIDTH + 8} ${from.y + ROW_HEIGHT / 2} H ${from.x}`}
                        stroke={color}
                        strokeWidth={1}
                        opacity={active ? 0.35 : BRANCH_LABEL_OPACITY}
                      />
                    )}
                    <path
                      d={graphEdgePath(from, to, !pending)}
                      fill="none"
                      stroke={color}
                      strokeWidth={from.kind === "ref" ? 1.5 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={pending ? "3 4" : undefined}
                      opacity={
                        from.kind === "ref"
                          ? pending
                            ? 0.6
                            : active
                              ? 0.35
                              : BRANCH_LABEL_OPACITY
                          : 0.85
                      }
                    />
                  </g>
                );
              })}
          </svg>
          {branchCards
            .filter(
              ({ node, details }) =>
                node.y <= bounds.bottom && node.y + ROW_HEIGHT * (1 + details.length) >= bounds.top,
            )
            .map(({ node, labelIndex, labelCount, details }) => (
              <GraphBranchLabel
                key={node.id}
                node={node}
                defaultBranch={graph.defaultBranch}
                selected={selectedY === node.y}
                dimmed={filtering && !matches.has(node.id)}
                onSelect={setSelectedId}
                onWorktreeMenu={onWorktreeMenu}
                closing={closing}
                labelIndex={labelIndex}
                labelCount={labelCount}
                details={details}
                onOpenThread={onOpenThread}
                onToggleSettled={() =>
                  setExpandedSettled((old) => {
                    const next = new Set(old);
                    if (next.has(node.id)) next.delete(node.id);
                    else next.add(node.id);
                    return next;
                  })
                }
              />
            ))}
          {visibleRows.map((row) =>
            row.collapsed ? (
              <button
                key={row.id}
                className="absolute flex items-center gap-2 text-left text-[11px] text-muted-foreground/50 hover:text-muted-foreground"
                style={{
                  left: layout.labelX + 8,
                  top: row.y,
                  height: ROW_HEIGHT,
                  width: NODE_WIDTH - 16,
                }}
                aria-expanded={row.expanded}
                aria-label={`${row.expanded ? "Collapse" : "Expand"} ${row.collapsed.length} commits`}
                onClick={() =>
                  setExpanded((old) => {
                    const next = new Set(old);
                    if (next.has(row.id)) next.delete(row.id);
                    else next.add(row.id);
                    return next;
                  })
                }
              >
                <span className="shrink-0 tabular-nums">Commits ({row.collapsed.length})</span>
                <span aria-hidden className="h-px min-w-2 flex-1 bg-border/60" />
                <ChevronDownIcon
                  aria-hidden
                  className={`size-3 shrink-0 ${row.expanded ? "rotate-180" : ""}`}
                />
              </button>
            ) : row.settledThreads || row.thread ? null : (
              <div key={row.id}>
                {row.commit ? (
                  <GraphRow
                    node={row.commit}
                    labelX={layout.labelX}
                    selected={selectedY === row.y}
                    dimmed={
                      filtering &&
                      !matches.has(row.commit.id) &&
                      !(row.ref && matches.has(row.ref.id)) &&
                      !row.refs?.some((ref) => matches.has(ref.id))
                    }
                    onSelect={setSelectedId}
                  />
                ) : (
                  row.ref && (
                    <>
                      <button
                        className="absolute flex size-7 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{
                          left: row.ref.x - 14,
                          top: row.y + ROW_HEIGHT / 2 - 14,
                        }}
                        aria-label={`Inspect branch ${row.ref.branches[0]?.name ?? "detached checkout"}`}
                        onClick={() => setSelectedId(row.ref!.id)}
                      >
                        <span
                          className="size-2.5 rounded-full ring-[3px] ring-background"
                          style={{ backgroundColor: row.ref.color }}
                        />
                      </button>
                      <button
                        className="absolute flex items-center text-[11px] text-muted-foreground hover:text-foreground"
                        style={{ left: layout.labelX + 8, top: row.y, height: ROW_HEIGHT }}
                        onClick={() => setSelectedId(row.ref!.id)}
                      >
                        {row.ref.commitId ? "Uncommitted changes" : "No commits yet"}
                      </button>
                    </>
                  )
                )}
              </div>
            ),
          )}
        </div>
        {layout.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No local branches yet. Create your first commit to start the graph.
          </div>
        )}
      </div>
      {filtering && (
        <div className="absolute left-4 top-11 z-10 max-h-64 w-72 overflow-auto rounded-lg border border-border bg-popover p-2 shadow-lg">
          <p className="px-2 py-1 text-[11px] text-muted-foreground">
            {matches.size} matching nodes
          </p>
          {layout.nodes
            .filter((node) => matches.has(node.id))
            .slice(0, 30)
            .map((node) => (
              <button
                key={node.id}
                className="block w-full truncate rounded px-2 py-2 text-left text-xs hover:bg-accent"
                onClick={() => focus(node)}
              >
                {node.branches.map((branch) => branch.name).join(", ") ||
                  node.threads[0]?.title ||
                  node.subject}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

const GraphBranchLabel = memo(function GraphBranchLabel({
  node,
  defaultBranch,
  selected,
  dimmed,
  onSelect,
  onWorktreeMenu,
  closing,
  labelIndex = 0,
  labelCount = 1,
  details,
  onOpenThread,
  onToggleSettled,
}: {
  details: ReturnType<typeof layoutProjectGraph>["rows"];
  onOpenThread: GraphLogProps["onOpenThread"];
  onToggleSettled: () => void;
  labelIndex?: number;
  labelCount?: number;
  node: GraphNode;
  defaultBranch: string | null;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
  onWorktreeMenu: GraphLogProps["onWorktreeMenu"];
  closing: string | null;
}) {
  const branch = node.branches[0];
  const name = branch?.name ?? "Detached checkout";
  const status =
    branch?.name === defaultBranch
      ? "Default branch"
      : branch?.merged === true
        ? `Merged into ${defaultBranch}`
        : branch?.merged === false
          ? `Not merged into ${defaultBranch}`
          : "Merge status unknown";
  const worktreeMenu = (event: MouseEvent) => {
    const tree = node.worktrees[0];
    if (tree && node.worktrees.length === 1)
      onWorktreeMenu(tree, { x: event.clientX, y: event.clientY });
    else onSelect(node.id);
  };
  return (
    <div
      role="group"
      aria-label={`Branch ${name}`}
      className="absolute flex flex-col overflow-hidden rounded-md bg-background text-foreground"
      style={{
        left: 8 + labelIndex * (BRANCH_LABEL_WIDTH / labelCount),
        top: node.y + 4,
        width: BRANCH_LABEL_WIDTH / labelCount - (labelCount > 1 ? 3 : 0),
        opacity: dimmed && !selected ? 0.3 : 1,
        backgroundColor: `color-mix(in srgb, ${node.color} ${selected ? 10 : 6}%, var(--background))`,
      }}
    >
      <div
        className="flex h-6 shrink-0 items-center gap-1 px-2"
        style={{
          backgroundColor: `color-mix(in srgb, ${node.color} ${selected ? 38 : 30}%, var(--background))`,
        }}
      >
        <Tooltip>
          <TooltipTrigger
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-mono text-[11px]"
            aria-label={`Branch lane ${name}`}
            onClick={() => onSelect(node.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              worktreeMenu(event);
            }}
          >
            {branch?.current && <CheckIcon className="size-3 shrink-0" />}
            <span className="truncate">{name}</span>
            {branch?.merged === true && !branch.current && (
              <CheckIcon className="size-3 shrink-0 opacity-60" />
            )}
          </TooltipTrigger>
          <TooltipPopup>
            {name} · {status}
            {branch?.current ? " · HEAD" : ""}
            {labelCount > 1 && (
              <>
                <br />
                Shares this commit with other branches
              </>
            )}
            {node.worktrees.length === 0 && (
              <>
                <br />
                No worktree checked out
              </>
            )}
          </TooltipPopup>
        </Tooltip>
        {node.worktrees.map((tree) => (
          <Tooltip key={tree.path}>
            <TooltipTrigger
              className="flex size-5 shrink-0 items-center justify-center rounded text-foreground hover:bg-foreground/5"
              aria-label={`${tree.isMain ? "Local checkout" : "Worktree"} ${tree.path}: ${tree.branch ?? "Detached HEAD"}`}
              disabled={closing === tree.path}
              onClick={(event) => onWorktreeMenu(tree, { x: event.clientX, y: event.clientY })}
              onContextMenu={(event) => {
                event.preventDefault();
                onWorktreeMenu(tree, { x: event.clientX, y: event.clientY });
              }}
            >
              {tree.isMain ? (
                <FolderIcon aria-hidden className="size-3 shrink-0" />
              ) : (
                <FolderGitIcon aria-hidden className="size-3 shrink-0" />
              )}
            </TooltipTrigger>
            <TooltipPopup>
              {closing === tree.path
                ? "Closing worktree…"
                : tree.isMain
                  ? "Main checkout"
                  : "Worktree"}
              <br />
              {tree.path}
            </TooltipPopup>
          </Tooltip>
        ))}
      </div>
      {details.map((row) => {
        if (row.settledThreads)
          return (
            <button
              key={row.id}
              className="flex shrink-0 items-center gap-2 px-2 text-left text-[11px] text-muted-foreground/50 hover:text-muted-foreground"
              style={{ height: ROW_HEIGHT }}
              aria-expanded={row.expanded}
              aria-label={`${row.settledThreads.length} settled threads for ${name}`}
              onClick={onToggleSettled}
            >
              <span className="shrink-0 tabular-nums">Settled ({row.settledThreads.length})</span>
              <span aria-hidden className="h-px min-w-2 flex-1 bg-border/60" />
              <ChevronDownIcon
                aria-hidden
                className={`size-3 shrink-0 ${row.expanded ? "rotate-180" : ""}`}
              />
            </button>
          );
        if (row.thread) {
          const thread = row.thread;
          return (
            <Tooltip key={row.id}>
              <TooltipTrigger
                className="flex min-w-0 shrink-0 items-center gap-2 px-2 text-left text-[11px] text-foreground/75 hover:bg-accent"
                style={{ height: ROW_HEIGHT }}
                aria-label={`Open ${thread.settledAt === null ? "unsettled" : "settled"} thread: ${thread.title}`}
                onClick={() => onOpenThread(thread)}
              >
                <MessageSquareIcon className="size-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                <GraphTime timestamp={thread.latestUserMessageAt ?? thread.updatedAt} />
              </TooltipTrigger>
              <TooltipPopup>
                {thread.settledAt === null ? "Unsettled" : "Settled"} · {thread.title}
              </TooltipPopup>
            </Tooltip>
          );
        }
        return null;
      })}
    </div>
  );
});

function GraphTime({ timestamp }: { timestamp: string | number | undefined }) {
  useNowMinute();
  const date = new Date(timestamp ?? Number.NaN);
  if (!Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString();
  const relative = formatRelativeTime(iso);
  if (!relative) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <time
            dateTime={iso}
            className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70"
          />
        }
      >
        {relative.value === "just now" ? "now" : relative.value}
      </TooltipTrigger>
      <TooltipPopup>{date.toLocaleString()}</TooltipPopup>
    </Tooltip>
  );
}

const GraphRow = memo(function GraphRow({
  node,
  labelX,
  selected,
  dimmed,
  onSelect,
}: {
  node: GraphNode;
  labelX: number;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
}) {
  const author = useMemo(() => graphAuthorIdentity(node.author), [node.author]);
  const [failedAvatars, setFailedAvatars] = useState<readonly string[]>([]);
  const directAvatar = [author.avatarUrl, author.gravatarUrl].find(
    (url) => url && !failedAvatars.includes(url),
  );
  const email = node.author?.email.trim().toLowerCase() ?? "";
  const [resolved, setResolved] = useState<{ email: string; url: string | null } | null>(null);
  useEffect(() => {
    if (directAvatar || !email) return;
    let active = true;
    void resolveGraphAvatar(email).then((url) => {
      if (active) setResolved({ email, url });
    });
    return () => {
      active = false;
    };
  }, [directAvatar, email]);
  const fallback = resolved?.email === email ? resolved.url : null;
  const avatarUrl =
    directAvatar ?? (fallback && !failedAvatars.includes(fallback) ? fallback : null);
  return (
    <div style={{ opacity: dimmed && !selected ? 0.25 : 1 }}>
      {node.historyLabel && (
        <Tooltip>
          <TooltipTrigger
            className="absolute left-3 flex h-6 items-center gap-2 rounded px-2 text-left text-[11px] text-muted-foreground hover:bg-accent"
            style={{ top: node.y + 4, width: BRANCH_LABEL_WIDTH }}
            onClick={() => onSelect(node.id)}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: node.color }}
            />
            <span className="truncate">{node.historyLabel}</span>
          </TooltipTrigger>
          <TooltipPopup>{node.historyDetail}</TooltipPopup>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger
          className="absolute flex size-7 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ left: node.x - 14, top: node.y + ROW_HEIGHT / 2 - 14 }}
          aria-label={`Inspect ${node.subject}, by ${author.name}`}
          onClick={() => onSelect(node.id)}
        >
          <span
            className={`flex size-[22px] items-center justify-center overflow-hidden rounded-full border-2 text-[8px] font-semibold ${selected ? "ring-2 ring-primary/15" : ""}`}
            style={{ borderColor: node.color, backgroundColor: node.color, color: "#101018" }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="size-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setFailedAvatars((urls) => [...urls, avatarUrl])}
              />
            ) : (
              author.initials
            )}
          </span>
        </TooltipTrigger>
        <TooltipPopup>
          {author.name}
          {node.author?.email ? ` <${node.author.email}>` : ""}
          <br />
          {node.commitId?.slice(0, 8)} · {node.subject}
        </TooltipPopup>
      </Tooltip>
      <div
        className={`absolute flex items-center gap-2 rounded px-2 ${selected ? "bg-primary/10" : "hover:bg-muted/40"}`}
        style={{ left: labelX, top: node.y, height: ROW_HEIGHT, width: NODE_WIDTH }}
      >
        <Tooltip>
          <TooltipTrigger
            className={`min-w-0 flex-1 truncate text-left text-xs ${selected ? "text-foreground" : "text-foreground/80"}`}
            onClick={() => onSelect(node.id)}
          >
            {node.subject}
          </TooltipTrigger>
          <TooltipPopup>{node.subject}</TooltipPopup>
        </Tooltip>
        <button
          onClick={() => onSelect(node.id)}
          className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground/70"
        >
          {node.commitId?.slice(0, 8)}
        </button>
        <GraphTime
          timestamp={
            node.committedAtEpochSeconds === undefined
              ? undefined
              : node.committedAtEpochSeconds * 1_000
          }
        />
      </div>
    </div>
  );
});
