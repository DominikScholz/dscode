import type {
  OrchestrationProjectShell,
  OrchestrationV2ThreadShell,
  ProjectId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface DailyDigestCandidate {
  readonly project: OrchestrationProjectShell;
  /** The project's last digest, or a day back for a project without one. */
  readonly sinceMs: number;
  /** Newest activity first. */
  readonly threads: ReadonlyArray<OrchestrationV2ThreadShell>;
}

function millis(value: DateTime.Utc | null | undefined): number {
  return value == null ? Number.NEGATIVE_INFINITY : DateTime.toEpochMillis(value);
}

export function threadActivityMs(thread: OrchestrationV2ThreadShell): number {
  return Math.max(
    millis(thread.latestUserMessageAt),
    millis(thread.latestRunRequestedAt),
    millis(thread.latestRunCompletedAt),
  );
}

/**
 * Each project's digest window and the threads active in it. Pass archived
 * threads too, so an archived digest still ends the window. Projects without
 * thread activity are still candidates: their commits decide.
 */
export function planDailyDigests(input: {
  readonly projects: ReadonlyArray<OrchestrationProjectShell>;
  readonly threads: ReadonlyArray<OrchestrationV2ThreadShell>;
  readonly nowMs: number;
}): ReadonlyArray<DailyDigestCandidate> {
  const lastDigestMs = new Map<ProjectId, number>();
  for (const thread of input.threads) {
    if (thread.digest !== true || thread.deletedAt !== null) continue;
    const createdMs = DateTime.toEpochMillis(thread.createdAt);
    lastDigestMs.set(
      thread.projectId,
      Math.max(lastDigestMs.get(thread.projectId) ?? 0, createdMs),
    );
  }
  return input.projects.map((project) => {
    const sinceMs = lastDigestMs.get(project.id) ?? input.nowMs - DAY_MS;
    const threads = input.threads
      .filter(
        (thread) =>
          thread.projectId === project.id &&
          thread.digest !== true &&
          thread.deletedAt === null &&
          thread.lineage.relationshipToParent !== "subagent" &&
          threadActivityMs(thread) > sinceMs,
      )
      .toSorted((left, right) => threadActivityMs(right) - threadActivityMs(left));
    return { project, sinceMs, threads };
  });
}

/** In memory: a restart starts the away time over. */
export interface AwayClock {
  readonly awaySinceMs: number | null;
  /** This away stretch already produced its digests. */
  readonly digested: boolean;
}

/** Digests are due once per stretch with no client connected for `awayMs`. */
export function advanceAwayClock(
  clock: AwayClock,
  input: {
    readonly connected: boolean;
    readonly nowMs: number;
    readonly enabled: boolean;
    readonly awayMs: number;
  },
): { readonly clock: AwayClock; readonly due: boolean } {
  if (input.connected) return { clock: { awaySinceMs: null, digested: false }, due: false };
  const awaySinceMs = clock.awaySinceMs ?? input.nowMs;
  const due = input.enabled && !clock.digested && input.nowMs - awaySinceMs >= input.awayMs;
  return { clock: { awaySinceMs, digested: clock.digested || due }, due };
}
