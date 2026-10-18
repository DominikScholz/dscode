import type { layoutProjectGraph } from "@t3tools/client-runtime/project-graph";

export type GraphLayout = ReturnType<typeof layoutProjectGraph>;
export type GraphRow = GraphLayout["rows"][number];

export function rowSearchText(row: GraphRow) {
  return [
    row.thread?.title,
    row.commit?.subject,
    row.commit?.commitId,
    row.commit?.author?.name,
    row.commit?.author?.email,
    row.ref?.id,
    row.ref?.commitId,
    row.ref?.subject,
    ...[...(row.refs ?? []), ...(row.ref ? [row.ref] : [])].flatMap((ref) => [
      ...(row.thread ? [] : (row.settledThreads ?? ref.threads).map((thread) => thread.title)),
      ...ref.branches.map((branch) => branch.name),
      ...ref.worktrees.map((tree) => tree.path),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function graphNodeTitle(node: GraphLayout["nodes"][number] | undefined) {
  if (!node) return "History";
  if (node.kind === "ref" || (node.kind === "orphan" && !node.id.startsWith("missing-")))
    return node.worktrees.some((tree) => tree.dirty)
      ? "Uncommitted changes"
      : node.commitId
        ? node.subject
        : "No commits yet";
  return node.subject;
}

export function graphRowMatches(row: GraphRow, search: string, unsettledOnly: boolean) {
  const refs = row.refs ?? (row.ref ? [row.ref] : []);
  return (
    (!search || rowSearchText(row).includes(search.trim().toLowerCase())) &&
    (!unsettledOnly ||
      (row.thread
        ? row.thread.settledAt === null
        : refs.some((ref) => ref.threads.some((thread) => thread.settledAt === null))))
  );
}

export function branchStatus(
  branch: GraphLayout["nodes"][number]["branches"][number],
  defaultBranch: string | null,
) {
  if (branch.name === defaultBranch) return "Default branch";
  if (branch.merged === true) return defaultBranch ? `Merged into ${defaultBranch}` : "Merged";
  if (branch.merged === false)
    return defaultBranch ? `Not merged into ${defaultBranch}` : "Not merged";
  return "Merge status unknown";
}
