import * as Schema from "effect/Schema";

import { ThreadId } from "./baseSchemas.ts";
import { ProjectIconColor } from "./project.ts";

/** Used when the user's own digest instructions are empty. */
export const DEFAULT_DAILY_DIGEST_INSTRUCTIONS = [
  "Tell me what happened and how we should proceed.",
  "Lead with the one thing that matters most today, then each workstream and where it stands, with any problem I should know about next to it.",
  "Finish with the decisions only I can make and three to five next moves, most valuable first, that I can start with one click.",
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

const Text = (max: number) => Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(max));

export const DAILY_DIGEST_STATUSES = [
  "shipped",
  "in_progress",
  "blocked",
  "research",
  "idle",
] as const;

export const DailyDigestPageContent = Schema.Struct({
  mood: Text(48).annotate({
    description: "A few words on the day overall, such as 'Strong day, two branches at risk'.",
  }),
  headline: Text(140).annotate({
    description: "One plain sentence, at most 20 words: what matters most today.",
  }),
  summary: Text(360).annotate({ description: "Two short sentences on what moved." }),
  visuals: Schema.Array(
    Schema.Union([
      Schema.Struct({
        kind: Schema.Literal("image"),
        title: Text(60),
        caption: Schema.optional(Text(160)),
        path: Text(1024).annotate({
          description: "Absolute path to a png, jpg, gif, or webp on this machine.",
        }),
        threadId: Schema.optional(Text(200)),
      }),
      Schema.Struct({
        kind: Schema.Literal("bars"),
        title: Text(60),
        caption: Schema.optional(Text(160)),
        unit: Schema.optional(Text(12)),
        items: Schema.Array(
          Schema.Struct({
            label: Text(40),
            value: Schema.Number,
            highlight: Schema.optional(Schema.Boolean),
          }),
        ).check(Schema.isMinLength(2), Schema.isMaxLength(8)),
        threadId: Schema.optional(Text(200)),
      }),
    ]),
  )
    .check(Schema.isMaxLength(4))
    .annotate({
      description:
        "The most telling visuals, first is the largest: images from the threads, or a bars comparison of numbers from them.",
    }),
  facts: Schema.Array(Schema.Struct({ label: Text(28), value: Text(16) }))
    .check(Schema.isMaxLength(4))
    .annotate({ description: "Up to four numbers that describe the window, besides commits." }),
  sections: Schema.Array(
    Schema.Struct({
      title: Text(60),
      status: Schema.Literals(DAILY_DIGEST_STATUSES),
      summary: Text(200).annotate({ description: "One short sentence on what changed." }),
      issue: Schema.optional(Text(110)).annotate({
        description: "A problem worth knowing here, such as unpushed work or a failing check.",
      }),
      threadId: Schema.optional(Text(200)),
    }),
  )
    .check(Schema.isMaxLength(8))
    .annotate({ description: "What happened: one per workstream, most important first." }),
  decisions: Schema.Array(
    Schema.Struct({
      question: Text(110),
      context: Text(200),
      threadId: Schema.optional(Text(200)),
      prompt: Schema.optional(Text(2000)).annotate({
        description: "Put in that thread's composer when the reader opens it.",
      }),
    }),
  )
    .check(Schema.isMaxLength(5))
    .annotate({ description: "Decisions only the reader can make. Empty when there are none." }),
  nextSteps: Schema.Array(
    Schema.Struct({
      title: Text(80),
      reason: Text(140),
      prompt: Text(4000).annotate({
        description: "A complete task for a new thread in this project.",
      }),
    }),
  )
    .check(Schema.isMaxLength(5))
    .annotate({ description: "Three to five, most valuable first." }),
});
export type DailyDigestPageContent = typeof DailyDigestPageContent.Type;

export const DailyDigestPageContext = Schema.Struct({
  projectTitle: Schema.String,
  environmentId: Schema.String,
  sinceMs: Schema.Number,
  untilMs: Schema.Number,
  /** Commit counts in even slots across the window. */
  activity: Schema.Array(Schema.Number),
  /** Main threads that were active in the window, newest first. */
  threads: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      status: Schema.String,
      activityMs: Schema.Number,
      branch: Schema.optional(Schema.String),
      provider: Schema.optional(Schema.Literals(["claude", "openai"])),
      /** Finished since the reader last opened it, which the sidebar marks Done. */
      done: Schema.optional(Schema.Boolean),
    }),
  ),
  /** The window's commits on local branches, newest first, capped; activity has the full count. */
  commits: Schema.optional(
    Schema.Array(
      Schema.Struct({
        hash: Schema.String,
        subject: Schema.String,
        timeMs: Schema.Number,
        branch: Schema.optional(Schema.String),
      }),
    ),
  ),
  /** Measured from the checkout when the digest was written. */
  repo: Schema.optional(
    Schema.Struct({
      uncommittedFiles: Schema.Number,
      unpushedCommits: Schema.Number,
      files: Schema.optional(
        Schema.Array(Schema.Struct({ status: Schema.String, path: Schema.String })),
      ),
      unpushedBranches: Schema.optional(
        Schema.Array(Schema.Struct({ branch: Schema.String, count: Schema.Number })),
      ),
    }),
  ),
  timeZone: Schema.optional(Schema.String),
  /** The project's icon as the app shows it; without one, the monogram from its title. */
  icon: Schema.optional(Schema.String),
  emoji: Schema.optional(Schema.String),
  monogram: Schema.optional(Schema.Struct({ text: Schema.String, color: ProjectIconColor })),
});
export type DailyDigestPageContext = typeof DailyDigestPageContext.Type;

/** Everything a digest page renders from, kept beside it so it re-renders with today's template. */
export const DailyDigestPageSnapshot = Schema.Struct({
  content: DailyDigestPageContent,
  context: DailyDigestPageContext,
  /** Image visuals' data URIs by path, since the files may be gone by the next render. */
  images: Schema.Record(Schema.String, Schema.String),
});
export type DailyDigestPageSnapshot = typeof DailyDigestPageSnapshot.Type;
