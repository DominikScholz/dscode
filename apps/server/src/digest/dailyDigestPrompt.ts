import { DEFAULT_DAILY_DIGEST_INSTRUCTIONS } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type { DailyDigestCandidate } from "./dailyDigestPlan.ts";
import { threadActivityMs } from "./dailyDigestPlan.ts";

const MAX_LISTED_THREADS = 40;

export const isoAt = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));

export function dailyDigestPrompt(input: {
  readonly candidate: DailyDigestCandidate;
  readonly nowMs: number;
  readonly instructions: string;
}): string {
  const { project, sinceMs, threads } = input.candidate;
  const since = isoAt(sinceMs);
  const listed = threads.slice(0, MAX_LISTED_THREADS).map((thread) => {
    const activity = isoAt(threadActivityMs(thread));
    return `- "${thread.title}" (thread ${thread.id}, ${thread.status}, last active ${activity})`;
  });
  if (threads.length > listed.length) {
    listed.push(`- …and ${threads.length - listed.length} more; find them with t3_thread_list.`);
  }
  return [
    `Write the daily digest for the project "${project.title}", covering ${since} to ${isoAt(input.nowMs)}.`,
    "",
    listed.length === 0 ? "No threads had activity in that window." : "Threads with activity:",
    ...listed,
    "",
    `Commits on local branches: \`git log --branches --since="${since}"\`.`,
    "",
    "How to write it:",
    "- Only read. Use t3_thread_read for the threads, git for history, and existing CI results for checks. Do not edit files, run builds or test suites, commit, push, or start threads.",
    "- Digests for other projects run at the same time. Keep scratch files in your own directory from `mktemp -d`, never a shared path.",
    "- Publish with digest_publish, once, when you have read everything. Its design, title, activity chart, and links are fixed: you write only the content, never HTML. Do not use html_render.",
    "- Write little: the reader skims this in a minute. headline: one plain sentence of at most 20 words on what matters most today. summary: two or three short sentences on what moved.",
    "- facts: up to four numbers that describe the window besides commits, such as threads, merged pull requests, unpushed branches, or decisions waiting.",
    "- sections are what happened: one per workstream (a thread, a branch, or commits with one purpose), most important first. Pick the status that fits, keep the summary to one or two short sentences, add up to three short points only when they help, put any problem worth knowing (unpushed work, a failing check, an open risk) in issue, and set threadId when a thread holds the work.",
    "- decisions are what only the reader can decide, each with the threadId where it is discussed and a prompt that starts their answer. Leave it empty when nothing waits on them.",
    "- nextSteps are how to proceed: three to five, most valuable first, each with a verb-first title, a one-sentence reason, and a prompt that is a complete task for a new thread in this project.",
    "- Copy: sentence case, plain verbs, no filler, no emoji. Wrap code, branch names, and paths in backticks.",
    "- After publishing, reply with one short line. Do not restate the page.",
    "",
    "The reader's instructions for the digest:",
    input.instructions.trim() || DEFAULT_DAILY_DIGEST_INSTRUCTIONS,
  ].join("\n");
}
