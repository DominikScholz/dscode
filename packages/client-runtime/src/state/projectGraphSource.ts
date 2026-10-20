import type { EnvironmentId, ExecutionEnvironmentDescriptor } from "@t3tools/contracts";
import { isLoopbackHost } from "@t3tools/shared/preview";

export interface ProjectGraphSourceCandidate {
  readonly environmentId: EnvironmentId;
  /** The connection URL; null for relay connections, `user@host` for SSH. */
  readonly displayUrl: string | null;
  readonly connection: { readonly phase: string };
  readonly serverConfig: {
    readonly environment: Pick<ExecutionEnvironmentDescriptor, "platform" | "capabilities">;
  } | null;
}

/**
 * The environment to read a project's Git graph from. An explicit choice wins.
 * Otherwise a project whose server cannot build graphs borrows a connected
 * server that can and runs on the same machine, since it reads the same
 * checkout path from disk. Servers do not report a machine identity, so the
 * same machine means the same host in both connection URLs (every loopback name
 * counts as one host) and the same OS, which keeps a WSL backend off a Windows
 * checkout. Unknown capabilities keep the project's own server.
 */
export function resolveProjectGraphSource(input: {
  readonly owner: EnvironmentId;
  readonly requested?: EnvironmentId | undefined;
  readonly environments: ReadonlyArray<ProjectGraphSourceCandidate>;
}): EnvironmentId {
  const { environments } = input;
  if (
    input.requested !== undefined &&
    environments.some((environment) => environment.environmentId === input.requested)
  ) {
    return input.requested;
  }
  const owner = environments.find((environment) => environment.environmentId === input.owner);
  const ownerDescriptor = owner?.serverConfig?.environment;
  if (!owner || !ownerDescriptor || ownerDescriptor.capabilities.projectGraph === true) {
    return input.owner;
  }
  const ownerHost = connectionHost(owner.displayUrl);
  if (ownerHost === null) return input.owner;
  const borrowed = environments.find(
    (environment) =>
      environment.environmentId !== input.owner &&
      environment.connection.phase === "connected" &&
      environment.serverConfig?.environment.capabilities.projectGraph === true &&
      environment.serverConfig.environment.platform.os === ownerDescriptor.platform.os &&
      connectionHost(environment.displayUrl) === ownerHost,
  );
  return borrowed?.environmentId ?? input.owner;
}

function connectionHost(displayUrl: string | null): string | null {
  if (displayUrl === null) return null;
  let hostname: string;
  try {
    hostname = new URL(displayUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  return isLoopbackHost(hostname) ? "loopback" : hostname;
}
