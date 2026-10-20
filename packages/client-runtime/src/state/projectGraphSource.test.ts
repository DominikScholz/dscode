import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  type ProjectGraphSourceCandidate,
  resolveProjectGraphSource,
} from "./projectGraphSource.ts";

const nightly = EnvironmentId.make("nightly");
const fork = EnvironmentId.make("fork");
const other = EnvironmentId.make("other");

function environment(
  environmentId: EnvironmentId,
  options: {
    displayUrl?: string | null;
    projectGraph?: boolean;
    os?: "darwin" | "linux" | "windows";
    phase?: string;
  } = {},
): ProjectGraphSourceCandidate {
  return {
    environmentId,
    displayUrl: options.displayUrl === undefined ? "http://127.0.0.1:3773/" : options.displayUrl,
    connection: { phase: options.phase ?? "connected" },
    serverConfig: {
      environment: {
        platform: { os: options.os ?? "darwin", arch: "arm64" },
        capabilities: {
          repositoryIdentity: true,
          ...(options.projectGraph ? { projectGraph: true } : {}),
        },
      },
    },
  };
}

describe("resolveProjectGraphSource", () => {
  it("borrows a graph-capable server on the same machine for a server without graphs", () => {
    expect(
      resolveProjectGraphSource({
        owner: nightly,
        environments: [
          environment(nightly),
          environment(fork, { displayUrl: "http://localhost:13773/", projectGraph: true }),
        ],
      }),
    ).toBe(fork);
  });

  it("keeps the project's own server when it builds graphs or when nothing can stand in", () => {
    expect(
      resolveProjectGraphSource({
        owner: nightly,
        environments: [
          environment(nightly, { projectGraph: true }),
          environment(fork, { projectGraph: true }),
        ],
      }),
    ).toBe(nightly);
    expect(
      resolveProjectGraphSource({
        owner: nightly,
        environments: [
          environment(nightly, { displayUrl: "http://192.168.1.5:3773/" }),
          environment(fork, { displayUrl: "http://192.168.1.9:3773/", projectGraph: true }),
          environment(other, { displayUrl: null, projectGraph: true }),
        ],
      }),
    ).toBe(nightly);
  });

  it("matches a remote machine by its host, but not another OS or a disconnected server", () => {
    const owner = environment(nightly, { displayUrl: "https://mini.tailnet.ts.net/" });
    expect(
      resolveProjectGraphSource({
        owner: nightly,
        environments: [
          owner,
          environment(fork, {
            displayUrl: "https://mini.tailnet.ts.net:8443/",
            projectGraph: true,
          }),
        ],
      }),
    ).toBe(fork);
    expect(
      resolveProjectGraphSource({
        owner: nightly,
        environments: [
          environment(nightly, { os: "windows" }),
          environment(fork, { os: "linux", projectGraph: true }),
          environment(other, { projectGraph: true, phase: "disconnected" }),
        ],
      }),
    ).toBe(nightly);
  });

  it("honors an explicit choice the client still knows", () => {
    expect(
      resolveProjectGraphSource({
        owner: nightly,
        requested: other,
        environments: [
          environment(nightly),
          environment(fork, { projectGraph: true }),
          environment(other),
        ],
      }),
    ).toBe(other);
    expect(
      resolveProjectGraphSource({
        owner: nightly,
        requested: EnvironmentId.make("removed"),
        environments: [environment(nightly), environment(fork, { projectGraph: true })],
      }),
    ).toBe(fork);
  });
});
