import { DEFAULT_DAILY_DIGEST_INSTRUCTIONS } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type { DailyDigestCandidate } from "./dailyDigestPlan.ts";
import type { RemoteDigestJob } from "./dailyDigestRemote.ts";
import { threadActivityMs } from "./dailyDigestPlan.ts";

const MAX_LISTED_THREADS = 40;

export const isoAt = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));

export function dailyDigestPrompt(input: {
  readonly candidate: DailyDigestCandidate;
  readonly nowMs: number;
  readonly instructions: string;
  readonly attachmentsDir: string;
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
    `Images and pages from a thread are files in \`${input.attachmentsDir}\` named after its thread id: \`<threadId>-*.png\` (or jpg, gif, webp) and \`<threadId>-*-html.html\`. Screenshots that threads mention by path count too.`,
    "",
    ...writingRules(
      "- Only read. Use t3_thread_read for the threads, git for history, and existing CI results for checks. Do not edit files, run builds or test suites, commit, push, or start threads.",
      "- visuals make the digest: one to three, most telling first, since the first one fills the top of the page. Use images from the threads (absolute paths: screenshots of new UI, before and after, results), or a bars comparison of numbers from the threads, such as benchmarks, sizes, or timings from a thread's page or output. Highlight the winner. Videos cannot be shown; use a screenshot or GIF instead. Leave visuals empty only when nothing visual happened.",
    ),
    "",
    "The reader's instructions for the digest:",
    input.instructions.trim() || DEFAULT_DAILY_DIGEST_INSTRUCTIONS,
  ].join("\n");
}

function writingRules(readLine: string, visualsLine: string): Array<string> {
  return [
    "How to write it:",
    readLine,
    "- Digests for other projects run at the same time. Keep scratch files in your own directory from `mktemp -d`, never a shared path.",
    "- Publish with digest_publish, once, when you have read everything. Its design, title, activity chart, and links are fixed: you write only the content, never HTML. Do not use html_render.",
    "- Write very little: the reader skims this in under a minute, and every line should earn its place. mood: a few words on the day overall. headline: one plain sentence of at most 16 words on what matters most today. summary: one short sentence on what moved, adding to the headline rather than repeating it.",
    visualsLine,
    "- facts: at most two numbers the page does not already show, such as merged pull requests or decisions waiting. It shows commits, uncommitted files, unpushed commits, and active threads itself. Usually leave it empty.",
    "- sections are what happened: at most four, one per workstream that mattered (a thread, a branch, or commits with one purpose), most important first; fold small work into a bigger one or leave it out. Pick the status that fits, keep the summary under 12 words, put a problem the reader must act on (unpushed work, a failing check, an open risk) in issue as a phrase of a few words, and set threadId when a thread holds the work.",
    "- decisions are what only the reader can decide: at most two, each a short question with one line of context under 12 words, the threadId where it is discussed, and a prompt that starts their answer. Leave it empty when nothing waits on them.",
    "- nextSteps are how to proceed: at most three, most valuable first, each with a verb-first title, a reason under 12 words, and a prompt that is a complete task for a new thread in this project.",
    "- Copy: sentence case, plain verbs, no filler, no emoji. Wrap code, branch names, and paths in backticks.",
    "- After publishing, reply with one short line. Do not restate the page.",
  ];
}

export function remoteDailyDigestPrompt(job: RemoteDigestJob, instructions: string): string {
  const { source, sinceMs, untilMs } = job;
  return [
    `Write the daily digest for the project "${source.projectTitle}" on ${source.machine}, covering ${isoAt(sinceMs)} to ${isoAt(untilMs)}.`,
    "",
    `Use the existing ${source.toolPrefix} tools to read environment ${source.environmentId}, project ${source.projectId}. Verify the environment with t3_environment_read, then page through t3_thread_list and t3_thread_read (messages and activity). Follow nextCursor, nextPosition, and nextTextOffset until the window is covered. Exclude digest threads and subagents from the thread list. Include ongoing work even if it started earlier.`,
    "The repository and images live on that machine. Git details come only from evidence in its threads; do not inspect the local checkout for this project or invent commit counts. If the machine is unavailable, report that and do not publish a partial digest.",
    "When publishing, use this thread's LOCAL digest_publish tool and include threads: [{id, title, status, activityMs, branch?, provider?}] from the source project. Never publish through the other machine's tools. There is no need to launch a remote agent.",
    "",
    ...writingRules(
      "- Only read with the source machine's existing T3 tools. Do not edit files, run builds or tests, commit, push, or start threads.",
      `- visuals: one to three, most telling first. Use screenshots mentioned in the thread's activity, with the exact absolute path and threadId from ${source.machine}. The app loads them from that machine. Do not copy images or use a local path with the same name. Or use a bars comparison of numbers from the threads. Leave visuals empty only when nothing visual happened.`,
    ),
    "",
    "The reader's instructions for the digest:",
    instructions.trim() || DEFAULT_DAILY_DIGEST_INSTRUCTIONS,
  ].join("\n");
}

export function remoteDigestDiscoveryPrompt(environmentId: string): string {
  return [
    "Find every project on the other T3 Code machines reachable through your existing MCP tools and arrange its daily digest locally.",
    `This host is environment ${environmentId}. Discover all tool namespaces offering t3_environment_read and t3_project_list. Read their identities, skip this host, and deduplicate by environmentId. Do not assume a particular machine name or infer a connection from a name alone.`,
    "For each reachable environment, page through ALL projects with t3_project_list. For every non-deleted project, page through t3_thread_list, excluding digest threads and subagents. Then call this host's digest_start_remote once with source: {environmentId, projectId, projectTitle, machine: environment label, toolPrefix: that machine's MCP namespace}, latestActivityMs: latest non-digest thread updatedAt as epoch milliseconds (null if none). The service decides which projects need a digest and starts a separate local digest thread for each.",
    "Use existing tools only. Do not read provider config files, request credentials, connect with raw HTTP, mirror data, run shell commands on other machines, or launch agents there. Do not use delegate_task or t3_thread_launch. Do not call digest_publish in this discovery thread.",
    "Finish with a short coverage report: machines checked, projects considered, digests started, and machines or projects that could not be read. Unavailable is not the same as no activity. If no remote T3 tools are connected, say so. Do not claim all machines were covered unless all discovered connections were read successfully.",
  ].join("\n\n");
}
