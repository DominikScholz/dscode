import * as Schema from "effect/Schema";

import { ThreadId } from "./baseSchemas.ts";

/** Used when the user's own digest instructions are empty. */
export const DEFAULT_DAILY_DIGEST_INSTRUCTIONS = [
  "Lead with the one thing that matters most today.",
  "Then show what needs my decision, what shipped, what is still in progress, and what could bite me: failing checks, unpushed work, open questions.",
  "Link every item to its thread.",
  "End with three to five next moves, most valuable first, that I can start with one click.",
].join(" ");

export const DailyDigestRunNowInput = Schema.Struct({});
export type DailyDigestRunNowInput = typeof DailyDigestRunNowInput.Type;

export const DailyDigestRunNowResult = Schema.Struct({
  threadIds: Schema.Array(ThreadId),
});
export type DailyDigestRunNowResult = typeof DailyDigestRunNowResult.Type;

export class DailyDigestError extends Schema.TaggedError<DailyDigestError>()("DailyDigestError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
