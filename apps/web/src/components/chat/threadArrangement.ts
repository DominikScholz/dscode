import * as Schema from "effect/Schema";

import { useLocalStorage } from "../../hooks/useLocalStorage";

/**
 * Where a thread's workspace context (environment, branch) and actions (open in,
 * run, git) live:
 * - card: the floating details card over the chat.
 * - toolbar: actions in the top bar, context in the strip under the composer.
 * - dock: context and actions together on the composer's strip.
 */
export const THREAD_ARRANGEMENTS = ["card", "toolbar", "dock"] as const;
export type ThreadArrangement = (typeof THREAD_ARRANGEMENTS)[number];

export const THREAD_ARRANGEMENT_LABELS: Record<ThreadArrangement, string> = {
  card: "Details card",
  toolbar: "Top bar",
  dock: "Composer dock",
};

const THREAD_ARRANGEMENT_KEY = "t3code:thread-arrangement";
const ThreadArrangementSchema = Schema.Literals(THREAD_ARRANGEMENTS);
const DEFAULT_THREAD_ARRANGEMENT: ThreadArrangement = "card";

export function useThreadArrangement() {
  return useLocalStorage(
    THREAD_ARRANGEMENT_KEY,
    DEFAULT_THREAD_ARRANGEMENT,
    ThreadArrangementSchema,
  );
}
