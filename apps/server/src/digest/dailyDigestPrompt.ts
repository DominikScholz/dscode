import { DEFAULT_DAILY_DIGEST_INSTRUCTIONS, type EnvironmentId } from "@t3tools/contracts";
import { HTML_RENDER_TOOL_NAME } from "@t3tools/shared/htmlRender";
import * as DateTime from "effect/DateTime";

import type { DailyDigestCandidate } from "./dailyDigestPlan.ts";
import { threadActivityMs } from "./dailyDigestPlan.ts";
import { DAILY_DIGEST_DESIGN } from "./dailyDigestDesign.ts";

const MAX_LISTED_THREADS = 40;

export const isoAt = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));

export function dailyDigestPrompt(input: {
  readonly candidate: DailyDigestCandidate;
  readonly environmentId: EnvironmentId;
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
  const threadLink = `https://app.t3.codes/${input.environmentId}/<threadId>`;
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
    `- Publish the digest as one page with ${HTML_RENDER_TOOL_NAME}, after checking it with html_preview at width 1100 in dark and light, and at 390. Digest threads show the page at the full window width, so ignore the reply-width guidance.`,
    `- Link a thread with ${threadLink}. Add ?prompt=<url-encoded text> to put a follow-up in that thread's composer.`,
    "- Suggest next steps as prompt links: https://app.t3.codes/new?prompt=<url-encoded text>. A click starts a new thread in this project with that prompt, so write each prompt as a complete task that stands on its own.",
    "- After the page, reply with one short line. Do not restate the page.",
    "",
    DAILY_DIGEST_DESIGN,
    "",
    "The reader's instructions for the digest:",
    input.instructions.trim() || DEFAULT_DAILY_DIGEST_INSTRUCTIONS,
  ].join("\n");
}
