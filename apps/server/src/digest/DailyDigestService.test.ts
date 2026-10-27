import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type DailyDigestPublishInput,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

import * as SessionStore from "../auth/SessionStore.ts";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import { emptyProjection, threadShellFromProjection } from "../orchestration-v2/ProjectionStore.ts";
import * as ThreadLaunchService from "../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as ManagedProjectFolders from "../project/ManagedProjectFolders.ts";
import * as ProjectFaviconResolver from "../project/ProjectFaviconResolver.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { ServerActivation } from "../serverActivation.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as DailyDigestService from "./DailyDigestService.ts";

const hostId = EnvironmentId.make("host");
const callerId = ThreadId.make("digest-discovery:test");
const projectId = ProjectId.make("scratch");
const sol = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-6-sol" };
const source = {
  environmentId: EnvironmentId.make("idom"),
  projectId: ProjectId.make("mobile"),
  projectTitle: "Inventor mobile",
  machine: "idom",
  toolPrefix: "t3-idom",
};
const content: DailyDigestPublishInput = {
  mood: "Steady",
  headline: "Mobile shipped",
  summary: "Remote work.",
  visuals: [
    { kind: "image", title: "Screen", path: "/idom/screen.png", threadId: "remote-thread" },
  ],
  facts: [],
  sections: [],
  decisions: [],
  nextSteps: [],
  threads: [{ id: "remote-thread", title: "Work", status: "completed", activityMs: 0 }],
};

function projection(id: ThreadId, digest = true) {
  const at = DateTime.makeUnsafe(0);
  return emptyProjection({
    id: EventId.make(`created:${id}`),
    type: "thread.created",
    threadId: id,
    occurredAt: at,
    payload: {
      id,
      projectId,
      title: "Digest",
      digest,
      providerInstanceId: sol.instanceId,
      modelSelection: sol,
      runtimeMode: "full-access",
      interactionMode: "default",
      createdBy: "system",
      creationSource: "server",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: { rootThreadId: id, parentThreadId: null, relationshipToParent: null },
      forkedFrom: null,
      createdAt: at,
      updatedAt: at,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
  });
}

const setup = Effect.fn("DailyDigestService.test.setup")(function* () {
  const configServices = yield* Layer.build(
    ServerConfig.layerTest(process.cwd(), { prefix: "digest-service-test-" }),
  );
  const config = Context.get(configServices, ServerConfig.ServerConfig);
  const shells = new Map<ThreadId, OrchestrationV2ThreadShell>([
    [callerId, threadShellFromProjection(projection(callerId))],
  ]);
  const launches: ThreadLaunchService.ThreadLaunchInput[] = [];
  const layer = DailyDigestService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(ServerActivation, Effect.never),
        Layer.mock(SessionStore.SessionStore)({
          cookieName: "test-session",
          legacyCookieName: undefined,
        }),
        Layer.mock(ServerSettings.ServerSettingsService)({
          getSettings: Effect.succeed({
            ...DEFAULT_SERVER_SETTINGS,
            dailyDigestModelSelection: sol,
          }),
        }),
        Layer.mock(ProjectService.ProjectService)({ listShells: () => Effect.succeed([]) }),
        Layer.mock(ThreadManagementService.ThreadManagementService)({
          getThreadShell: (id) => Effect.sync(() => shells.get(id) ?? null),
          getShellSnapshot: () =>
            Effect.sync(() => ({
              schemaVersion: 2,
              snapshotSequence: 0,
              threads: [...shells.values()],
              archivedThreads: [],
            })),
        }),
        Layer.mock(ThreadLaunchService.ThreadLaunchService)({
          launch: (input) =>
            Effect.sync(() => {
              launches.push(input);
              const threadId = input.threadId ?? ThreadId.make(`local:${launches.length}`);
              const created = projection(threadId);
              shells.set(threadId, { ...threadShellFromProjection(created), status: "running" });
              return { threadId, projection: created, resumed: false };
            }),
        }),
        Layer.mock(ManagedProjectFolders.ManagedProjectFolders)({
          namedProjectsRoot: config.baseDir,
          scratchRoot: Effect.succeed(Option.some("/scratch")),
          ensureScratchProject: Effect.succeed({ projectId }),
        }),
        Layer.mock(GitVcsDriver.GitVcsDriver)({}),
        Layer.mock(ServerEnvironment.ServerEnvironment)({
          getEnvironmentId: Effect.succeed(hostId),
        }),
        Layer.mock(ProjectFaviconResolver.ProjectFaviconResolver)({}),
      ),
    ),
  );
  const services = yield* Layer.build(
    layer.pipe(Layer.provide(Layer.succeed(ServerConfig.ServerConfig, config))),
  );
  return {
    service: Context.get(services, DailyDigestService.DailyDigestService),
    shells,
    launches,
    config,
  };
});

it.layer(NodeServices.layer)("remote daily digests", (it) => {
  it.effect("discovers other machines through Run now even without changed local projects", () =>
    Effect.gen(function* () {
      const { service, launches } = yield* setup();
      const result = yield* service.runNow();
      expect(result.threadIds).toHaveLength(1);
      expect(launches[0]).toMatchObject({ projectId, modelSelection: sol, digest: true });
      expect(launches[0]?.initialMessage?.text).toContain("t3_project_list");
      expect(launches[0]?.initialMessage?.text).toContain(hostId);
    }),
  );

  it.effect(
    "publishes remote content locally without reading the host's repository or image files",
    () =>
      Effect.gen(function* () {
        const { service, launches, config } = yield* setup();
        const started = yield* service.startRemote(callerId, { source, latestActivityMs: 0 });
        expect(started.threadId).not.toBeNull();
        expect(launches[0]).toMatchObject({ projectId, modelSelection: sol, digest: true });
        expect(launches[0]?.initialMessage?.text).toContain("t3-idom");
        expect(yield* service.startRemote(callerId, { source, latestActivityMs: 0 })).toEqual({
          threadId: null,
        });
        const page = yield* service.preparePage(started.threadId!, content);
        expect(page.snapshot.context).toMatchObject({
          projectTitle: "Inventor mobile",
          environmentId: source.environmentId,
          remote: { machine: "idom", projectId: source.projectId },
        });
        expect(page.snapshot.images).toEqual({});
        expect(page.snapshot.content.visuals).toEqual(content.visuals);
        yield* (yield* FileSystem.FileSystem).makeDirectory(config.attachmentsDir, {
          recursive: true,
        });
        yield* service.rememberPage(started.threadId!, "digest-page-html", page.snapshot);
        yield* TestClock.adjust("1 minute");
        expect(yield* service.startRemote(callerId, { source, latestActivityMs: 0 })).toEqual({
          threadId: null,
        });
        const changed = yield* service.startRemote(callerId, { source, latestActivityMs: 1 });
        expect(changed.threadId).not.toBe(started.threadId);
        const next = yield* service.preparePage(changed.threadId!, content);
        expect(next.snapshot.context.sinceMs).toBe(page.snapshot.context.untilMs);
      }),
  );

  it.effect("rejects ordinary callers and skips the host environment", () =>
    Effect.gen(function* () {
      const { service, shells, launches } = yield* setup();
      expect(
        yield* service.startRemote(callerId, {
          source: { ...source, environmentId: hostId },
          latestActivityMs: 0,
        }),
      ).toEqual({ threadId: null });
      shells.set(callerId, threadShellFromProjection(projection(callerId, false)));
      const error = yield* service
        .startRemote(callerId, { source, latestActivityMs: 0 })
        .pipe(Effect.flip);
      expect(error.message).toBe("Only digest threads can arrange remote digests.");
      expect(launches).toHaveLength(0);
    }),
  );
});
