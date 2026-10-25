import { useAuth } from "@clerk/react";
import type { EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { APP_DISPLAY_NAME, DESKTOP_DOWNLOAD_URL } from "~/branding";
import { hasCloudPublicConfig } from "~/cloud/publicConfig";
import { isElectron } from "../env";
import { isLocalEnvironmentDisabled } from "../localEnvironment";
import { useRelayEnvironmentDiscovery } from "../state/environments";
import { CommandBlock } from "./CommandBlock";
import { useT3ConnectAuthPrompt } from "./clerk/useT3ConnectAuthPrompt";
import { CloudEnvironmentConnectRows } from "./cloud/CloudEnvironmentConnectList";
import { Button } from "./ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { SidebarInset } from "./ui/sidebar";
import { WorkspacePageHeader } from "./WorkspacePageHeader";

/** Home screen for the hosted app before any computer is added. */
export function HostedEmptyState() {
  const cloudEnabled = hasCloudPublicConfig();
  const localEnvironmentOff = isLocalEnvironmentDisabled();

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <WorkspacePageHeader electron={isElectron} className="border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
              {APP_DISPLAY_NAME}
            </span>
          </div>
        </WorkspacePageHeader>

        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyTitle>
              {localEnvironmentOff ? "This computer is off" : "No computer connected"}
            </EmptyTitle>
            <EmptyDescription>
              {localEnvironmentOff
                ? "Turn it back on, or connect a different computer."
                : cloudEnabled
                  ? "Your agents run on your computer."
                  : "Your agents run on your computer. Start T3 Code there first."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {localEnvironmentOff ? (
              <Button variant="contrast" render={<Link to="/settings/connections" />} size="lg">
                Open Connections
              </Button>
            ) : (
              <>
                <ol className="w-full space-y-6 text-left">
                  {cloudEnabled ? <T3ConnectSteps /> : <PairingSteps />}
                </ol>
                <DesktopDownloadLink />
              </>
            )}
          </EmptyContent>
        </Empty>
      </div>
    </SidebarInset>
  );
}

export function T3ConnectSteps() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { openAuthPrompt } = useT3ConnectAuthPrompt();
  // Adding the first computer unmounts this screen. Wait for all health checks
  // so every compatible registration is queued before that happens.
  const [autoAddedComputers] = useState(() => new Set<EnvironmentId>());
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<EnvironmentId>>(() => new Set());
  const discovered = [...useRelayEnvironmentDiscovery().environments.values()];
  const discoverySettled =
    discovered.length > 0 && discovered.every(({ availability }) => availability !== "checking");
  return (
    <>
      <SetupStep number={1} title="Sign in to T3 Connect">
        {isSignedIn ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <CheckIcon className="size-4" />
            Signed in
          </p>
        ) : (
          <Button variant="contrast" size="lg" disabled={!isLoaded} onClick={openAuthPrompt}>
            Sign in
          </Button>
        )}
      </SetupStep>
      <SetupStep number={2} title="Run on your computer">
        <CommandBlock command="npx t3 connect" />
        {isSignedIn ? (
          <div className="mt-4 space-y-1.5">
            <CloudEnvironmentConnectRows
              primaryEnvironmentId={null}
              savedEnvironments={[]}
              refreshWhileEmpty
              selection={{
                ...(discoverySettled ? { autoSelectedComputers: autoAddedComputers } : {}),
                selectedIds,
                onChange: (environmentId, selected) =>
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    if (selected) next.add(environmentId);
                    else next.delete(environmentId);
                    return next;
                  }),
              }}
              empty={<p className="text-xs text-muted-foreground">Waiting for your computer…</p>}
            />
          </div>
        ) : null}
      </SetupStep>
    </>
  );
}

function PairingSteps() {
  return (
    <>
      <SetupStep number={1} title="Run on your computer">
        <CommandBlock command="npx t3 pair" />
      </SetupStep>
      <SetupStep number={2} title="Add the pairing link it prints">
        <Button variant="contrast" render={<Link to="/settings/connections" />} size="lg">
          Add pairing link
        </Button>
      </SetupStep>
    </>
  );
}

function SetupStep({
  number,
  title,
  children,
}: {
  readonly number: number;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <li className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-2xs font-medium text-muted-foreground tabular-nums">
          {number}
        </span>
        <p className="text-sm leading-5 font-medium">{title}</p>
      </div>
      <div className="grid">{children}</div>
    </li>
  );
}

function DesktopDownloadLink() {
  return (
    <a
      className="mt-4 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      href={DESKTOP_DOWNLOAD_URL}
      target="_blank"
      rel="noreferrer noopener"
    >
      Prefer an app? Download the desktop app
    </a>
  );
}
