import {
  DailyDigestRemoteSource,
  type DailyDigestStartRemoteInput,
  type OrchestrationV2ThreadShell,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

export const RemoteDigestJob = Schema.Struct({
  source: DailyDigestRemoteSource,
  sinceMs: Schema.Number,
  untilMs: Schema.Number,
  published: Schema.Boolean,
});
export type RemoteDigestJob = typeof RemoteDigestJob.Type;
export const RemoteDigestJobs = Schema.Record(ThreadId, RemoteDigestJob);
export type RemoteDigestJobs = typeof RemoteDigestJobs.Type;

export function planRemoteDigest(
  input: DailyDigestStartRemoteInput,
  jobs: RemoteDigestJobs,
  threads: ReadonlyArray<Pick<OrchestrationV2ThreadShell, "id" | "status" | "deletedAt">>,
  nowMs: number,
) {
  let sinceMs: number | undefined;
  let retrySinceMs: number | undefined;
  for (const [id, job] of Object.entries(jobs)) {
    if (
      job.source.environmentId !== input.source.environmentId ||
      job.source.projectId !== input.source.projectId
    )
      continue;
    const thread = threads.find((thread) => thread.id === id && thread.deletedAt === null);
    if (
      thread &&
      ["idle", "preparing", "queued", "starting", "running", "waiting"].includes(thread.status) &&
      !job.published
    ) {
      return null;
    }
    if (job.published) sinceMs = Math.max(sinceMs ?? 0, job.untilMs);
    else retrySinceMs = Math.min(retrySinceMs ?? job.sinceMs, job.sinceMs);
  }
  if (
    sinceMs !== undefined &&
    (input.latestActivityMs === null || input.latestActivityMs <= sinceMs)
  )
    return null;
  return { sinceMs: sinceMs ?? retrySinceMs ?? nowMs - 24 * 60 * 60 * 1_000, untilMs: nowMs };
}
