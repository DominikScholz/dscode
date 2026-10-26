import type { ScopedThreadRef } from "@t3tools/contracts";
import { type ComponentProps, useLayoutEffect } from "react";
import { useIncrementalTimelineEntries } from "../../hooks/useIncrementalTimelineEntries";
import type { TimelineEntriesInput, TimelineEntry } from "../../session-logic";
import { useThreadVisibleTurnItems } from "../../state/entities";
import {
  peekRememberedThreadTimeline,
  rememberReadyThreadTimeline,
  resolveThreadSwitchTimeline,
  timelineHasEphemeralPreviewUrls,
} from "../ChatView.logic";
import { MessagesTimeline } from "./MessagesTimeline";

/**
 * The timeline with the streamed text. ChatView reads the thread through its quiet
 * atoms, which hold through text deltas; this reads the live turn items, so a
 * delta re-renders the timeline without re-rendering ChatView.
 */
export function ThreadTimeline({
  threadDetailRef,
  entriesInput,
  draftEntries,
  activeThreadKey,
  syncing,
  detailLoading,
  readyMarkdownCwd,
  readyWorkspaceRoot,
  pageOnly = false,
  ...timelineProps
}: Omit<ComponentProps<typeof MessagesTimeline>, "timelineEntries"> & {
  /** Null until the thread's detail may load; see resolveThreadDetailRef. */
  threadDetailRef: ScopedThreadRef | null;
  entriesInput: Omit<TimelineEntriesInput, "visibleTurnItems">;
  /** A local draft's optimistic rows; null for a server thread. */
  draftEntries: ReadonlyArray<TimelineEntry> | null;
  activeThreadKey: string | null;
  syncing: boolean;
  detailLoading: boolean;
  readyMarkdownCwd: string | null;
  readyWorkspaceRoot: string | null;
  /** Shows a digest's first turn as just its page and closing reply. */
  pageOnly?: boolean;
}) {
  const visibleTurnItems = useThreadVisibleTurnItems(threadDetailRef);
  const serverEntries = useIncrementalTimelineEntries(activeThreadKey, {
    ...entriesInput,
    visibleTurnItems,
  });
  const entries = draftEntries ?? serverEntries;
  const displayed = resolveThreadSwitchTimeline({
    loading: entries.length === 0 && syncing,
    activeThreadKey,
    nextEntries: entries,
    rememberedForActive: peekRememberedThreadTimeline<typeof entries>(activeThreadKey),
  });
  useLayoutEffect(() => {
    if (detailLoading || entries.length === 0 || timelineHasEphemeralPreviewUrls(entries)) {
      return;
    }
    rememberReadyThreadTimeline({
      threadKey: activeThreadKey,
      entries,
      markdownCwd: readyMarkdownCwd,
      workspaceRoot: readyWorkspaceRoot,
    });
  }, [activeThreadKey, detailLoading, entries, readyMarkdownCwd, readyWorkspaceRoot]);
  const shown = pageOnly ? withoutServerTurn(displayed.entries) : displayed.entries;
  return <MessagesTimeline {...timelineProps} timelineEntries={shown} />;
}

// The server's first turn keeps only its pages and closing reply, so it shows no work fold.
function withoutServerTurn(entries: ReadonlyArray<TimelineEntry>): ReadonlyArray<TimelineEntry> {
  const firstReply = entries.findIndex(
    (entry) =>
      entry.kind === "message" &&
      entry.message.role === "user" &&
      entry.message.createdBy !== "system",
  );
  const serverTurn = firstReply === -1 ? entries : entries.slice(0, firstReply);
  const closingReply = serverTurn.findLast(
    (entry) => entry.kind === "message" && entry.message.role === "assistant",
  );
  const shownServerTurn = serverTurn.filter(
    (entry) => entry.kind === "html-render" || entry.kind === "mcp-app" || entry === closingReply,
  );
  return firstReply === -1 ? shownServerTurn : [...shownServerTurn, ...entries.slice(firstReply)];
}
