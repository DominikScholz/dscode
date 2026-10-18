import { graphAuthorIdentity, resolveGraphAvatar } from "@t3tools/client-runtime/graph-avatar";
import {
  BRANCH_LABEL_WIDTH,
  NODE_WIDTH,
  ROW_HEIGHT,
  graphEdgePath,
  type GraphNode,
} from "@t3tools/client-runtime/project-graph";
import { Image } from "expo-image";
import { memo, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { relativeTime } from "../../lib/time";
import { graphNodeTitle, type GraphLayout, type GraphRow } from "./mobileProjectGraph";

export const GRAPH_ROW_HEIGHT = ROW_HEIGHT;
export const COMMIT_WIDTH = NODE_WIDTH;

/** Cards keep the same branch/thread columns and shared-tip positions as the web graph. */
export function graphCards(layout: GraphLayout) {
  const cards = new Map<string, { left: number; width: number; lastY: number }>();
  for (const row of layout.rows) {
    const refs = row.refs ?? (row.ref && !row.thread && !row.settledThreads ? [row.ref] : []);
    refs.forEach((node, index) =>
      cards.set(node.id, {
        left: 8 + index * (BRANCH_LABEL_WIDTH / refs.length),
        width: BRANCH_LABEL_WIDTH / refs.length - (refs.length > 1 ? 3 : 0),
        lastY: row.y,
      }),
    );
    if (row.ref && (row.thread || row.settledThreads)) {
      const card = cards.get(row.ref.id);
      if (card) card.lastY = row.y;
    }
  }
  return cards;
}

export const GraphCanvasRow = memo(function GraphCanvasRow({
  row,
  layout,
  cards,
  muted,
  selectedY,
  onSelect,
  onInspect,
}: {
  row: GraphRow;
  layout: GraphLayout;
  cards: ReturnType<typeof graphCards>;
  muted: boolean;
  selectedY: number | undefined;
  onSelect: (row: GraphRow) => void;
  onInspect: (node: GraphNode) => void;
}) {
  const refs = row.refs ?? (row.ref && !row.thread && !row.settledThreads ? [row.ref] : []);
  const node = row.commit ?? row.ref;
  const selected = selectedY === row.y;
  const edges = useMemo(
    () =>
      layout.edges.filter(
        (edge) =>
          Math.min(edge.from.y, edge.to.y) <= row.y + GRAPH_ROW_HEIGHT &&
          Math.max(edge.from.y, edge.to.y) + GRAPH_ROW_HEIGHT >= row.y,
      ),
    [layout.edges, row.y],
  );
  return (
    <View style={{ height: GRAPH_ROW_HEIGHT, opacity: muted && !selected ? 0.3 : 1 }}>
      {selected ? <View className="absolute inset-0 bg-subtle-strong" /> : null}
      {node && !row.thread && !row.settledThreads ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: node.x,
            top: 2,
            width: layout.labelX - node.x,
            height: GRAPH_ROW_HEIGHT - 4,
            backgroundColor: `${node.color}${selected ? "1f" : "0f"}`,
            borderRightWidth: 2,
            borderColor: `${node.color}${selected ? "a6" : "80"}`,
            opacity: !selected && row.ref ? 0.5 : 1,
          }}
        />
      ) : null}
      <Svg
        pointerEvents="none"
        style={{ position: "absolute", overflow: "hidden" }}
        width={layout.labelX}
        height={GRAPH_ROW_HEIGHT}
        viewBox={`0 ${row.y} ${layout.labelX} ${GRAPH_ROW_HEIGHT}`}
      >
        {edges.map(({ from, to, color }) => {
          const pending = from.kind === "ref" && from.worktrees.some((tree) => tree.dirty);
          const active = selectedY === from.y;
          return (
            <G key={`${from.id}:${from.x}:${to.id}:${to.x}`}>
              {pending ? (
                <Path
                  d={`M ${BRANCH_LABEL_WIDTH + 8} ${from.y + GRAPH_ROW_HEIGHT / 2} H ${from.x}`}
                  stroke={color}
                  strokeWidth={1}
                  opacity={active ? 0.35 : 0.2}
                />
              ) : null}
              <Path
                d={graphEdgePath(from, to, !pending, GRAPH_ROW_HEIGHT)}
                stroke={color}
                strokeDasharray={pending ? "3 4" : undefined}
                strokeWidth={from.kind === "ref" ? 1.5 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={from.kind === "ref" ? (pending ? 0.6 : active ? 0.35 : 0.2) : 0.85}
                fill="none"
              />
            </G>
          );
        })}
        {node && !row.commit && !row.thread && !row.settledThreads ? (
          <Circle cx={node.x} cy={row.y + GRAPH_ROW_HEIGHT / 2} r={5} fill={node.color} />
        ) : null}
      </Svg>
      {refs.map((ref) => {
        const card = cards.get(ref.id)!;
        const branch = ref.branches[0];
        return (
          <View
            key={ref.id}
            style={{
              position: "absolute",
              top: 4,
              left: card.left,
              width: card.width,
              height: 24,
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              borderBottomLeftRadius: card.lastY === row.y ? 6 : 0,
              borderBottomRightRadius: card.lastY === row.y ? 6 : 0,
              backgroundColor: `${ref.color}${selected ? "61" : "4d"}`,
            }}
            className="flex-row items-center px-2"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Branch lane ${branch?.name ?? "Detached HEAD"}`}
              onPress={() => onInspect(ref)}
              className="h-6 min-w-0 flex-1 justify-center"
            >
              <Text className="font-mono text-[11px] text-foreground" numberOfLines={1}>
                {branch?.current ? "✓ " : ""}
                {branch?.name ?? "Detached HEAD"}
                {branch?.merged && !branch.current ? " ✓" : ""}
              </Text>
            </Pressable>
            {ref.worktrees.map((tree) => (
              <Pressable
                key={tree.path}
                accessibilityRole="button"
                accessibilityLabel={`${tree.isMain ? "Main checkout" : "Worktree"}: ${tree.path}`}
                onPress={() => onInspect({ ...ref, worktrees: [tree] })}
                className="h-5 w-5 items-center justify-center"
              >
                <SymbolView
                  name={{
                    ios: tree.isMain ? "folder" : "folder.badge.gearshape",
                    android: "folder",
                  }}
                  size={12}
                  tintColorClassName="accent-foreground"
                />
              </Pressable>
            ))}
          </View>
        );
      })}
      {row.ref && (row.thread || row.settledThreads)
        ? (() => {
            const card = cards.get(row.ref.id)!;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={row.settledThreads ? { expanded: row.expanded } : undefined}
                accessibilityLabel={
                  row.thread
                    ? `Open ${row.thread.settledAt ? "settled" : "unsettled"} thread: ${row.thread.title}`
                    : `Settled (${row.settledThreads?.length})`
                }
                onPress={() => onSelect(row)}
                className="flex-row items-center gap-2 px-2"
                style={{
                  position: "absolute",
                  top: -4,
                  left: card.left,
                  width: card.width,
                  height: GRAPH_ROW_HEIGHT,
                  backgroundColor: `${row.ref.color}0f`,
                  borderBottomLeftRadius: card.lastY === row.y ? 6 : 0,
                  borderBottomRightRadius: card.lastY === row.y ? 6 : 0,
                }}
              >
                {row.thread ? (
                  <SymbolView
                    name={{ ios: "bubble", android: "chat_bubble" }}
                    size={12}
                    tintColorClassName="accent-foreground-muted"
                  />
                ) : null}
                <Text
                  numberOfLines={1}
                  className={
                    row.thread
                      ? "min-w-0 flex-1 text-[11px] text-foreground"
                      : "text-[11px] text-foreground-muted"
                  }
                  style={{ opacity: row.thread ? 0.75 : 0.5 }}
                >
                  {row.thread?.title ?? `Settled (${row.settledThreads?.length})`}
                </Text>
                {row.thread ? (
                  <Text className="text-[10px] text-foreground-muted">
                    {relativeTime(row.thread.latestUserMessageAt ?? row.thread.updatedAt)}
                  </Text>
                ) : (
                  <>
                    <View className="h-px min-w-2 flex-1 bg-border-subtle" />
                    <SymbolView
                      name={{
                        ios: row.expanded ? "chevron.up" : "chevron.down",
                        android: row.expanded ? "keyboard_arrow_up" : "keyboard_arrow_down",
                      }}
                      size={12}
                      tintColorClassName="accent-foreground-muted"
                    />
                  </>
                )}
              </Pressable>
            );
          })()
        : null}
      {row.commit?.historyLabel ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect(row)}
          style={{
            position: "absolute",
            left: 8,
            width: BRANCH_LABEL_WIDTH,
            height: GRAPH_ROW_HEIGHT,
          }}
          className="justify-center px-2"
        >
          <Text numberOfLines={1} className="text-[11px] text-foreground-muted">
            ● {row.commit.historyLabel}
          </Text>
        </Pressable>
      ) : null}
      {row.commit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Inspect ${row.commit.subject}, by ${row.commit.author?.name ?? "Unknown author"}`}
          onPress={() => onSelect(row)}
          style={{
            position: "absolute",
            left: row.commit.x - 22,
            width: 44,
            height: GRAPH_ROW_HEIGHT,
          }}
          className="items-center justify-center"
        >
          <AuthorAvatar node={row.commit} />
        </Pressable>
      ) : null}
      {!row.thread && !row.settledThreads ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect(row)}
          accessibilityLabel={
            row.collapsed
              ? `${row.collapsed.length} commits, ${row.expanded ? "collapse" : "expand"}`
              : graphNodeTitle(node)
          }
          style={{
            position: "absolute",
            left: layout.labelX,
            width: COMMIT_WIDTH,
            height: GRAPH_ROW_HEIGHT,
          }}
          className="flex-row items-center gap-2 px-2"
        >
          <Text className="min-w-0 flex-1 text-xs text-foreground" numberOfLines={1}>
            {row.collapsed
              ? `${row.expanded ? "⌃" : "⌄"} Commits (${row.collapsed.length})`
              : graphNodeTitle(node)}
          </Text>
          {row.commit ? (
            <>
              <Text className="font-mono text-[10px] text-foreground-muted">
                {row.commit.commitId?.slice(0, 8)}
              </Text>
              {row.commit.committedAtEpochSeconds !== undefined ? (
                <Text className="text-[10px] text-foreground-muted">
                  {relativeTime(new Date(row.commit.committedAtEpochSeconds * 1000).toISOString())}
                </Text>
              ) : null}
            </>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
});

function AuthorAvatar({ node }: { node: GraphNode }) {
  const author = useMemo(() => graphAuthorIdentity(node.author), [node.author]);
  const [failed, setFailed] = useState<readonly string[]>([]);
  const direct = [author.avatarUrl, author.gravatarUrl].find((url) => url && !failed.includes(url));
  const email = node.author?.email.trim().toLowerCase() ?? "";
  const [resolved, setResolved] = useState<{ email: string; url: string | null } | null>(null);
  useEffect(() => {
    if (direct || !email) return;
    let active = true;
    void resolveGraphAvatar(email).then((url) => {
      if (active) setResolved({ email, url });
    });
    return () => {
      active = false;
    };
  }, [direct, email]);
  const fallback = resolved?.email === email ? resolved.url : null;
  const url = direct ?? (fallback && !failed.includes(fallback) ? fallback : null);
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: node.color,
        backgroundColor: node.color,
        overflow: "hidden",
      }}
      className="items-center justify-center"
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: 18, height: 18 }}
          onError={() => setFailed((values) => [...values, url])}
        />
      ) : (
        <Text style={{ fontSize: 9, color: "#101018" }}>{author.initials}</Text>
      )}
    </View>
  );
}
