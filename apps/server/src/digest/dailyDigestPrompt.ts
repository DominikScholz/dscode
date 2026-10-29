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
      "Take screenshots from the threads' files above or paths the threads mention, by absolute path.",
    ),
    "",
    "The reader's instructions for the digest:",
    input.instructions.trim() || DEFAULT_DAILY_DIGEST_INSTRUCTIONS,
  ].join("\n");
}

// Every limit here matches what the page has room for; see DigestPage.tsx.
function writingRules(readLine: string, imageSource: string): Array<string> {
  return [
    "How to write it:",
    readLine,
    "- Digests for other projects run at the same time. Keep scratch files in your own directory from `mktemp -d`, never a shared path.",
    "- Publish with digest_publish, once, when you have read everything. The page's layout, project, date, repository counts, thread list, and links are fixed: you write only the content, never HTML. Do not use html_render.",
    "- The reader skims the page in under a minute. Keep every field short, and never repeat what another field or the page already says.",
    "- mood: three to six words on the day overall, such as 'Big day, one merge, one parked experiment'. Not the date; the page shows it.",
    "- headline: one plain sentence of at most 16 words on what matters most today. It is set large and should fit on two lines.",
    "- summary: one short sentence that adds to the headline rather than restating it.",
    `- visuals: the main card sits beside one screenshot, with small charts under it. Lead with the screenshot that best shows the day's result, such as new UI, a before and after, or a result on screen. ${imageSource} It is shown 400 pixels tall and cropped from the bottom, so prefer one whose top holds what matters; its title is alt text and its caption is not shown. Add a second screenshot only when it shows something the first cannot. Add bars only when numbers are the story, at most two small charts from numbers in the threads, such as benchmarks, sizes, or timings: a title under 40 characters, a one-line caption naming the setup, two to six items with labels under 20 characters, a unit, and the winner highlighted. Three visuals at most. Videos cannot be shown; use a screenshot or GIF. Leave visuals empty only when nothing visual happened.`,
    "- facts: at most two numbers shown beside the page's counts of commits, uncommitted files, and unpushed commits, such as merged pull requests. Labels under 16 characters, values under 12, such as `69 vs 34 MB`. Usually leave it empty.",
    "- sections are What happened: at most four workstreams that mattered (a thread, a branch, or commits with one purpose), most important first; fold small work into a bigger one or leave it out. title: under 40 characters, it shares a line with the status chip. status: shipped, in_progress, blocked (shown as Needs you), research, or idle. summary: under 12 words. issue: only a problem the reader must act on, such as unpushed work or a failing check, in at most six words on one line. Set threadId when a thread holds the work, so the row opens it.",
    "- decisions lead What's next, marked Your call: at most two, only what the reader alone can decide. question: under 45 characters. context: under 12 words. Give the threadId where it is discussed and a prompt that starts their answer. Usually leave it empty.",
    "- nextSteps follow them: at most three, most valuable first. title: verb first, under 40 characters. reason: under 12 words. prompt: a complete task for a new thread in this project, with the context a fresh agent needs.",
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
      `Take screenshots mentioned in the threads' activity, with the exact absolute path and threadId from ${source.machine}; the app loads them from that machine. Do not copy images or use a local path with the same name.`,
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
