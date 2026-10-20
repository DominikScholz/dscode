import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { readThreadShell } from "../../state/entities";
import { useSettingsProjectGroups } from "../settings/useSettingsProjectGroups";

interface ProjectGraphVisit {
  projectKey: string;
  href: string;
}

let lastProjectGraph: ProjectGraphVisit | null = null;

/** Keeps the graph URL, with its checkout and Git source, for the app navigation to return to. */
export function useRememberProjectGraph(projectKey: string) {
  const href = useLocation({ select: (location) => location.href });
  useEffect(() => {
    lastProjectGraph = { projectKey, href };
  }, [projectKey, href]);
}

export type ProjectGraphDestination =
  | { kind: "graph"; projectKey: string; checkout?: string }
  | { kind: "href"; href: string }
  | { kind: "dashboard" };

/**
 * The graph of the project being worked on: the routed thread's or draft's
 * project, else the graph shown last, else the first project. Without projects
 * the dashboard explains how to add one.
 */
export function resolveProjectGraphDestination(input: {
  groups: ReadonlyArray<{
    projectKey: string;
    memberProjects: ReadonlyArray<{ environmentId: EnvironmentId; id: ProjectId }>;
  }>;
  routeProject: { environmentId: EnvironmentId; projectId: ProjectId } | null;
  lastGraph: ProjectGraphVisit | null;
}): ProjectGraphDestination {
  const { groups, routeProject, lastGraph } = input;
  const routeGroup = routeProject
    ? groups.find((group) =>
        group.memberProjects.some(
          (member) =>
            member.environmentId === routeProject.environmentId &&
            member.id === routeProject.projectId,
        ),
      )
    : undefined;
  if (routeProject && routeGroup) {
    return {
      kind: "graph",
      projectKey: routeGroup.projectKey,
      checkout: `${routeProject.environmentId}:${routeProject.projectId}`,
    };
  }
  if (lastGraph && groups.some((group) => group.projectKey === lastGraph.projectKey)) {
    return { kind: "href", href: lastGraph.href };
  }
  const firstGroup = groups[0];
  return firstGroup ? { kind: "graph", projectKey: firstGroup.projectKey } : { kind: "dashboard" };
}

/** Resolves on click so the app navigation does not re-render on thread updates. */
export function useOpenProjectGraph() {
  const navigate = useNavigate();
  const routeTarget = useThreadRouteTarget();
  // Scratch threads have no repository to graph.
  const groups = useSettingsProjectGroups().filter((group) => !group.isScratch);

  return () => {
    const destination = resolveProjectGraphDestination({
      groups,
      routeProject:
        routeTarget?.kind === "server"
          ? readThreadShell(routeTarget.threadRef)
          : routeTarget?.kind === "draft"
            ? useComposerDraftStore.getState().getDraftSession(routeTarget.draftId)
            : null,
      lastGraph: lastProjectGraph,
    });
    switch (destination.kind) {
      case "graph":
        void navigate({
          to: "/project-graph/$projectKey",
          params: { projectKey: destination.projectKey },
          search: destination.checkout ? { checkout: destination.checkout } : {},
        });
        return;
      case "href":
        void navigate({ href: destination.href });
        return;
      case "dashboard":
        void navigate({ to: "/dashboard" });
    }
  };
}
