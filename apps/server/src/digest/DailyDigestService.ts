import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DailyDigestError,
  type DailyDigestPublishInput,
  DailyDigestPageSnapshot,
  type DailyDigestRunNowResult,
  type DailyDigestStartRemoteInput,
  ThreadId,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { resolveAttachmentRelativePath } from "../attachmentPaths.ts";
import * as SessionStore from "../auth/SessionStore.ts";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadLaunchService from "../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ManagedProjectFolders from "../project/ManagedProjectFolders.ts";
import * as ProjectFaviconResolver from "../project/ProjectFaviconResolver.ts";
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
  countByBranch,
  digestThreadEntry,
  parseCommitLog,
  parseStatusLines,
  planDailyDigests,
  windowThreads,
} from "./dailyDigestPlan.ts";
import { digestSnapshotPath } from "./dailyDigestAsset.ts";
import { renderDailyDigestSnapshot } from "./dailyDigestPage.ts";
import {
  dailyDigestPrompt,
  isoAt,
  remoteDailyDigestPrompt,
  remoteDigestDiscoveryPrompt,
} from "./dailyDigestPrompt.ts";
import { RemoteDigestJobs, planRemoteDigest } from "./dailyDigestRemote.ts";

const AWAY_POLL = "30 seconds";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};
const HOUR_MS = 60 * 60 * 1_000;
// Enough for the page's lists; the counts stay exact.
const MAX_LISTED = 40;
const encodeSnapshot = Schema.encodeEffect(Schema.fromJsonString(DailyDigestPageSnapshot));
const isDailyDigestError = Schema.is(DailyDigestError);
const decodeJobs = Schema.decodeUnknownEffect(Schema.fromJsonString(RemoteDigestJobs));
const encodeJobs = Schema.encodeEffect(Schema.fromJsonString(RemoteDigestJobs));

export class DailyDigestService extends Context.Service<
  DailyDigestService,
  {
    /** Starts digests for every changed project now, whether or not digests are on. */
    readonly runNow: () => Effect.Effect<DailyDigestRunNowResult, DailyDigestError>;
    readonly startRemote: (
      callerThreadId: ThreadId,
      input: DailyDigestStartRemoteInput,
    ) => Effect.Effect<{ readonly threadId: ThreadId | null }, DailyDigestError>;
    /** The digest page for content a digest thread's agent wrote. */
    readonly preparePage: (
      threadId: ThreadId,
      content: DailyDigestPublishInput,
    ) => Effect.Effect<
      { readonly html: string; readonly title: string; readonly snapshot: DailyDigestPageSnapshot },
      DailyDigestError
    >;
    /** Keeps a published page's snapshot so serving it renders with the current template. */
    readonly rememberPage: (
      threadId: ThreadId,
      attachmentId: string,
      snapshot: DailyDigestPageSnapshot,
    ) => Effect.Effect<void, DailyDigestError>;
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
    const crypto = yield* Crypto.Crypto;
    const permit = yield* Semaphore.make(1);
    const fileSystem = yield* FileSystem.FileSystem;
    const favicons = yield* ProjectFaviconResolver.ProjectFaviconResolver;
    const { attachmentsDir, stateDir } = yield* ServerConfig.ServerConfig;
    const jobsPath = `${stateDir}/remote-digests.json`;
    const jobsLock = yield* Semaphore.make(1);

    const fail = (message: string) => (cause: unknown) => new DailyDigestError({ message, cause });

    const readJobs = Effect.fn("DailyDigestService.readJobs")(
      function* () {
        if (!(yield* fileSystem.exists(jobsPath))) return {} satisfies RemoteDigestJobs;
        return yield* fileSystem.readFileString(jobsPath).pipe(Effect.flatMap(decodeJobs));
      },
      Effect.mapError(fail("Could not read remote digest history.")),
    );

    const writeJobs = Effect.fn("DailyDigestService.writeJobs")(
      function* (jobs: RemoteDigestJobs) {
        const json = yield* encodeJobs(jobs);
        yield* fileSystem.makeDirectory(stateDir, { recursive: true });
        yield* fileSystem.writeFileString(`${jobsPath}.tmp`, json);
        yield* fileSystem.rename(`${jobsPath}.tmp`, jobsPath);
      },
      Effect.mapError(fail("Could not save remote digest history.")),
    );

    const startRemote: DailyDigestService["Service"]["startRemote"] = Effect.fn(
      "DailyDigestService.startRemote",
    )(
      function* (callerThreadId, input) {
        const caller = yield* threads.getThreadShell(callerThreadId);
        if (caller?.digest !== true)
          return yield* new DailyDigestError({
            message: "Only digest threads can arrange remote digests.",
          });
        if (input.source.environmentId === (yield* environment.getEnvironmentId)) {
          return { threadId: null };
        }
        const jobs = yield* readJobs();
        const shells = yield* threads.getShellSnapshot();
        const nowMs = yield* Clock.currentTimeMillis;
        const window = planRemoteDigest(
          input,
          jobs,
          [...shells.threads, ...shells.archivedThreads],
          nowMs,
        );
        if (window === null) return { threadId: null };
        const threadId = ThreadId.make(`digest:${yield* crypto.randomUUIDv4()}`);
        const job = { source: input.source, ...window, published: false };
        const settings = yield* settingsService.getSettings;
        // Save before launch: the agent can publish as soon as its first turn starts.
        yield* writeJobs({ ...jobs, [threadId]: job });
        yield* threadLaunch.launch({
          commandId: CommandId.make(`daily-digest:${threadId}`),
          threadId,
          projectId: caller.projectId,
          title: `${digestTitle(nowMs)} · ${input.source.projectTitle} (${input.source.machine})`,
          modelSelection:
            settings.dailyDigestModelSelection ?? settings.textGenerationModelSelection,
          runtimeMode: caller.runtimeMode,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          workspaceStrategy: { type: "root" },
          initialMessage: {
            text: remoteDailyDigestPrompt(job, settings.dailyDigestInstructions),
            attachments: [],
          },
          createdBy: "system",
          creationSource: "server",
          digest: true,
        });
        return { threadId };
      },
      jobsLock.withPermits(1),
      Effect.mapError((cause) =>
        isDailyDigestError(cause) ? cause : fail("Could not start the remote digest.")(cause),
      ),
    );

    const discoverRemoteProjects = Effect.fn("DailyDigestService.discoverRemoteProjects")(
      function* () {
        const settings = yield* settingsService.getSettings;
        const projectShells = yield* projects.listShells();
        const scratchRoot = yield* managedFolders.scratchRoot;
        const host = Option.isSome(scratchRoot)
          ? yield* managedFolders.ensureScratchProject
          : projectShells[0]
            ? { projectId: projectShells[0].id }
            : null;
        if (host === null) return [];
        const nowMs = yield* Clock.currentTimeMillis;
        const project = projectShells.find((project) => project.id === host.projectId);
        const projectSettings = resolveProjectSettings(settings, host.projectId, project).settings;
        const launched = yield* threadLaunch.launch({
          commandId: CommandId.make(`daily-digest:discovery:${nowMs}`),
          threadId: ThreadId.make(`digest-discovery:${nowMs}`),
          projectId: host.projectId,
          title: `Daily digest · Other machines · ${isoAt(nowMs).slice(0, 10)}`,
          modelSelection:
            settings.dailyDigestModelSelection ?? settings.textGenerationModelSelection,
          runtimeMode: projectSettings.defaultRuntimeMode,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          workspaceStrategy: { type: "root" },
          initialMessage: {
            text: remoteDigestDiscoveryPrompt(yield* environment.getEnvironmentId),
            attachments: [],
          },
          createdBy: "system",
          creationSource: "server",
          digest: true,
        });
        return [launched.threadId];
      },
      Effect.mapError(fail("Could not discover projects on other machines.")),
    );

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
            attachmentsDir,
          }),
          attachments: [],
        },
        createdBy: "system",
        creationSource: "server",
        digest: true,
      });
      return launched.threadId;
    });

    const runDigests = Effect.fn("DailyDigestService.runDigests")(function* (
      includeRemote = false,
    ) {
      const nowMs = yield* Clock.currentTimeMillis;
      const projectShells = yield* projects
        .listShells()
        .pipe(Effect.mapError(fail("Could not list projects.")));
      const snapshot = yield* threads
        .getShellSnapshot()
        .pipe(Effect.mapError(fail("Could not list threads.")));
      const scratchRoot = Option.getOrNull(yield* managedFolders.scratchRoot);
      const remoteJobs = yield* readJobs();
      const candidates = planDailyDigests({
        projects: projectShells.filter((project) => project.workspaceRoot !== scratchRoot),
        threads: [...snapshot.threads, ...snapshot.archivedThreads].filter(
          (thread) =>
            remoteJobs[thread.id] === undefined && !thread.id.startsWith("digest-discovery:"),
        ),
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
      const threadIds = [
        ...launched.flatMap((threadId) => Option.toArray(threadId)),
        ...(includeRemote ? yield* discoverRemoteProjects() : []),
      ];
      yield* Effect.logInfo("Daily digests started", {
        changedProjects: due.length,
        started: threadIds.length,
      });
      return { threadIds };
    });

    const gitLines = (workspaceRoot: string, operation: string, args: ReadonlyArray<string>) =>
      git
        .execute({
          operation,
          cwd: workspaceRoot,
          args: [...args],
          allowNonZeroExit: true,
          timeoutMs: 15_000,
          maxOutputBytes: 1_000_000,
        })
        .pipe(
          Effect.map((result) =>
            result.exitCode === 0
              ? result.stdout.split("\n").filter((line) => line.trim() !== "")
              : [],
          ),
          Effect.orElseSucceed((): ReadonlyArray<string> => []),
        );

    const windowCommits = (workspaceRoot: string, window: { sinceMs: number; untilMs: number }) =>
      gitLines(workspaceRoot, "DailyDigest.commits", [
        "log",
        "--branches",
        "--source",
        `--since=${isoAt(window.sinceMs)}`,
        `--until=${isoAt(window.untilMs)}`,
        "--format=%h%x1f%ct%x1f%S%x1f%s",
      ]).pipe(Effect.map(parseCommitLog));

    const repoStats = (workspaceRoot: string) =>
      Effect.all({
        // Short status names paths from the project folder and leaves out the rest of the repo.
        status: gitLines(workspaceRoot, "DailyDigest.uncommitted", [
          "status",
          "--short",
          "--",
          ".",
        ]),
        unpushed: gitLines(workspaceRoot, "DailyDigest.unpushed", [
          "log",
          "--branches",
          "--not",
          "--remotes",
          "--source",
          "--format=%S",
        ]),
      }).pipe(
        Effect.map(({ status, unpushed }) => {
          const files = parseStatusLines(status);
          return {
            uncommittedFiles: files.length,
            unpushedCommits: unpushed.length,
            files: files.slice(0, MAX_LISTED),
            unpushedBranches: countByBranch(unpushed).slice(0, MAX_LISTED),
          };
        }),
      );

    // A missing or oversized image would fail the whole publish, so it is left out instead.
    const readImage = (path: string) => {
      const mimeType = IMAGE_MIME_TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()];
      if (mimeType === undefined) return Effect.succeed(null);
      return fileSystem.stat(path).pipe(
        Effect.flatMap((info) =>
          info.type === "File" && Number(info.size) <= MAX_IMAGE_BYTES
            ? fileSystem
                .readFile(path)
                .pipe(
                  Effect.map(
                    (bytes) => `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
                  ),
                )
            : Effect.succeed(null),
        ),
        Effect.orElseSucceed(() => null),
      );
    };

    const preparePage: DailyDigestService["Service"]["preparePage"] = Effect.fn(
      "DailyDigestService.preparePage",
    )(function* (threadId, input) {
      const { threads: remoteThreads, ...content } = input;
      const thread = yield* threads
        .getThreadShell(threadId)
        .pipe(Effect.mapError(fail("Could not read this thread.")));
      if (thread === null || thread.digest !== true) {
        return yield* new DailyDigestError({
          message: "Only daily digest threads can publish a digest.",
        });
      }
      const jobs = yield* readJobs();
      const job = jobs[threadId];
      if (job !== undefined) {
        if (remoteThreads === undefined)
          return yield* new DailyDigestError({
            message: "Remote digests must include the source project's threads.",
          });
        const snapshot: DailyDigestPageSnapshot = {
          content: {
            ...content,
            visuals: content.visuals.filter(
              (visual) => visual.kind !== "image" || visual.threadId !== undefined,
            ),
          },
          context: {
            projectTitle: job.source.projectTitle,
            environmentId: job.source.environmentId,
            sinceMs: job.sinceMs,
            untilMs: job.untilMs,
            activity: [],
            threads: remoteThreads,
            remote: { machine: job.source.machine, projectId: job.source.projectId },
          },
          images: {},
        };
        return {
          title: `${job.source.projectTitle} daily digest`,
          html: renderDailyDigestSnapshot(snapshot),
          snapshot,
        };
      }
      const project = Option.getOrNull(
        yield* projects
          .getShell(thread.projectId)
          .pipe(Effect.mapError(fail("Could not read the project."))),
      );
      if (project === null) {
        return yield* new DailyDigestError({ message: "The digest's project no longer exists." });
      }
      const shells = yield* threads
        .getShellSnapshot()
        .pipe(Effect.mapError(fail("Could not list threads.")));
      const window = digestWindow(
        thread,
        [...shells.threads, ...shells.archivedThreads].filter(
          (shell) => jobs[shell.id] === undefined && !shell.id.startsWith("digest-discovery:"),
        ),
      );
      const commits = yield* windowCommits(project.workspaceRoot, window);
      const environmentId = yield* environment.getEnvironmentId;
      const imagePaths = content.visuals.flatMap((visual) =>
        visual.kind === "image" ? [visual.path] : [],
      );
      const images = yield* Effect.forEach(imagePaths, (path) =>
        readImage(path).pipe(
          Effect.map((dataUri) => (dataUri === null ? [] : [[path, dataUri] as const])),
        ),
      );
      // Like the app, a chosen emoji or monogram wins over the favicon.
      const iconPath =
        project.projectIcon?.kind === "emoji" || project.projectIcon?.kind === "monogram"
          ? null
          : yield* favicons
              .resolvePath(project.workspaceRoot, project.faviconPath ?? undefined)
              .pipe(Effect.orElseSucceed(() => null));
      const icon = iconPath === null ? null : yield* readImage(iconPath);
      const snapshot: DailyDigestPageSnapshot = {
        content,
        context: {
          projectTitle: project.title,
          environmentId,
          ...window,
          activity: bucketActivity(
            commits.map((commit) => commit.timeMs),
            window,
          ),
          commits: commits.slice(0, MAX_LISTED),
          threads: windowThreads(thread, shells.threads, window).map(digestThreadEntry),
          repo: yield* repoStats(project.workspaceRoot),
          ...(icon === null ? {} : { icon }),
          ...(project.projectIcon?.kind === "emoji" ? { emoji: project.projectIcon.emoji } : {}),
          ...(project.projectIcon?.kind === "monogram"
            ? { monogram: { text: project.projectIcon.text, color: project.projectIcon.color } }
            : {}),
        },
        images: Object.fromEntries(images.flat()),
      };
      return {
        title: `${project.title} daily digest`,
        html: renderDailyDigestSnapshot(snapshot),
        snapshot,
      };
    });

    const rememberPage: DailyDigestService["Service"]["rememberPage"] = Effect.fn(
      "DailyDigestService.rememberPage",
    )(function* (threadId, attachmentId, snapshot) {
      const htmlPath = resolveAttachmentRelativePath({
        attachmentsDir,
        relativePath: `${attachmentId}.html`,
      });
      if (htmlPath === null) {
        return yield* new DailyDigestError({ message: "Invalid digest page id." });
      }
      const json = yield* encodeSnapshot(snapshot).pipe(
        Effect.mapError(fail("Could not encode the digest page.")),
      );
      yield* fileSystem
        .writeFileString(digestSnapshotPath(htmlPath), json)
        .pipe(Effect.mapError(fail("Could not keep the digest page.")));
      const jobs = yield* readJobs();
      const job = jobs[threadId];
      if (job !== undefined) yield* writeJobs({ ...jobs, [threadId]: { ...job, published: true } });
    }, jobsLock.withPermits(1));

    const runNow: DailyDigestService["Service"]["runNow"] = () =>
      runDigests(true).pipe(
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
        return [next, next.clock] as const;
      });
      if (due.due) yield* runDigests().pipe(permit.withPermits(1));
      if (due.remoteDue) yield* discoverRemoteProjects().pipe(permit.withPermits(1));
    }).pipe(
      Effect.catchCause((cause) => Effect.logWarning("Daily digest check failed", { cause })),
      Effect.andThen(Effect.sleep(AWAY_POLL)),
      Effect.forever,
    );
    yield* forkParked(watchAway);

    return DailyDigestService.of({ runNow, startRemote, preparePage, rememberPage });
  }),
);
