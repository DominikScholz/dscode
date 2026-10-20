import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { resolveProjectGraphDestination } from "./projectGraphNavigation";

const local = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");
const groups = [
  {
    projectKey: "alpha",
    memberProjects: [{ environmentId: local, id: ProjectId.make("alpha-local") }],
  },
  {
    projectKey: "beta",
    memberProjects: [
      { environmentId: local, id: ProjectId.make("beta-local") },
      { environmentId: remote, id: ProjectId.make("beta-remote") },
    ],
  },
];

describe("resolveProjectGraphDestination", () => {
  it("opens the routed thread's checkout over the graph shown last", () => {
    expect(
      resolveProjectGraphDestination({
        groups,
        routeProject: { environmentId: remote, projectId: ProjectId.make("beta-remote") },
        lastGraph: { projectKey: "alpha", href: "/project-graph/alpha" },
      }),
    ).toEqual({ kind: "graph", projectKey: "beta", checkout: "remote:beta-remote" });
  });

  it("returns to the graph shown last, keeping its options, when no thread is routed", () => {
    expect(
      resolveProjectGraphDestination({
        groups,
        routeProject: null,
        lastGraph: { projectKey: "beta", href: "/project-graph/beta?gitEnvironment=remote" },
      }),
    ).toEqual({ kind: "href", href: "/project-graph/beta?gitEnvironment=remote" });
  });

  it("falls back to the first project when the routed and last projects are gone", () => {
    expect(
      resolveProjectGraphDestination({
        groups,
        routeProject: { environmentId: local, projectId: ProjectId.make("removed") },
        lastGraph: { projectKey: "removed", href: "/project-graph/removed" },
      }),
    ).toEqual({ kind: "graph", projectKey: "alpha" });
  });

  it("opens the dashboard when there is no project to graph", () => {
    expect(
      resolveProjectGraphDestination({ groups: [], routeProject: null, lastGraph: null }),
    ).toEqual({ kind: "dashboard" });
  });
});
