import { graphNodeTitle, graphRowMatches, branchStatus } from "./mobileProjectGraph";
import { GraphCanvasRow, graphCards, GRAPH_ROW_HEIGHT, COMMIT_WIDTH } from "./GraphCanvasRow";
import { buildProjectGroups } from "@t3tools/client-runtime/state/project-grouping";
import { useMobileProjectGroupingSettings } from "../../state/project-grouping";
import { useEnvironments } from "../../state/environments";
import { ProjectFavicon } from "../../components/ProjectFavicon";
import { relativeTime } from "../../lib/time";
import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { openSettings } from "../settings/settings-navigation";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  canCloseGraphWorktree,
  layoutProjectGraph,
  type GraphNode,
} from "@t3tools/client-runtime/project-graph";
import { resolveProjectGraphSource } from "@t3tools/client-runtime/state/project-graph-source";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, VcsProjectGraph } from "@t3tools/contracts";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { AppBar } from "../../components/ui/AppBar";
import {
  NATIVE_MAIL_SEARCH_TOOLBAR_CONTENT_INSET,
  NATIVE_MAIL_SEARCH_TOOLBAR_SUPPORTED,
} from "../layout/native-mail-search-toolbar";
import { NativeHeaderToolbar } from "../../native/NativeHeaderToolbar";
import { copyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import { useProjects, useThreadShellsForProjectRefs } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { appAtomRegistry } from "../../state/atom-registry";
import { environmentThreadShells } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { vcsEnvironment } from "../../state/vcs";

// Same rainbow order as the web graph, expressed as native SVG colors.
const COLORS = [
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
] as const;
type Layout = ReturnType<typeof layoutProjectGraph>;
type Row = Layout["rows"][number];
type RouteProps = StaticScreenProps<{ environmentId?: string; projectId?: string }>;
const projectKey = (project: EnvironmentProject) => `${project.environmentId}:${project.id}`;
const toggle = (values: ReadonlySet<string>, id: string) => {
  const next = new Set(values);
  if (!next.delete(id)) next.add(id);
  return next;
};

export function ProjectGraphRouteScreen({ route }: RouteProps) {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const groupingSettings = useMobileProjectGroupingSettings();
  const groups = useMemo(
    () => buildProjectGroups({ projects, settings: groupingSettings }),
    [projects, groupingSettings],
  );
  const navigation = useNavigation();
  const [chosen, setChosen] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const requested =
    chosen ??
    (route.params.projectId ? `${route.params.environmentId}:${route.params.projectId}` : null);
  const project =
    requested === null ? projects[0] : projects.find((entry) => projectKey(entry) === requested);
  return (
    <View className="flex-1 bg-screen">
      {project ? (
        <ProjectGraph
          key={projectKey(project)}
          project={project}
          onChooseProject={() => setChoosing(true)}
          onChooseCheckout={(entry) => setChosen(projectKey(entry))}
          group={groups.find((group) =>
            group.members.some((member) => projectKey(member.project) === projectKey(project)),
          )}
        />
      ) : (
        <>
          <AppBar title="Project visualization" onBack={() => navigation.goBack()} />
          <View className="gap-4 p-5">
            <Text className="text-base text-foreground-muted">
              This project is not available. Connect its environment or choose another project.
            </Text>
            <Action label="Choose project" onPress={() => setChoosing(true)} />
          </View>
        </>
      )}
      {Platform.OS === "ios" ? (
        <NativeHeaderToolbar placement="left">
          <NativeHeaderToolbar.Button
            icon="xmark"
            accessibilityLabel="Close project visualization"
            onPress={() => navigation.goBack()}
            separateBackground
          />
        </NativeHeaderToolbar>
      ) : null}
      <Modal
        visible={choosing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setChoosing(false)}
      >
        <Sheet title="Choose project" onClose={() => setChoosing(false)}>
          {groups.map((group) => (
            <View key={group.key} className="mb-5 gap-2">
              <Text className="text-lg font-t3-semibold text-foreground">{group.label}</Text>
              {group.members.map(({ project: entry }) => (
                <Pressable
                  key={projectKey(entry)}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: project !== undefined && projectKey(entry) === projectKey(project),
                  }}
                  onPress={() => {
                    setChosen(projectKey(entry));
                    setChoosing(false);
                  }}
                  className="gap-1 rounded-xl bg-subtle p-4"
                >
                  <Text className="text-base text-foreground">
                    {environments.find((env) => env.environmentId === entry.environmentId)?.label ??
                      "Environment"}
                  </Text>
                  <Text className="text-sm text-foreground-muted">{entry.workspaceRoot}</Text>
                </Pressable>
              ))}
            </View>
          ))}
          {projects.length === 0 ? (
            <Text className="text-base text-foreground-muted">No connected projects.</Text>
          ) : null}
        </Sheet>
      </Modal>
    </View>
  );
}

function ProjectGraph({
  project,
  onChooseProject,
  onChooseCheckout,
  group,
}: {
  project: EnvironmentProject;
  onChooseProject: () => void;
  onChooseCheckout: (project: EnvironmentProject) => void;
  group: ReturnType<typeof buildProjectGroups>[number] | undefined;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { environments } = useEnvironments();
  const [requestedGitEnvironmentId, setGitEnvironmentId] = useState<EnvironmentId>();
  const gitEnvironmentId = resolveProjectGraphSource({
    owner: project.environmentId,
    requested: requestedGitEnvironmentId,
    environments,
  });
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [unlinkedOpen, setUnlinkedOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [unsettledOnly, setUnsettledOnly] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const horizontal = useRef<ScrollViewInstance>(null);
  const [limit, setLimit] = useState(2_000);
  const [retained, setRetained] = useState<{
    environmentId: EnvironmentId;
    graph: VcsProjectGraph;
  } | null>(null);
  const [search, setSearch] = useState("");
  const graphSearch = useDeferredValue(search);
  const [collapse, setCollapse] = useState(true);
  const [compactLanes, setCompactLanes] = useState(true);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [expandedSettled, setExpandedSettled] = useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = useState<Row | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const list = useRef<FlatList<Row>>(null);
  const query = useEnvironmentQuery(
    vcsEnvironment.projectGraph({
      environmentId: gitEnvironmentId,
      input: {
        cwd: project.workspaceRoot,
        graphCommitLimit: limit,
        refKind: "local",
        refresh: true,
      },
    }),
  );
  const graph = query.data
    ? query.data.graph
    : retained?.environmentId === gitEnvironmentId
      ? retained.graph
      : null;
  const projects = useProjects();
  const projectRefs = useMemo(() => {
    const roots = new Set(
      graph?.worktrees.map((tree) => normalizeProjectPathForComparison(tree.path)) ?? [],
    );
    return projects
      .filter(
        (entry) =>
          entry.environmentId === project.environmentId &&
          (entry.id === project.id ||
            roots.has(normalizeProjectPathForComparison(entry.workspaceRoot))),
      )
      .map((entry) => scopeProjectRef(entry.environmentId, entry.id));
  }, [graph?.worktrees, project.environmentId, project.id, projects]);
  const threads = useThreadShellsForProjectRefs(projectRefs);
  const layout = useMemo(
    () =>
      graph
        ? layoutProjectGraph(graph, threads, {
            colors: COLORS,
            rowHeight: GRAPH_ROW_HEIGHT,
            collapse: collapse && !graphSearch.trim() && !unsettledOnly,
            compactLanes,
            expanded,
            expandedSettled,
            threadSearch: graphSearch,
          })
        : null,
    [graph, threads, collapse, compactLanes, expanded, expandedSettled, graphSearch, unsettledOnly],
  );
  const rows = layout?.rows ?? [];
  const selectedY = rows.find((row) => row.id === highlighted)?.y;
  const cards = useMemo(() => (layout ? graphCards(layout) : new Map()), [layout]);
  const unsettledCount = threads.filter(
    (thread) => thread.archivedAt === null && thread.settledAt === null,
  ).length;
  const unlinkedCount =
    layout?.unlinkedNodes.reduce((count, node) => count + node.threads.length, 0) ?? 0;
  const searchText = graphSearch.trim().toLowerCase();
  const matchingRows = useMemo(
    () =>
      rows.flatMap((row, index) =>
        (searchText || unsettledOnly) &&
        !row.settledThreads &&
        graphRowMatches(row, searchText, unsettledOnly)
          ? [index]
          : [],
      ),
    [rows, searchText, unsettledOnly],
  );
  const focusRow = (index: number) => {
    Keyboard.dismiss();
    setResultsOpen(false);
    setHighlighted(rows[index]?.id ?? null);
    list.current?.scrollToIndex({ index, viewPosition: 0.25, animated: false });
    horizontal.current?.scrollTo({ x: 0, animated: false });
  };
  const loadOlder = () => {
    if (!graph || query.isPending) return;
    setRetained({ environmentId: gitEnvironmentId, graph });
    setLimit((value) => value + 2_000);
  };
  const removeWorktree = useAtomCommand(vcsEnvironment.removeWorktree, {
    label: "close graph worktree",
    reportFailure: false,
  });
  const closeWorktree = (tree: VcsProjectGraph["worktrees"][number]) => {
    if (
      gitEnvironmentId !== project.environmentId ||
      !canCloseGraphWorktree(tree, threads) ||
      closingRef.current
    )
      return;
    Alert.alert(
      "Close worktree?",
      `${tree.path}\n\n${threads.filter((thread) => thread.archivedAt === null && thread.worktreePath && normalizeProjectPathForComparison(thread.worktreePath) === normalizeProjectPathForComparison(tree.path)).length} linked threads. The branch and threads will be kept. Threads using this checkout will need another workspace to continue. Git will refuse removal if there are uncommitted or untracked files.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close worktree",
          style: "destructive",
          onPress: () => {
            const currentThreads = appAtomRegistry.get(
              environmentThreadShells.threadShellsForProjectRefsAtom(projectRefs),
            );
            if (!canCloseGraphWorktree(tree, currentThreads)) {
              setActionError(
                "This worktree is now in use. Stop its running sessions before closing it.",
              );
              return;
            }
            if (closingRef.current) return;
            closingRef.current = true;
            setClosing(true);
            setActionError(null);
            void removeWorktree({
              environmentId: project.environmentId,
              input: { cwd: project.workspaceRoot, path: tree.path, force: false },
            })
              .then((result) => {
                if (result._tag === "Failure") {
                  const error = squashAtomCommandFailure(result);
                  setActionError(
                    error instanceof Error ? error.message : "Could not close worktree.",
                  );
                } else {
                  setSelected(null);
                  query.refresh();
                }
              })
              .catch((error: unknown) => {
                setActionError(
                  error instanceof Error ? error.message : "Could not close worktree.",
                );
              })
              .finally(() => {
                closingRef.current = false;
                setClosing(false);
              });
          },
        },
      ],
    );
  };
  const selectRow = (row: Row) => {
    setHighlighted(row.id);
    if (row.thread) {
      navigation.dispatch(
        StackActions.push("Thread", {
          environmentId: row.thread.environmentId,
          threadId: row.thread.id,
        }),
      );
    } else if (row.collapsed) setExpanded((value) => toggle(value, row.id));
    else if (row.settledThreads && row.ref)
      setExpandedSettled((value) => toggle(value, row.ref!.id));
    else {
      setActionError(null);
      setSelected(row);
    }
  };
  const contentWidth = layout ? layout.labelX + COMMIT_WIDTH + 16 : 900;
  return (
    <View className="flex-1">
      <AppBar
        title={project.title}
        subtitle="Project visualization"
        titleIcon={
          <ProjectFavicon
            size={28}
            environmentId={project.environmentId}
            projectTitle={project.title}
            workspaceRoot={project.workspaceRoot}
            faviconPath={project.faviconPath}
          />
        }
        optionsVersion={[project.environmentId, project.id, project.title, project.faviconPath]}
        search={{
          value: search,
          onChangeText: setSearch,
          placeholder: "Find branch, commit, or thread",
          compactPlaceholder: "Search graph",
          compactToolbar: true,
          menuInToolbar: false,
        }}
        sidebar={false}
        onBack={() => navigation.goBack()}
        actions={[
          {
            accessibilityLabel: "Refresh graph",
            icon: "arrow.clockwise",
            onPress: query.refresh,
            disabled: query.isPending,
          },
        ]}
        menus={[
          {
            title: "Graph options",
            icon: "ellipsis",
            items: [
              { id: "options", title: "Graph options", onPress: () => setOptionsOpen(true) },
              { id: "project", title: "Choose project", onPress: onChooseProject },
            ],
          },
        ]}
      />
      <View className="gap-2 border-b border-border-subtle px-4 py-3">
        {graph ? (
          <>
            <Text className="text-xs text-foreground-muted">
              {graph.commits.length} commits · {graph.branches.length} branches ·{" "}
              {graph.worktrees.length} {graph.worktrees.length === 1 ? "worktree" : "worktrees"}
              {query.isPending ? " · Refreshing…" : ""}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              <Action
                label={`${unsettledCount} unsettled`}
                active={unsettledOnly}
                onPress={() => setUnsettledOnly((value) => !value)}
              />
              <Action
                label={`${unlinkedCount} unlinked`}
                disabled={!unlinkedCount}
                onPress={() => setUnlinkedOpen(true)}
              />
              <Action
                label={collapse ? "Expand all" : "Collapse all"}
                onPress={() => {
                  setCollapse((value) => !value);
                  setExpanded(new Set());
                }}
              />
              <Action
                label="Compact lanes"
                active={compactLanes}
                onPress={() => setCompactLanes((value) => !value)}
              />
              {graph.truncated ? (
                <Action
                  label={query.isPending ? "Loading…" : "Load older"}
                  disabled={query.isPending}
                  onPress={loadOlder}
                />
              ) : null}
            </ScrollView>
            {searchText || unsettledOnly ? (
              <Action
                label={`${matchingRows.length} matching rows`}
                disabled={!matchingRows.length}
                onPress={() => {
                  Keyboard.dismiss();
                  setResultsOpen(true);
                }}
              />
            ) : null}
          </>
        ) : null}
      </View>
      {query.error ? (
        <View className="gap-2 p-4">
          <Text accessibilityRole="alert" className="text-sm text-danger-foreground">
            {query.error}
          </Text>
          <Action label="Retry" onPress={query.refresh} />
        </View>
      ) : null}
      {layout ? (
        <ScrollView
          ref={horizontal}
          horizontal
          style={{ flex: 1 }}
          contentContainerStyle={{ width: contentWidth }}
          directionalLockEnabled
        >
          <FlatList
            ref={list}
            style={{ width: contentWidth, flex: 1 }}
            data={rows}
            keyExtractor={(row) => row.id}
            getItemLayout={(_, index) => ({
              length: GRAPH_ROW_HEIGHT,
              offset: index * GRAPH_ROW_HEIGHT,
              index,
            })}
            initialNumToRender={14}
            windowSize={7}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{
              paddingBottom:
                insets.bottom +
                24 +
                (NATIVE_MAIL_SEARCH_TOOLBAR_SUPPORTED
                  ? NATIVE_MAIL_SEARCH_TOOLBAR_CONTENT_INSET
                  : 0),
            }}
            renderItem={({ item }) => (
              <GraphCanvasRow
                row={item}
                layout={layout}
                cards={cards}
                muted={Boolean(
                  (searchText || unsettledOnly) &&
                  !graphRowMatches(item, searchText, unsettledOnly),
                )}
                selectedY={selectedY}
                onSelect={selectRow}
                onInspect={(node) => {
                  setHighlighted(item.id);
                  setActionError(null);
                  setSelected({ id: node.id, y: node.y, ref: node });
                }}
              />
            )}
            ListEmptyComponent={
              <Text className="p-5 text-base text-foreground-muted">
                No local branches or commits yet.
              </Text>
            }
            ListFooterComponent={
              graph?.truncated ? (
                <View className="p-4">
                  <Action
                    label={query.isPending ? "Loading history…" : "Load older history"}
                    disabled={query.isPending || !query.data?.graph}
                    onPress={loadOlder}
                  />
                </View>
              ) : undefined
            }
          />
        </ScrollView>
      ) : (
        <View className="p-5">
          <Text className="text-base text-foreground-muted">
            {query.isPending
              ? "Reading local branches and worktrees…"
              : query.data?.isRepo === false
                ? "This project is not a Git repository."
                : query.error
                  ? "The graph could not be loaded."
                  : "This environment does not support project graphs yet. Update the server to use project visualization."}
          </Text>
        </View>
      )}
      <Modal
        visible={optionsOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOptionsOpen(false)}
      >
        <Sheet title="Graph options" onClose={() => setOptionsOpen(false)}>
          <View className="gap-4">
            <Action
              label="Choose project"
              onPress={() => {
                setOptionsOpen(false);
                onChooseProject();
              }}
            />
            <Text className="text-sm font-t3-semibold text-foreground">Project checkout</Text>
            {(group?.members.map((member) => member.project) ?? [project]).map((entry) => (
              <Action
                key={projectKey(entry)}
                label={`${projectKey(entry) === projectKey(project) ? "✓ " : ""}${environments.find((env) => env.environmentId === entry.environmentId)?.label ?? "Environment"} · ${entry.workspaceRoot}`}
                onPress={() => {
                  setOptionsOpen(false);
                  onChooseCheckout(entry);
                }}
              />
            ))}
            <Text selectable className="text-sm text-foreground-muted">
              {project.workspaceRoot}
            </Text>
            <Text className="text-sm font-t3-semibold text-foreground">Read Git from</Text>
            {environments.map((environment) => (
              <Action
                key={environment.environmentId}
                label={`${gitEnvironmentId === environment.environmentId ? "✓ " : ""}${environment.label}`}
                disabled={environment.connection.phase !== "connected"}
                onPress={() => {
                  setGitEnvironmentId(environment.environmentId);
                  setLimit(2_000);
                  setRetained(null);
                  setSelected(null);
                  setHighlighted(null);
                  setOptionsOpen(false);
                }}
              />
            ))}
            <Text className="text-sm text-foreground-muted">
              The Git environment must have access to the same workspace path. Threads stay on{" "}
              {environments.find((env) => env.environmentId === project.environmentId)?.label ??
                "the project environment"}
              .
            </Text>
            <Action
              label="Project settings"
              disabled={!group}
              onPress={() => {
                setOptionsOpen(false);
                openSettings(navigation, "SettingsProjectOverview", { projectKey: group?.key });
              }}
            />
          </View>
        </Sheet>
      </Modal>
      <Modal
        visible={resultsOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setResultsOpen(false)}
      >
        <Sheet title={`${matchingRows.length} matching rows`} onClose={() => setResultsOpen(false)}>
          {matchingRows.slice(0, 30).map((index) => {
            const row = rows[index]!;
            return (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                onPress={() => focusRow(index)}
                className="gap-1 border-b border-border-subtle py-4"
              >
                <Text numberOfLines={2} className="text-sm text-foreground">
                  {row.thread?.title ?? graphNodeTitle(row.commit ?? row.ref)}
                </Text>
                <Text numberOfLines={1} className="text-xs text-foreground-muted">
                  {(row.refs ?? (row.ref ? [row.ref] : []))
                    .flatMap((ref) => ref.branches.map((branch) => branch.name))
                    .join(" · ") || row.commit?.commitId?.slice(0, 8)}
                </Text>
              </Pressable>
            );
          })}
          {matchingRows.length > 30 ? (
            <Text className="py-4 text-sm text-foreground-muted">
              Showing the first 30 matches. Refine your search to find more.
            </Text>
          ) : null}
        </Sheet>
      </Modal>
      <Modal
        visible={unlinkedOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setUnlinkedOpen(false)}
      >
        <Sheet title={`${unlinkedCount} unlinked threads`} onClose={() => setUnlinkedOpen(false)}>
          {layout?.unlinkedNodes.map((node) => (
            <View key={node.id} className="mb-5 gap-2">
              <Text className="text-base font-t3-semibold text-foreground">{node.subject}</Text>
              {node.id.startsWith("missing-worktree:") ? (
                <Text selectable className="text-sm text-foreground-muted">
                  {node.id.slice("missing-worktree:".length)}
                </Text>
              ) : null}
              {node.threads.map((thread) => (
                <Pressable
                  key={`${thread.environmentId}:${thread.id}`}
                  accessibilityRole="button"
                  onPress={() => {
                    setUnlinkedOpen(false);
                    selectRow({ id: node.id, y: -1, ref: node, thread });
                  }}
                  className="gap-1 rounded-xl bg-subtle p-4"
                >
                  <Text className="text-sm text-foreground">{thread.title}</Text>
                  <Text className="text-xs text-foreground-muted">
                    {thread.settledAt ? "Settled" : "Unsettled"} ·{" "}
                    {relativeTime(thread.latestUserMessageAt ?? thread.updatedAt)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </Sheet>
      </Modal>
      <Modal
        visible={selected !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        <Sheet title="Graph details" onClose={() => setSelected(null)}>
          {selected ? (
            <GraphDetails
              row={selected}
              defaultBranch={graph?.defaultBranch ?? null}
              sharedBranches={
                graph?.branches
                  .filter(
                    (branch) =>
                      branch.head === (selected.commit?.commitId ?? selected.ref?.commitId),
                  )
                  .map((branch) => branch.name) ?? []
              }
              differentGitSource={gitEnvironmentId !== project.environmentId}
              threads={threads}
              closing={closing}
              onCloseWorktree={closeWorktree}
            />
          ) : null}
          {actionError ? (
            <Text accessibilityRole="alert" className="mt-4 text-sm text-danger-foreground">
              {actionError}
            </Text>
          ) : null}
        </Sheet>
      </Modal>
    </View>
  );
}

function GraphDetails({
  row,
  defaultBranch,
  sharedBranches,
  differentGitSource,
  threads,
  closing,
  onCloseWorktree,
}: {
  row: Row;
  defaultBranch: string | null;
  sharedBranches: readonly string[];
  differentGitSource: boolean;
  threads: readonly EnvironmentThreadShell[];
  closing: boolean;
  onCloseWorktree: (tree: VcsProjectGraph["worktrees"][number]) => void;
}) {
  const nodes: GraphNode[] = [...(row.refs ?? []), ...(row.ref ? [row.ref] : [])];
  const commit = row.commit;
  return (
    <View className="gap-4">
      <Text selectable className="text-lg font-t3-semibold text-foreground">
        {graphNodeTitle(commit ?? row.ref)}
      </Text>
      {sharedBranches.length > 1 ? (
        <Text className="text-sm text-foreground-muted">
          Shares this commit: {sharedBranches.join(" · ")}
        </Text>
      ) : null}
      {commit?.historyDetail ? (
        <Text className="text-sm text-foreground-muted">{commit.historyDetail}</Text>
      ) : null}
      {row.ref && row.ref.branches.length > 0 && !row.ref.worktrees.length ? (
        <Text className="text-sm text-foreground-muted">No worktree checked out</Text>
      ) : null}
      {commit?.commitId || row.ref?.commitId ? (
        <>
          <Text selectable className="text-sm text-foreground-muted">
            {commit?.commitId ?? row.ref?.commitId}
          </Text>
          <Action
            label="Copy commit ID"
            onPress={() => void copyTextWithHaptic((commit?.commitId ?? row.ref?.commitId)!)}
          />
        </>
      ) : null}
      {commit?.author ? (
        <Text selectable className="text-sm text-foreground-muted">
          {commit.author.name} · {commit.author.email}
        </Text>
      ) : null}
      {commit?.committedAtEpochSeconds ? (
        <Text className="text-sm text-foreground-muted">
          {new Date(commit.committedAtEpochSeconds * 1000).toLocaleString()}
        </Text>
      ) : null}
      {nodes
        .flatMap((node) => node.branches)
        .map((branch) => (
          <View key={branch.name} className="gap-1">
            <Text selectable className="text-base font-t3-semibold text-foreground">
              {branch.name}
            </Text>
            <Text className="text-sm text-foreground-muted">
              {[
                branch.current ? "HEAD · Current branch" : null,
                branchStatus(branch, defaultBranch),
                branch.createdFrom ? `From ${branch.createdFrom}` : null,
                branch.createdAtEpochSeconds !== undefined
                  ? `Created ${new Date(branch.createdAtEpochSeconds * 1000).toLocaleString()}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        ))}
      {nodes
        .flatMap((node) => node.worktrees)
        .map((tree) => (
          <View key={tree.path} className="gap-3 rounded-xl bg-subtle p-4">
            <Text selectable className="text-sm text-foreground">
              {tree.path}
            </Text>
            <Text className="text-sm text-foreground-muted">
              {tree.isMain
                ? "Main checkout"
                : tree.locked
                  ? "Locked worktree"
                  : tree.prunable
                    ? "Missing worktree"
                    : "Worktree"}{" "}
              ·{" "}
              {tree.dirty === true
                ? "Uncommitted changes"
                : tree.dirty === false
                  ? "Clean"
                  : "Status unknown"}
            </Text>
            <Action label="Copy worktree path" onPress={() => void copyTextWithHaptic(tree.path)} />
            {!tree.isMain ? (
              <Action
                label={
                  closing
                    ? "Closing…"
                    : differentGitSource
                      ? "Switch Git source to the project environment to close"
                      : tree.locked
                        ? "Unlock this worktree before closing"
                        : tree.prunable
                          ? "This worktree is missing"
                          : canCloseGraphWorktree(tree, threads)
                            ? "Close worktree…"
                            : "Stop running sessions before closing"
                }
                disabled={closing || differentGitSource || !canCloseGraphWorktree(tree, threads)}
                onPress={() => onCloseWorktree(tree)}
              />
            ) : null}
          </View>
        ))}
    </View>
  );
}

function Action({
  label,
  onPress,
  disabled = false,
  active,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, ...(active === undefined ? {} : { selected: active }) }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-11 justify-center rounded-xl bg-subtle-strong px-3 py-2 active:opacity-70"
      style={{ opacity: disabled ? 0.5 : 1, ...(active ? { backgroundColor: "#06b6d433" } : {}) }}
    >
      <Text className="text-sm font-t3-medium text-foreground">{label}</Text>
    </Pressable>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-screen" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between border-b border-border-subtle p-4">
        <Text className="text-lg font-t3-semibold text-foreground">{title}</Text>
        <Action label="Done" onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        {children}
      </ScrollView>
    </View>
  );
}
