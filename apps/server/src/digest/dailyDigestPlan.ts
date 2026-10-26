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

/** A digest covers from the project's previous digest, or a day back, to its own start. */
export function digestWindow(
  digest: Pick<OrchestrationV2ThreadShell, "id" | "projectId" | "createdAt">,
  threads: ReadonlyArray<OrchestrationV2ThreadShell>,
): { readonly sinceMs: number; readonly untilMs: number } {
  const untilMs = DateTime.toEpochMillis(digest.createdAt);
  let sinceMs = untilMs - DAY_MS;
  for (const thread of threads) {
    if (thread.digest !== true || thread.id === digest.id || thread.projectId !== digest.projectId)
      continue;
    const createdMs = DateTime.toEpochMillis(thread.createdAt);
    if (createdMs < untilMs && createdMs > sinceMs) sinceMs = createdMs;
  }
  return { sinceMs, untilMs };
}

/** Counts commit times into `slots` even buckets across the window. */
export function bucketActivity(
  commitTimesMs: ReadonlyArray<number>,
  window: { readonly sinceMs: number; readonly untilMs: number },
  slots = 48,
): ReadonlyArray<number> {
  const buckets = Array.from({ length: slots }, () => 0);
  const span = Math.max(1, window.untilMs - window.sinceMs);
  for (const time of commitTimesMs) {
    if (time < window.sinceMs || time > window.untilMs) continue;
    const index = Math.min(slots - 1, Math.floor(((time - window.sinceMs) / span) * slots));
    buckets[index] = (buckets[index] ?? 0) + 1;
  }
  return buckets;
}

const LIVE_STATUSES: ReadonlySet<string> = new Set([
  "running",
  "preparing",
  "starting",
  "queued",
  "waiting",
]);

/** Main threads of the digest's project that ran in the window or are still running, newest first. */
export function windowThreads(
  digest: Pick<OrchestrationV2ThreadShell, "projectId">,
  threads: ReadonlyArray<OrchestrationV2ThreadShell>,
  window: { readonly sinceMs: number; readonly untilMs: number },
): ReadonlyArray<OrchestrationV2ThreadShell> {
  return threads
    .filter(
      (thread) =>
        thread.projectId === digest.projectId &&
        thread.digest !== true &&
        thread.deletedAt === null &&
        thread.lineage.relationshipToParent !== "subagent" &&
        (LIVE_STATUSES.has(thread.status) ||
          (threadActivityMs(thread) > window.sinceMs &&
            threadActivityMs(thread) <= window.untilMs)),
    )
    .toSorted((left, right) => threadActivityMs(right) - threadActivityMs(left));
}

/** A window thread as the digest's thread list shows it, mirroring its sidebar row. */
export function digestThreadEntry(thread: OrchestrationV2ThreadShell) {
  const instance = thread.providerInstanceId.toLowerCase();
  const provider = instance.includes("claude")
    ? ("claude" as const)
    : instance.includes("codex") || instance.includes("openai")
      ? ("openai" as const)
      : undefined;
  const done =
    thread.status === "completed" &&
    millis(thread.latestRunCompletedAt) > millis(thread.lastVisitedAt);
  return {
    id: thread.id,
    title: thread.title,
    status: thread.status,
    activityMs: threadActivityMs(thread),
    ...(thread.branch === null ? {} : { branch: thread.branch }),
    ...(provider === undefined ? {} : { provider }),
    ...(done ? { done } : {}),
  };
}

const branchName = (ref: string) => ref.replace(/^refs\/heads\//, "");

/** Lines of `git log --source --format=%h%x1f%ct%x1f%S%x1f%s`, newest first. */
export function parseCommitLog(lines: ReadonlyArray<string>) {
  return lines.flatMap((line) => {
    const [hash, seconds, ref, ...subject] = line.split("\x1f");
    const timeMs = Number(seconds) * 1_000;
    if (!hash || !Number.isFinite(timeMs)) return [];
    return [
      {
        hash,
        timeMs,
        subject: subject.join("\x1f").trim() || hash,
        ...(ref ? { branch: branchName(ref) } : {}),
      },
    ];
  });
}

/** Lines of `git status --short`: the two status letters and the path, renames by their new name. */
export function parseStatusLines(lines: ReadonlyArray<string>) {
  return lines.flatMap((line) => {
    if (line.length < 4) return [];
    const path = line.slice(3).split(" -> ").at(-1)?.trim() ?? "";
    return path === "" ? [] : [{ status: line.slice(0, 2).trim() || "?", path }];
  });
}

/** Lines of `git log --source --format=%S`: commits counted per branch, most first. */
export function countByBranch(refs: ReadonlyArray<string>) {
  const counts = new Map<string, number>();
  for (const ref of refs) {
    const branch = branchName(ref.trim());
    if (branch !== "") counts.set(branch, (counts.get(branch) ?? 0) + 1);
  }
  return [...counts]
    .map(([branch, count]) => ({ branch, count }))
    .toSorted((left, right) => right.count - left.count);
}
