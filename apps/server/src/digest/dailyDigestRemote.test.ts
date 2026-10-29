import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { planRemoteDigest, type RemoteDigestJob } from "./dailyDigestRemote.ts";

const source = {
  environmentId: EnvironmentId.make("idom"),
  projectId: ProjectId.make("mobile"),
  projectTitle: "Mobile",
  machine: "idom",
  toolPrefix: "t3-idom",
};
const job: RemoteDigestJob = { source, sinceMs: 0, untilMs: 100, published: true };
const id = ThreadId.make("digest");

describe("planRemoteDigest", () => {
  it("includes projects without a digest, even with no recent thread activity", () => {
    expect(planRemoteDigest({ source, latestActivityMs: null }, {}, [], 100)).toEqual({
      sinceMs: 100 - 86_400_000,
      untilMs: 100,
    });
  });

  it("uses only successful publications from the exact source environment and project", () => {
    expect(planRemoteDigest({ source, latestActivityMs: 101 }, { [id]: job }, [], 200)).toEqual({
      sinceMs: 100,
      untilMs: 200,
    });
    expect(planRemoteDigest({ source, latestActivityMs: 100 }, { [id]: job }, [], 200)).toBeNull();
    expect(planRemoteDigest({ source, latestActivityMs: null }, { [id]: job }, [], 200)).toBeNull();
    expect(
      planRemoteDigest(
        {
          source: { ...source, environmentId: EnvironmentId.make("other") },
          latestActivityMs: 100,
        },
        { [id]: job },
        [],
        200,
      ),
    ).not.toBeNull();
    expect(
      planRemoteDigest(
        { source: { ...source, projectId: ProjectId.make("other") }, latestActivityMs: 100 },
        { [id]: job },
        [],
        200,
      ),
    ).not.toBeNull();
  });

  it("does not duplicate an active digest and retries a failed one without losing its window", () => {
    const jobs = { [id]: { ...job, published: false } };
    expect(
      planRemoteDigest(
        { source, latestActivityMs: 150 },
        jobs,
        [{ id, status: "running", deletedAt: null }],
        200,
      ),
    ).toBeNull();
    expect(
      planRemoteDigest(
        { source, latestActivityMs: 150 },
        jobs,
        [{ id, status: "failed", deletedAt: null }],
        200,
      ),
    ).toEqual({ sinceMs: 0, untilMs: 200 });
    expect(planRemoteDigest({ source, latestActivityMs: 150 }, jobs, [], 200)).not.toBeNull();
  });
});
