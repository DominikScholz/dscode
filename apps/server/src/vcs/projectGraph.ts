import { GitCommandError, type VcsProjectGraph } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { GitVcsDriver } from "./GitVcsDriver.ts";

const GRAPH_COMMIT_LIMIT = 2_000;

/** Reads local refs only. Remote tracking refs are used solely to identify the default branch. */
export const readProjectGraph = Effect.fn("GitVcsDriver.projectGraph")(function* (
  cwd: string,
  execute: GitVcsDriver["Service"]["execute"],
  commitLimit = GRAPH_COMMIT_LIMIT,
) {
  const run = (args: ReadonlyArray<string>, allowNonZeroExit = false) =>
    execute({
      operation: "GitVcsDriver.projectGraph",
      cwd,
      args,
      allowNonZeroExit,
      timeoutMs: 30_000,
      maxOutputBytes: 16 * 1024 * 1024,
    }).pipe(
      Effect.flatMap((result) =>
        result.stdoutTruncated
          ? Effect.fail(
              new GitCommandError({
                operation: "GitVcsDriver.projectGraph",
                cwd,
                command: "git",
                detail:
                  "The repository graph exceeds the output limit. Refusing to display an incomplete branch inventory.",
              }),
            )
          : Effect.succeed(result),
      ),
    );
  const [refs, worktreeResult, defaultResult, currentResult] = yield* Effect.all(
    [
      run(["for-each-ref", "--format=%(refname:strip=2)%00%(objectname)", "refs/heads"]),
      run(["worktree", "list", "--porcelain", "-z"]),
      run(["symbolic-ref", "refs/remotes/origin/HEAD"], true),
      run(["symbolic-ref", "--short", "HEAD"], true),
    ],
    { concurrency: 2 },
  );
  const heads = refs.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name = "", head = ""] = line.split("\0");
      return { name, head };
    });
  const worktrees: Array<VcsProjectGraph["worktrees"][number]> = [];
  for (const record of worktreeResult.stdout.split("\0\0")) {
    const fields = record.split("\0");
    const worktreePath = fields.find((field) => field.startsWith("worktree "))?.slice(9);
    if (!worktreePath) continue;
    worktrees.push({
      path: worktreePath,
      head: fields.find((field) => field.startsWith("HEAD "))?.slice(5) ?? "",
      branch: fields.find((field) => field.startsWith("branch refs/heads/"))?.slice(18) ?? null,
      isMain: worktrees.length === 0,
      locked: fields.some((field) => field === "locked" || field.startsWith("locked ")),
      prunable: fields.some((field) => field === "prunable" || field.startsWith("prunable ")),
    });
  }
  const worktreeStates = yield* Effect.forEach(
    worktrees,
    (tree) =>
      execute({
        operation: "GitVcsDriver.projectGraph.worktreeStatus",
        cwd: tree.path,
        args: ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=normal"],
        allowNonZeroExit: true,
        timeoutMs: 5_000,
        maxOutputBytes: 64 * 1024,
      }).pipe(
        Effect.map((result) => ({
          ...tree,
          dirty: result.exitCode === 0 ? result.stdout.length > 0 : null,
        })),
        Effect.orElseSucceed(() => ({ ...tree, dirty: null })),
      ),
    { concurrency: 2 },
  );
  const remoteDefault =
    defaultResult.exitCode === 0
      ? defaultResult.stdout.trim().replace(/^refs\/remotes\/origin\//, "")
      : null;
  const candidateDefault =
    remoteDefault ??
    ["main", "master"].find((name) => heads.some((ref) => ref.name === name)) ??
    null;
  const localDefault = heads.find((ref) => ref.name === candidateDefault);
  const remoteBase =
    !localDefault && remoteDefault
      ? yield* run(["rev-parse", "--verify", `refs/remotes/origin/${remoteDefault}^{commit}`], true)
      : null;
  const baseRef =
    localDefault?.head ?? (remoteBase?.exitCode === 0 ? remoteBase.stdout.trim() : null);
  const defaultBranch = baseRef === null ? null : candidateDefault;
  const detachedHeads = worktrees
    .filter(
      (tree) =>
        tree.branch === null && /^[a-f0-9]{40,64}$/.test(tree.head) && !/^0+$/.test(tree.head),
    )
    .map((tree) => tree.head);
  const [mergedResult, history, reflog] = yield* Effect.all(
    [
      baseRef === null
        ? Effect.succeed(null)
        : run(["for-each-ref", `--merged=${baseRef}`, "--format=%(refname:strip=2)", "refs/heads"]),
      heads.length === 0 && detachedHeads.length === 0
        ? Effect.succeed(null)
        : run([
            "log",
            "--branches",
            ...detachedHeads,
            "--topo-order",
            "--parents",
            `--max-count=${commitLimit + 1}`,
            "--format=%H%x00%P%x00%s%x00%aN%x00%aE%x00%ct",
            "--",
          ]),
      heads.length === 0
        ? Effect.succeed(null)
        : run(
            [
              "log",
              "-g",
              "--date=unix",
              "--max-count=20000",
              "--format=%gD%x00%gs",
              ...heads.map((head) => `refs/heads/${head.name}`),
              "--",
            ],
            true,
          ),
    ],
    { concurrency: 2 },
  );
  const origins = new Map<string, string>();
  const creationTimes = new Map<string, number>();
  const aliases = new Map(heads.map((head) => [head.name, head.name]));
  const entries = (reflog?.stdout.split("\n") ?? []).flatMap((line) => {
    const [selector, subject = ""] = line.split("\0");
    const name = selector?.match(/^refs\/heads\/(.+)@\{/u)?.[1];
    if (!name) return [];
    if (subject.startsWith("branch: Created from ")) {
      const timestamp = selector?.match(/@\{(\d+)\}$/u)?.[1];
      if (timestamp && !creationTimes.has(name)) creationTimes.set(name, Number(timestamp));
    }
    const renamed = subject.match(/^Branch: renamed refs\/heads\/(.+) to refs\/heads\/(.+)$/u);
    if (renamed && !aliases.has(renamed[1]!)) aliases.set(renamed[1]!, name);
    return [{ name, subject }];
  });
  for (const { name, subject } of entries) {
    const source = subject
      .match(/^branch: Created from (.+)$/u)?.[1]
      ?.replace(/^refs\/heads\//u, "");
    const origin = source ? aliases.get(source) : undefined;
    if (origin && origin !== name && !origins.has(name)) origins.set(name, origin);
  }
  const merged = new Set(mergedResult?.stdout.trim().split("\n") ?? []);
  const commits = (history?.stdout.trim().split("\n").filter(Boolean) ?? []).map((line) => {
    const [id = "", parents = "", subject = "", name = "", email = "", timestamp = ""] =
      line.split("\0");
    return {
      id,
      parents: parents.split(" ").filter(Boolean),
      subject,
      author: { name, email },
      committedAtEpochSeconds: Math.max(0, Number(timestamp)),
    };
  });
  return {
    defaultBranch,
    branches: heads.map((ref) => ({
      ...ref,
      current: ref.name === currentResult.stdout.trim(),
      ...(origins.has(ref.name) ? { createdFrom: origins.get(ref.name)! } : {}),
      ...(creationTimes.has(ref.name)
        ? { createdAtEpochSeconds: creationTimes.get(ref.name)! }
        : {}),
      merged: baseRef === null ? null : merged.has(ref.name),
    })),
    commits: commits.slice(0, commitLimit),
    worktrees: worktreeStates,
    truncated: commits.length > commitLimit,
  } satisfies VcsProjectGraph;
});
