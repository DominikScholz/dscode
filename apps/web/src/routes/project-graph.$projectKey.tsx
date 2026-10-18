import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProjectGraphPage } from "../components/project-graph/ProjectGraphPage";

export const Route = createFileRoute("/project-graph/$projectKey")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { gitEnvironment?: string; checkout?: string } => ({
    ...(typeof search.checkout === "string" ? { checkout: search.checkout } : {}),
    ...(typeof search.gitEnvironment === "string" ? { gitEnvironment: search.gitEnvironment } : {}),
  }),
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: ProjectGraphRoute,
});

function ProjectGraphRoute() {
  const { projectKey } = Route.useParams();
  const { gitEnvironment, checkout } = Route.useSearch();
  return (
    <ProjectGraphPage
      key={projectKey}
      projectKey={projectKey}
      gitEnvironment={gitEnvironment}
      checkout={checkout}
    />
  );
}
