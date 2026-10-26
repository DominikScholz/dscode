import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DailyDigestError,
  type DailyDigestRunNowResult,
  type ThreadId,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

import * as SessionStore from "../auth/SessionStore.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadLaunchService from "../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ManagedProjectFolders from "../project/ManagedProjectFolders.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { forkParked } from "../serverActivation.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import {
  type AwayClock,
  type DailyDigestCandidate,
  advanceAwayClock,
  bucketActivity,
  digestWindow,
  planDailyDigests,
} from "./dailyDigestPlan.ts";
import { type DailyDigestPageContent, renderDailyDigestPage } from "./dailyDigestPage.ts";
import { dailyDigestPrompt, isoAt } from "./dailyDigestPrompt.ts";

const AWAY_POLL = "30 seconds";
const HOUR_MS = 60 * 60 * 1_000;

export class DailyDigestService extends Context.Service<
  DailyDigestService,
  {
    /** Starts digests for every changed project now, whether or not digests are on. */
    readonly runNow: () => Effect.Effect<DailyDigestRunNowResult, DailyDigestError>;
    /** The digest page for content a digest thread's agent wrote. */
    readonly preparePage: (
      threadId: ThreadId,
      content: DailyDigestPageContent,
    ) => Effect.Effect<{ readonly html: string; readonly title: string }, DailyDigestError>;
  }
>()("t3/digest/DailyDigestService") {}

const digestTitle = (nowMs: number) =>
  `Daily digest · ${new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(nowMs)}`;

export const layer = Layer.effect(
  DailyDigestService,
  Effect.gen(function* () {
    const sessions = yield* SessionStore.SessionStore;
    const settingsService = yield* ServerSettings.ServerSettingsService;
    const projects = yield* ProjectService.ProjectService;
    const threads = yield* ThreadManagementService.ThreadManagementService;
    const threadLaunch = yield* ThreadLaunchService.ThreadLaunchService;
    const managedFolders = yield* ManagedProjectFolders.ManagedProjectFolders;
    const git = yield* GitVcsDriver.GitVcsDriver;
    const environment = yield* ServerEnvironment.ServerEnvironment;
    const permit = yield* Semaphore.make(1);

    const fail = (message: string) => (cause: unknown) => new DailyDigestError({ message, cause });

    // Local branches only: --all would count the hidden checkpoint refs every turn writes.
    const hasCommitsSince = (workspaceRoot: string, sinceMs: number) =>
      git
        .execute({
          operation: "DailyDigest.hasCommitsSince",
          cwd: workspaceRoot,
          args: ["log", "--branches", `--since=${isoAt(sinceMs)}`, "--max-count=1", "--format=%H"],
          allowNonZeroExit: true,
          timeoutMs: 15_000,
        })
        .pipe(
          Effect.map((result) => result.exitCode === 0 && result.stdout.trim() !== ""),
          Effect.orElseSucceed(() => false),
        );

    const launchDigest = Effect.fn("DailyDigestService.launchDigest")(function* (
      candidate: DailyDigestCandidate,
      nowMs: number,
    ) {
      const settings = yield* settingsService.getSettings;
      const { project } = candidate;
      const projectSettings = resolveProjectSettings(settings, project.id, project).settings;
      const launched = yield* threadLaunch.launch({
        commandId: CommandId.make(`daily-digest:${project.id}:${nowMs}`),
        projectId: project.id,
        title: digestTitle(nowMs),
        modelSelection:
          settings.dailyDigestModelSelection ??
          projectSettings.defaultModelSelection ??
          settings.textGenerationModelSelection,
        runtimeMode: projectSettings.defaultRuntimeMode,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        workspaceStrategy: { type: "root" },
        initialMessage: {
          text: dailyDigestPrompt({
            candidate,
            nowMs,
            instructions: settings.dailyDigestInstructions,
          }),
          attachments: [],
        },
        createdBy: "system",
        creationSource: "server",
        digest: true,
      });
      return launched.threadId;
    });

    const runDigests = Effect.fn("DailyDigestService.runDigests")(function* () {
      const nowMs = yield* Clock.currentTimeMillis;
      const projectShells = yield* projects
        .listShells()
        .pipe(Effect.mapError(fail("Could not list projects.")));
      const snapshot = yield* threads
        .getShellSnapshot()
        .pipe(Effect.mapError(fail("Could not list threads.")));
      const scratchRoot = Option.getOrNull(yield* managedFolders.scratchRoot);
      const candidates = planDailyDigests({
        projects: projectShells.filter((project) => project.workspaceRoot !== scratchRoot),
        threads: [...snapshot.threads, ...snapshot.archivedThreads],
        nowMs,
      });
      const due = yield* Effect.filter(
        candidates,
        (candidate) =>
          candidate.threads.length > 0
            ? Effect.succeed(true)
            : hasCommitsSince(candidate.project.workspaceRoot, candidate.sinceMs),
        { concurrency: 4 },
      );
      const launched = yield* Effect.forEach(
        due,
        (candidate) =>
          launchDigest(candidate, nowMs).pipe(
            Effect.map(Option.some),
            Effect.catchCause((cause) =>
              Effect.logWarning("Could not start daily digest", {
                projectId: candidate.project.id,
                cause,
              }).pipe(Effect.as(Option.none<ThreadId>())),
            ),
          ),
        { concurrency: 1 },
      );
      const threadIds = launched.flatMap((threadId) => Option.toArray(threadId));
      yield* Effect.logInfo("Daily digests started", {
        changedProjects: due.length,
        started: threadIds.length,
      });
      return { threadIds };
    });

    const commitTimes = (workspaceRoot: string, window: { sinceMs: number; untilMs: number }) =>
      git
        .execute({
          operation: "DailyDigest.commitTimes",
          cwd: workspaceRoot,
          args: [
            "log",
            "--branches",
            `--since=${isoAt(window.sinceMs)}`,
            `--until=${isoAt(window.untilMs)}`,
            "--format=%ct",
          ],
          allowNonZeroExit: true,
          timeoutMs: 15_000,
          maxOutputBytes: 1_000_000,
        })
        .pipe(
          Effect.map((result) =>
            result.exitCode === 0
              ? result.stdout
                  .split("\n")
                  .filter((line) => line.trim() !== "")
                  .map((line) => Number(line) * 1_000)
              : [],
          ),
          Effect.orElseSucceed((): ReadonlyArray<number> => []),
        );

    const preparePage: DailyDigestService["Service"]["preparePage"] = Effect.fn(
      "DailyDigestService.preparePage",
    )(function* (threadId, content) {
      const thread = yield* threads
        .getThreadShell(threadId)
        .pipe(Effect.mapError(fail("Could not read this thread.")));
      if (thread === null || thread.digest !== true) {
        return yield* new DailyDigestError({
          message: "Only daily digest threads can publish a digest.",
        });
      }
      const project = Option.getOrNull(
        yield* projects
          .getShell(thread.projectId)
          .pipe(Effect.mapError(fail("Could not read the project."))),
      );
      if (project === null) {
        return yield* new DailyDigestError({ message: "The digest's project no longer exists." });
      }
      const snapshot = yield* threads
        .getShellSnapshot()
        .pipe(Effect.mapError(fail("Could not list threads.")));
      const window = digestWindow(thread, [...snapshot.threads, ...snapshot.archivedThreads]);
      const times = yield* commitTimes(project.workspaceRoot, window);
      const environmentId = yield* environment.getEnvironmentId;
      return {
        title: `${project.title} daily digest`,
        html: renderDailyDigestPage(content, {
          projectTitle: project.title,
          environmentId,
          ...window,
          activity: bucketActivity(times, window),
        }),
      };
    });

    const runNow: DailyDigestService["Service"]["runNow"] = () =>
      runDigests().pipe(
        permit.withPermitsIfAvailable(1),
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(new DailyDigestError({ message: "Digests are already starting." })),
            onSome: Effect.succeed,
          }),
        ),
      );

    const awayClock = yield* Ref.make<AwayClock>({ awaySinceMs: null, digested: false });
    const watchAway = Effect.gen(function* () {
      const settings = yield* settingsService.getSettings;
      const connected = (yield* sessions.connectedSessionCount) > 0;
      const nowMs = yield* Clock.currentTimeMillis;
      const due = yield* Ref.modify(awayClock, (clock) => {
        const next = advanceAwayClock(clock, {
          connected,
          nowMs,
          enabled: settings.dailyDigestEnabled,
          awayMs: settings.dailyDigestAwayHours * HOUR_MS,
        });
        return [next.due, next.clock] as const;
      });
      if (due) yield* runDigests().pipe(permit.withPermits(1));
    }).pipe(
      Effect.catchCause((cause) => Effect.logWarning("Daily digest check failed", { cause })),
      Effect.andThen(Effect.sleep(AWAY_POLL)),
      Effect.forever,
    );
    yield* forkParked(watchAway);

    return DailyDigestService.of({ runNow, preparePage });
  }),
);
