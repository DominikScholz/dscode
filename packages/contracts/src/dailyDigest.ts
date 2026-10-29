import * as Schema from "effect/Schema";

import { EnvironmentId, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProjectIconColor } from "./project.ts";

/** Used when the user's own digest instructions are empty. */
export const DEFAULT_DAILY_DIGEST_INSTRUCTIONS = [
  "Tell me what happened and how we should proceed.",
  "Lead with the one thing that matters most today, then each workstream and where it stands, with any problem I should know about next to it.",
  "Finish with the decisions only I can make and up to three next moves, most valuable first, that I can start with one click.",
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
    description:
      "Three to six words on the day overall, such as 'Strong day, two branches at risk'.",
  }),
  headline: Text(140).annotate({
    description: "One plain sentence, at most 16 words: what matters most today.",
  }),
  summary: Text(360).annotate({
    description: "One short sentence that adds to the headline rather than restating it.",
  }),
  visuals: Schema.Array(
    Schema.Union([
      Schema.Struct({
        kind: Schema.Literal("image"),
        title: Text(60).annotate({ description: "Alt text; the page shows only the image." }),
        caption: Schema.optional(Text(160)),
        path: Text(1024).annotate({
          description:
            "Absolute image path on the project's machine. Remote images also need threadId.",
        }),
        threadId: Schema.optional(Text(200)),
      }),
      Schema.Struct({
        kind: Schema.Literal("bars"),
        title: Text(60).annotate({ description: "Under 40 characters." }),
        caption: Schema.optional(Text(160)).annotate({ description: "One line naming the setup." }),
        unit: Schema.optional(Text(12)),
        items: Schema.Array(
          Schema.Struct({
            label: Text(40).annotate({ description: "Under 20 characters." }),
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
        "At most three: lead with the screenshot that best shows the day's result, then small bars charts only when numbers are the story.",
    }),
  facts: Schema.Array(Schema.Struct({ label: Text(28), value: Text(16) }))
    .check(Schema.isMaxLength(4))
    .annotate({
      description:
        "At most two numbers beside the page's repository counts, labels under 16 characters; usually none.",
    }),
  sections: Schema.Array(
    Schema.Struct({
      title: Text(60).annotate({ description: "Under 40 characters." }),
      status: Schema.Literals(DAILY_DIGEST_STATUSES),
      summary: Text(200).annotate({ description: "Under 12 words on what changed." }),
      issue: Schema.optional(Text(110)).annotate({
        description:
          "At most six words on a problem to act on, such as unpushed work or a failing check.",
      }),
      threadId: Schema.optional(Text(200)),
    }),
  )
    .check(Schema.isMaxLength(8))
    .annotate({ description: "What happened: at most four workstreams, most important first." }),
  decisions: Schema.Array(
    Schema.Struct({
      question: Text(110).annotate({ description: "Under 45 characters." }),
      context: Text(200).annotate({ description: "Under 12 words." }),
      threadId: Schema.optional(Text(200)),
      prompt: Schema.optional(Text(2000)).annotate({
        description: "Put in that thread's composer when the reader opens it.",
      }),
    }),
  )
    .check(Schema.isMaxLength(5))
    .annotate({ description: "At most two decisions only the reader can make. Usually empty." }),
  nextSteps: Schema.Array(
    Schema.Struct({
      title: Text(80).annotate({ description: "Verb first, under 40 characters." }),
      reason: Text(140).annotate({ description: "Under 12 words." }),
      prompt: Text(4000).annotate({
        description: "A complete task for a new thread in this project.",
      }),
    }),
  )
    .check(Schema.isMaxLength(5))
    .annotate({ description: "At most three, most valuable first." }),
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
  /** Set when the project lives on another machine: its threads, images, and new threads are there. */
  remote: Schema.optional(Schema.Struct({ machine: Schema.String, projectId: Schema.String })),
  monogram: Schema.optional(Schema.Struct({ text: Schema.String, color: ProjectIconColor })),
});
export type DailyDigestPageContext = typeof DailyDigestPageContext.Type;

export const DailyDigestRemoteSource = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
  projectTitle: TrimmedNonEmptyString,
  machine: TrimmedNonEmptyString,
  toolPrefix: TrimmedNonEmptyString.annotate({
    description: "The connected MCP tool namespace for this machine.",
  }),
});
export type DailyDigestRemoteSource = typeof DailyDigestRemoteSource.Type;

export const DailyDigestStartRemoteInput = Schema.Struct({
  source: DailyDigestRemoteSource,
  latestActivityMs: Schema.NullOr(Schema.Number).annotate({
    description:
      "Latest non-digest thread activity in this project, as epoch milliseconds; null if there are no threads.",
  }),
});
export type DailyDigestStartRemoteInput = typeof DailyDigestStartRemoteInput.Type;

export const DailyDigestPublishInput = Schema.Struct({
  ...DailyDigestPageContent.fields,
  threads: Schema.optional(DailyDigestPageContext.fields.threads).annotate({
    description:
      "For remote digests, the source project's main threads active in the requested window, from its T3 tools.",
  }),
});
export type DailyDigestPublishInput = typeof DailyDigestPublishInput.Type;

/** Everything a digest page renders from, kept beside it so it re-renders with today's template. */
export const DailyDigestPageSnapshot = Schema.Struct({
  content: DailyDigestPageContent,
  context: DailyDigestPageContext,
  /** Image visuals' data URIs by path, since the files may be gone by the next render. */
  images: Schema.Record(Schema.String, Schema.String),
});
export type DailyDigestPageSnapshot = typeof DailyDigestPageSnapshot.Type;
