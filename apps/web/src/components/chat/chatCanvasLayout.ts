import {
  clampPreviewMiniPlayerPosition,
  resolvePreviewMiniPlayerFrame,
  type PreviewMiniPlayerFrame,
  type PreviewMiniPlayerObstacles,
} from "../preview/previewMiniPlayerLayout";
import type {
  PreviewMiniPlayerPosition,
  PreviewMiniPlayerSize,
  PreviewMiniPlayerState,
} from "~/previewMiniPlayerStore";

export interface ChatCanvasPreview {
  readonly key: string;
  readonly width: number | null;
  readonly position: PreviewMiniPlayerPosition | null;
  readonly source: PreviewMiniPlayerSize;
  readonly lastInteraction?: PreviewMiniPlayerState["lastInteraction"];
}

const GAP = 12;
export const DETAILS_CARD_CLEARANCE = 32;

export function resolveChatCanvasLayout({
  container,
  preview,
  padding = 48,
  laneStart = padding,
  maxChatWidth = 768,
  minChatWidth = 640,
  composerHeight = 0,
  detailsCard = null,
  findBar = null,
}: {
  container: PreviewMiniPlayerSize;
  preview: ChatCanvasPreview | null;
  padding?: number;
  /** Where chat may start: the padding past the thread sidebar, which covers the canvas's left edge. */
  laneStart?: number;
  maxChatWidth?: number;
  minChatWidth?: number;
  composerHeight?: number;
  detailsCard?: PreviewMiniPlayerObstacles["detailsCard"];
  findBar?: PreviewMiniPlayerObstacles["detailsCard"];
}) {
  // The lane pads both sides and centers chat in what remains. A full-width
  // chat leaves one side open and lets its max width do the narrowing; a
  // narrower one is pinned on both sides.
  const placeChat = (left: number, width: number) => {
    if (width >= maxChatWidth) {
      const shift = left * 2 + width - container.width;
      return { left, width, insetStart: Math.max(0, shift), insetEnd: Math.max(0, -shift) };
    }
    return {
      left,
      width,
      insetStart: Math.max(0, left - padding),
      insetEnd: Math.max(0, container.width - padding - left - width),
    };
  };
  const centeredWidth = Math.max(0, Math.min(maxChatWidth, container.width - padding * 2));
  const laneRight = detailsCard
    ? detailsCard.left - DETAILS_CARD_CLEARANCE
    : container.width - padding;
  // Clear of the sidebar, chat narrows only to a readable width. In a smaller
  // window it slides under the sidebar instead.
  const clearStart = Math.max(
    padding,
    Math.min(laneStart, laneRight - Math.min(centeredWidth, minChatWidth)),
  );
  const normalWidth = Math.max(0, Math.min(centeredWidth, laneRight - clearStart));
  const normalLeft = Math.max(
    clearStart,
    Math.min((container.width - normalWidth) / 2, laneRight - normalWidth),
  );
  let chat = placeChat(normalLeft, normalWidth);
  let frame: PreviewMiniPlayerFrame | null = null;
  let overlapsChat = false;
  if (preview && container.width > 0 && container.height > 0) {
    frame = resolvePreviewMiniPlayerFrame({ ...preview, container });
    // Reserve a chat lane only if the preview still has room to drag.
    const minimumPreviewX =
      preview.lastInteraction === "resize" ||
      container.width <= laneStart + minChatWidth + frame.width + GAP * 2
        ? GAP
        : laneStart + minChatWidth + GAP;
    if (preview.position === null) frame = { ...frame, y: container.height - frame.height - GAP };
    if (preview.lastInteraction === "resize" && composerHeight > 0) {
      const laneWidth = Math.min(normalWidth, minChatWidth);
      const transitionWidth = Math.max(GAP, normalWidth - laneWidth);
      const lift = Math.min(
        1,
        Math.max(0, (laneStart + normalWidth + GAP - frame.x) / transitionWidth),
      );
      if (lift > 0) {
        frame = resolvePreviewMiniPlayerFrame({
          width: frame.width,
          position: frame,
          source: preview.source,
          container: {
            ...container,
            height: Math.max(GAP * 2 + 1, container.height - composerHeight * lift),
          },
        });
      }
    }
    const findBarObstacles = findBar ? { detailsCard: findBar, composer: null } : undefined;
    const preferredFrame = {
      ...frame,
      ...clampPreviewMiniPlayerPosition(frame, container, frame, findBarObstacles, minimumPreviewX),
    };
    const dragObstacle =
      detailsCard && findBar
        ? {
            left: Math.min(detailsCard.left, findBar.left),
            right: Math.max(detailsCard.right, findBar.right),
            bottom: Math.max(detailsCard.bottom, findBar.bottom),
          }
        : (detailsCard ?? findBar);
    const cardObstacle = preview.lastInteraction === "resize" ? findBar : dragObstacle;
    frame = {
      ...frame,
      ...clampPreviewMiniPlayerPosition(
        frame,
        container,
        frame,
        { detailsCard: cardObstacle, composer: null },
        minimumPreviewX,
      ),
    };
    const chatBeside = (player: PreviewMiniPlayerFrame) => {
      const normalRight = normalLeft + normalWidth;
      if (player.x >= normalRight + GAP) return chat;
      const width = Math.min(maxChatWidth, player.x - GAP - laneStart);
      if (width < minChatWidth) return null;
      return placeChat(Math.min(normalLeft, player.x - GAP - width), width);
    };
    let nextChat = chatBeside(frame);
    if (!nextChat && detailsCard) {
      nextChat = chatBeside(preferredFrame);
      if (nextChat) frame = preferredFrame;
    }
    if (nextChat) chat = nextChat;
    else overlapsChat = true;
    if (overlapsChat && preview.lastInteraction === "resize") {
      chat = placeChat(laneStart, Math.min(normalWidth, minChatWidth));
    } else if (overlapsChat) {
      const obstacles = {
        detailsCard: cardObstacle,
        composer: { left: chat.left, right: chat.left + chat.width, height: composerHeight },
      };
      frame = resolvePreviewMiniPlayerFrame({ ...preview, container, obstacles });
      frame = {
        ...frame,
        ...clampPreviewMiniPlayerPosition(
          preview.position ?? { x: frame.x, y: container.height - frame.height - GAP },
          container,
          frame,
          obstacles,
          minimumPreviewX,
        ),
      };
      if (
        frame.x < obstacles.composer.right &&
        frame.x + frame.width > obstacles.composer.left &&
        frame.y + frame.height > container.height - composerHeight
      ) {
        frame = {
          ...frame,
          ...clampPreviewMiniPlayerPosition(
            frame,
            container,
            frame,
            { composer: obstacles.composer, detailsCard: findBar },
            minimumPreviewX,
          ),
        };
      }
    }
  }
  const overlapsDetailsCard = Boolean(
    frame &&
    detailsCard &&
    frame.x < detailsCard.right &&
    frame.x + frame.width > detailsCard.left &&
    frame.y < detailsCard.bottom,
  );
  return { chat, frame, overlapsChat, overlapsDetailsCard };
}
