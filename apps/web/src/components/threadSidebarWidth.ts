export const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_DEFAULT_WIDTH = 16 * 16;
export const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
export const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;
// The main panel width at which the chat starts to narrow: its default width
// plus padding on both sides. Below it, sidebar and chat shrink together.
const THREAD_MAIN_CONTENT_COMFORT_WIDTH = 52 * 16;

// The brand's measured width can raise the minimum so "T3 Code" never clips.
export function resolveThreadSidebarMinimumWidth(brandWidth: number): number {
  return Math.max(THREAD_SIDEBAR_MIN_WIDTH, Math.ceil(brandWidth));
}

export function resolveThreadSidebarMaximumWidth(
  viewportWidth: number,
  minimumWidth = THREAD_SIDEBAR_MIN_WIDTH,
): number {
  return Math.max(minimumWidth, Math.floor(viewportWidth) - THREAD_MAIN_CONTENT_MIN_WIDTH);
}

export function clampThreadSidebarWidth(
  width: number,
  minimumWidth: number,
  maximumWidth: number,
): number {
  return Math.min(maximumWidth, Math.max(minimumWidth, width));
}

/** The stored width is a preference: what the sidebar takes when the window has room. */
export function resolveInitialThreadSidebarWidth(storedWidth: number | null): number {
  return storedWidth === null
    ? THREAD_SIDEBAR_DEFAULT_WIDTH
    : Math.max(THREAD_SIDEBAR_MIN_WIDTH, storedWidth);
}

/**
 * Once sidebar and main panel no longer fit side by side in `availableWidth`,
 * the sidebar gives up half of every missing pixel and the chat the other half.
 */
export function resolveThreadSidebarFitWidth(
  preferredWidth: number,
  availableWidth: number,
): number {
  const missing = Math.max(0, preferredWidth + THREAD_MAIN_CONTENT_COMFORT_WIDTH - availableWidth);
  return preferredWidth - missing / 2;
}

/** The inverse of the fit: the preference that shows `width` at `availableWidth`. */
export function resolveThreadSidebarPreferredWidth(width: number, availableWidth: number): number {
  return width + Math.max(0, width + THREAD_MAIN_CONTENT_COMFORT_WIDTH - availableWidth);
}
