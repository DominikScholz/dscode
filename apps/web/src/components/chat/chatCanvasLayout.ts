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
// Minimum space between chat and the workspace card. Chat stays centered while
// the card fits beside it with this much room.
export const DETAILS_CARD_CLEARANCE = 32;

/** Pure geometry shared by the conversation, composer, workspace card, and floating preview. */
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
  /** The open find bar. It only keeps the floating preview clear; chat stays put. */
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
  // The sidebar and a workspace card that do not fit beside the centered chat
  // first move chat aside, only as far as they need. Chat narrows only after
  // it reaches the other side.
  const laneRight = detailsCard
    ? detailsCard.left - DETAILS_CARD_CLEARANCE
    : container.width - padding;
  const normalWidth = Math.max(0, Math.min(centeredWidth, laneRight - laneStart));
  const normalLeft = Math.max(
    laneStart,
    Math.min((container.width - normalWidth) / 2, laneRight - normalWidth),
  );
  let chat = placeChat(normalLeft, normalWidth);
  let frame: PreviewMiniPlayerFrame | null = null;
  let overlapsChat = false;
  if (preview && container.width > 0 && container.height > 0) {
    frame = resolvePreviewMiniPlayerFrame({ ...preview, container });
    // Reserve a readable chat lane only while it leaves room to drag. Otherwise
    // the container's right edge would pin the preview at every pointer position.
    const minimumPreviewX =
      preview.lastInteraction === "resize" ||
      container.width <= laneStart + minChatWidth + frame.width + GAP * 2
        ? GAP
        : laneStart + minChatWidth + GAP;
    // New players start beside the composer, with the workspace card above them.
    if (preview.position === null) frame = { ...frame, y: container.height - frame.height - GAP };
    if (preview.lastInteraction === "resize" && composerHeight > 0) {
      // Lift the preview while chat uses its remaining shrink room, reaching
      // the composer's top before the preview enters the readable chat lane.
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
    // A resize keeps its anchored edge and consumes card height first. A drag
    // clears the full card whenever it can, so moving alone never folds it.
    // The find bar can be wider than the inline card when the root font is enlarged.
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
    // Clearing the full card must also leave a readable chat. If only the
    // preferred position does, keep the resized player and let the card fold.
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
      // If the full card and composer leave no slot, keep typing usable while
      // the card folds to the remaining height above this fallback frame.
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
