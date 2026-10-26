import {
  scopeProjectRef,
  scopedThreadKey,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  DailyDigestPageSnapshot,
  type EnvironmentId,
  type ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { htmlRenderFileName, type HtmlRenderReference } from "@t3tools/shared/htmlRender";
import { sanitizeLinkedPrompt } from "@t3tools/shared/promptLinks";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { type ReactNode, useEffect, useState } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useTheme } from "~/hooks/useTheme";
import { cn } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";
import { useProject, useThreadShell } from "~/state/entities";
import { providerEntriesByEnvironmentAtom } from "~/state/providerEntries";
import { buildThreadRouteParams } from "~/threadRoutes";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { openExpandedImagePreview } from "../chat/ExpandedImageDialog";
import { FileTagChipContent } from "../chat/FileTagChip";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { ProjectFavicon } from "../ProjectFavicon";
import { useOpenProjectGraph } from "../project-graph/projectGraphNavigation";
import { placeLinkedPrompt, sendLinkedPrompt } from "../promptLinks/linkedPrompt";
import { resolveThreadStatusPill } from "../Sidebar.logic";
import { ThreadStatusLabel } from "../ThreadStatusIndicators";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

type Snapshot = DailyDigestPageSnapshot;
type Visual = Snapshot["content"]["visuals"][number];

const decodeSnapshot = Schema.decodeUnknownSync(Schema.fromJsonString(DailyDigestPageSnapshot));
const SHOWN_ITEMS = 6;
const CARD = "relative rounded-2xl bg-(--panel-surface) panel-edge squircle";
const STATUS_BADGES = {
  shipped: ["Shipped", "success"],
  in_progress: ["In progress", "info"],
  blocked: ["Needs you", "warning"],
  research: ["Research", "secondary"],
  idle: ["Idle", "secondary"],
} as const;

type SnapshotState =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "ready"; readonly snapshot: Snapshot };

// Digests published before snapshots existed only have their HTML page.
function useDigestSnapshot(environmentId: EnvironmentId, htmlRender: HtmlRenderReference) {
  const asset = useAssetUrlState(environmentId, {
    _tag: "attachment",
    attachmentId: htmlRender.attachmentId,
    fileName: htmlRenderFileName(htmlRender.title),
    mimeType: "text/html",
    disposition: "inline",
  });
  const url = asset._tag === "Success" ? asset.url : null;
  const failed = asset._tag === "Failure";
  const [state, setState] = useState<SnapshotState>({ status: "loading" });
  useEffect(() => {
    if (failed) {
      // oxlint-disable-next-line react/set-state-in-effect -- Mirrors the asset URL's failure.
      setState({ status: "missing" });
      return;
    }
    if (url === null) return;
    const controller = new AbortController();
    const snapshotUrl = new URL(url, window.location.href);
    snapshotUrl.searchParams.set("digest", "");
    fetch(snapshotUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Digest snapshot ${response.status}`);
        setState({ status: "ready", snapshot: decodeSnapshot(await response.text()) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "missing" });
      });
    return () => controller.abort();
  }, [url, failed]);
  return state;
}

/** A digest rendered with the app's own components, so every row opens what it names. */
export function DigestPage(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly htmlRender: HtmlRenderReference;
  readonly fallback: ReactNode;
}) {
  const state = useDigestSnapshot(props.environmentId, props.htmlRender);
  if (state.status === "missing") return props.fallback;
  if (state.status === "loading") return <Skeleton className="h-[640px] w-full" />;
  return (
    <DigestView
      snapshot={state.snapshot}
      environmentId={props.environmentId}
      threadRef={props.threadRef}
    />
  );
}

/** Backticks become code, as in the agent's text everywhere else. */
function Rich(props: { readonly text: string }) {
  return props.text.split(/(`[^`]+`)/g).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      // oxlint-disable-next-line react/no-array-index-key -- The split is stable for one string.
      <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.86em]">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function formatClock(ms: number, timeZone: string | undefined) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(ms);
}

function DigestView(props: {
  readonly snapshot: Snapshot;
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
}) {
  const { content, context } = props.snapshot;
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  const openProjectGraph = useOpenProjectGraph();
  const digestShell = useThreadShell(props.threadRef);
  const projectRef = digestShell
    ? scopeProjectRef(props.environmentId, digestShell.projectId)
    : null;
  const project = useProject(projectRef);
  const commits = context.activity.reduce((sum, count) => sum + count, 0);
  const threadRefFor = (threadId: string) =>
    scopeThreadRef(props.environmentId, ThreadId.make(threadId));
  const openThread = (threadId: string) =>
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRefFor(threadId)),
    });
  const answerInThread = (threadId: string, prompt: string) => {
    placeLinkedPrompt(threadRefFor(threadId), sanitizeLinkedPrompt(prompt));
    openThread(threadId);
  };
  const startThread = async (prompt: string) => {
    if (projectRef === null) return;
    const opened = await handleNewThread(projectRef).catch(() => null);
    if (opened !== null) sendLinkedPrompt(opened.draftId, sanitizeLinkedPrompt(prompt));
  };
  const expandImage = (src: string, name: string) =>
    openExpandedImagePreview(scopedThreadKey(props.threadRef), {
      images: [{ src, name }],
      index: 0,
    });
  const imageSrc = (visual: Extract<Visual, { kind: "image" }>) =>
    props.snapshot.images[visual.path] ?? null;
  const [lead, ...moreVisuals] = content.visuals.filter(
    (visual) => visual.kind !== "image" || imageSrc(visual) !== null,
  );
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(context.timeZone ? { timeZone: context.timeZone } : {}),
  }).format(context.untilMs);

  const visualCard = (visual: Visual, className?: string) => (
    <figure className={cn(CARD, "m-0 flex flex-col overflow-hidden", className)}>
      {visual.kind === "image" ? (
        <button
          type="button"
          className="relative min-h-60 flex-1 cursor-zoom-in overflow-hidden border-b border-border/40 bg-background"
          onClick={() => expandImage(imageSrc(visual) ?? "", visual.title)}
        >
          <img
            src={imageSrc(visual) ?? ""}
            alt={visual.title}
            className="absolute inset-0 size-full object-cover object-top"
          />
        </button>
      ) : null}
      <figcaption className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="font-medium text-sm">{visual.title}</div>
          {visual.caption ? (
            <div className="mt-0.5 text-muted-foreground text-sm">
              <Rich text={visual.caption} />
            </div>
          ) : null}
        </div>
        {visual.threadId ? (
          <Button variant="outline" size="sm" onClick={() => openThread(visual.threadId!)}>
            Open
          </Button>
        ) : null}
      </figcaption>
      {visual.kind === "bars" ? <Bars visual={visual} /> : null}
    </figure>
  );

  return (
    <div className="@container mx-auto flex w-full max-w-[1240px] flex-col gap-5 pb-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {project ? <ProjectFavicon project={project} className="size-8" /> : null}
          <h1 className="m-0 truncate font-semibold text-xl">{context.projectTitle} digest</h1>
          <Badge variant="outline">{commits === 1 ? "1 commit" : `${commits} commits`}</Badge>
        </div>
        <Badge variant="secondary" size="lg">
          {today}
        </Badge>
      </header>

      <div className="grid gap-5 @3xl:grid-cols-[5fr_7fr]">
        <section
          className={cn(CARD, "flex min-h-72 flex-col justify-between gap-10 overflow-hidden p-7")}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="outline" size="lg">
              {content.mood}
            </Badge>
            <span className="text-muted-foreground text-xs">
              Summarized at {formatClock(context.untilMs, context.timeZone)}
            </span>
          </div>
          <div>
            <p className="m-0 max-w-[30ch] text-pretty font-semibold text-2xl leading-snug">
              <Rich text={content.headline} />
            </p>
            <p className="mt-3 mb-0 max-w-[58ch] text-muted-foreground text-sm leading-relaxed">
              <Rich text={content.summary} />
            </p>
          </div>
        </section>
        {lead ? (
          visualCard(lead)
        ) : (
          <section className={cn(CARD, "flex flex-col justify-between gap-6 p-6")}>
            <header className="flex items-baseline justify-between gap-3">
              <h3 className="m-0 font-medium text-muted-foreground text-sm">Commit activity</h3>
              <span className="text-muted-foreground text-xs">
                Since {formatClock(context.sinceMs, context.timeZone)}
              </span>
            </header>
            <Spark activity={context.activity} className="h-24" />
            <div className="flex justify-between text-muted-foreground text-xs tabular-nums">
              <span>{formatClock(context.sinceMs, context.timeZone)}</span>
              <span>{formatClock(context.untilMs, context.timeZone)}</span>
            </div>
          </section>
        )}
      </div>

      <div className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-4">
        <StatCard title="Commits" count={commits}>
          {context.commits ? (
            <ExpandableList
              total={commits}
              empty="No commits in this window."
              items={context.commits.map((commit) => (
                <ListRowButton key={commit.hash} onClick={openProjectGraph}>
                  <span className="truncate">{commit.subject}</span>
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
                    <code className="font-mono">{commit.hash}</code>
                    {commit.branch ? <span className="truncate">{commit.branch}</span> : null}
                    <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums">
                      {formatClock(commit.timeMs, context.timeZone)}
                    </span>
                  </span>
                </ListRowButton>
              ))}
            />
          ) : (
            <Spark activity={context.activity} className="h-8" />
          )}
        </StatCard>
        {context.repo ? (
          <>
            <StatCard title="Uncommitted files" count={context.repo.uncommittedFiles}>
              {context.repo.files ? (
                <FileRows
                  files={context.repo.files}
                  total={context.repo.uncommittedFiles}
                  environmentId={props.environmentId}
                  threadRef={props.threadRef}
                  cwd={project?.workspaceRoot}
                />
              ) : null}
            </StatCard>
            <StatCard title="Unpushed commits" count={context.repo.unpushedCommits}>
              {context.repo.unpushedBranches ? (
                <ExpandableList
                  total={context.repo.unpushedBranches.length}
                  empty="Everything is pushed."
                  items={context.repo.unpushedBranches.map((entry) => (
                    <ListRowButton key={entry.branch} onClick={openProjectGraph}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate">{entry.branch}</span>
                        <span className="font-medium tabular-nums">{entry.count}</span>
                      </span>
                    </ListRowButton>
                  ))}
                />
              ) : null}
            </StatCard>
          </>
        ) : null}
        {content.facts.length > 0 ? (
          <StatCard title="Also">
            <ul className="m-0 list-none p-0">
              {content.facts.map((fact) => (
                <li
                  key={fact.label}
                  className="flex items-center justify-between gap-3 border-border/50 border-t py-2 text-sm"
                >
                  <span className="truncate">
                    <Rich text={fact.label} />
                  </span>
                  <span className="font-medium tabular-nums">
                    <Rich text={fact.value} />
                  </span>
                </li>
              ))}
            </ul>
          </StatCard>
        ) : null}
      </div>

      {moreVisuals.length > 0 ? (
        <DigestSection title="Highlights">
          <div className="grid items-start gap-5 @2xl:grid-cols-2">
            {moreVisuals.map((visual) => (
              <div key={visual.title}>{visualCard(visual)}</div>
            ))}
          </div>
        </DigestSection>
      ) : null}

      {context.threads.length > 0 ? (
        <DigestSection title="Threads" aside={`${context.threads.length} active`}>
          <div className="grid gap-2.5 @xl:grid-cols-2 @5xl:grid-cols-4">
            {context.threads.map((thread) => (
              <DigestThreadRow
                key={thread.id}
                threadRef={threadRefFor(thread.id)}
                fallback={thread}
                onOpen={() => openThread(thread.id)}
              />
            ))}
          </div>
        </DigestSection>
      ) : null}

      {content.sections.length > 0 ? (
        <DigestSection title="What happened" aside={`${content.sections.length} workstreams`}>
          <div className={cn(CARD, "overflow-hidden")}>
            {content.sections.map((section) => {
              const [label, variant] = STATUS_BADGES[section.status];
              return (
                <div
                  key={section.title}
                  className="grid items-center gap-x-6 gap-y-1.5 border-border/50 border-t px-6 py-4 first:border-t-0 @3xl:grid-cols-[minmax(0,1.7fr)_auto_minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{section.title}</div>
                    <div className="mt-0.5 text-muted-foreground text-sm">
                      <Rich text={section.summary} />
                    </div>
                  </div>
                  <Badge variant={variant}>{label}</Badge>
                  <div className="text-sm text-warning-foreground">
                    {section.issue ? <Rich text={section.issue} /> : null}
                  </div>
                  {section.threadId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-self-end"
                      onClick={() => openThread(section.threadId!)}
                    >
                      Open
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
        </DigestSection>
      ) : null}

      {content.decisions.length > 0 || content.nextSteps.length > 0 ? (
        <DigestSection title="How to proceed">
          <div className="grid items-start gap-5 @3xl:grid-cols-2">
            {content.decisions.length > 0 ? (
              <ActionList title="Your call">
                {content.decisions.map((decision) => (
                  <ActionRow
                    key={decision.question}
                    marker={<span className="size-2 rounded-full bg-warning" />}
                    title={decision.question}
                    detail={decision.context}
                    action={
                      decision.threadId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => answerInThread(decision.threadId!, decision.prompt ?? "")}
                        >
                          Answer
                        </Button>
                      ) : decision.prompt ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void startThread(decision.prompt!)}
                        >
                          Start thread
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </ActionList>
            ) : null}
            {content.nextSteps.length > 0 ? (
              <ActionList title="Next steps">
                {content.nextSteps.map((step, index) => (
                  <ActionRow
                    key={step.title}
                    marker={
                      <span className="flex size-6 items-center justify-center rounded-full bg-muted font-medium text-xs tabular-nums">
                        {index + 1}
                      </span>
                    }
                    title={step.title}
                    detail={step.reason}
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void startThread(step.prompt)}
                      >
                        Start thread
                      </Button>
                    }
                  />
                ))}
              </ActionList>
            ) : null}
          </div>
        </DigestSection>
      ) : null}
    </div>
  );
}

function DigestSection(props: {
  readonly title: string;
  readonly aside?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="mt-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="m-0 font-semibold text-base text-muted-foreground">{props.title}</h2>
        {props.aside ? <span className="text-muted-foreground text-xs">{props.aside}</span> : null}
      </div>
      {props.children}
    </section>
  );
}

function StatCard(props: {
  readonly title: string;
  readonly count?: number;
  readonly children?: ReactNode;
}) {
  return (
    <section className={cn(CARD, "flex flex-col px-5 pt-4 pb-3")}>
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="m-0 font-medium text-muted-foreground text-sm">{props.title}</h3>
        {props.count === undefined ? null : (
          <strong className="font-semibold text-3xl tabular-nums leading-none tracking-tight">
            {props.count}
          </strong>
        )}
      </header>
      {props.children}
    </section>
  );
}

function ExpandableList(props: {
  readonly items: ReadonlyArray<ReactNode>;
  readonly total: number;
  readonly empty: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (props.items.length === 0) {
    return <p className="my-1 text-muted-foreground text-sm">{props.empty}</p>;
  }
  const shown = expanded ? props.items : props.items.slice(0, SHOWN_ITEMS);
  const hidden = props.total - shown.length;
  return (
    <>
      <ul className="m-0 list-none p-0">{shown}</ul>
      {hidden > 0 && props.items.length > shown.length ? (
        <Button
          variant="ghost-muted"
          size="xs"
          className="mt-1 self-start"
          onClick={() => setExpanded(true)}
        >
          Show {props.items.length - shown.length} more
        </Button>
      ) : hidden > 0 ? (
        <p className="my-1 text-muted-foreground text-xs">and {hidden} more</p>
      ) : null}
    </>
  );
}

function ListRowButton(props: { readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <li className="border-border/50 border-t">
      <button
        type="button"
        onClick={props.onClick}
        className="-mx-2 flex w-[calc(100%+1rem)] min-w-0 cursor-pointer flex-col gap-0.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-(--panel-surface-hover)"
      >
        {props.children}
      </button>
    </li>
  );
}

function FileRows(props: {
  readonly files: ReadonlyArray<{ readonly status: string; readonly path: string }>;
  readonly total: number;
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly cwd: string | undefined;
}) {
  const { resolvedTheme } = useTheme();
  return (
    <ExpandableList
      total={props.total}
      empty="The checkout is clean."
      items={props.files.map((file) => (
        <ListRowButton
          key={file.path}
          onClick={() => useRightPanelStore.getState().openFile(props.threadRef, file.path)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <code className="w-6 shrink-0 text-center font-mono text-muted-foreground text-xs">
              {file.status}
            </code>
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <FileTagChipContent
                path={file.path}
                label={file.path}
                theme={resolvedTheme}
                environmentId={props.environmentId}
                cwd={props.cwd}
              />
            </span>
          </span>
        </ListRowButton>
      ))}
    />
  );
}

function DigestThreadRow(props: {
  readonly threadRef: ScopedThreadRef;
  readonly fallback: Snapshot["context"]["threads"][number];
  readonly onOpen: () => void;
}) {
  const shell = useThreadShell(props.threadRef);
  const providerEntries = useAtomValue(providerEntriesByEnvironmentAtom);
  const pill = shell ? resolveThreadStatusPill({ thread: shell }) : null;
  const provider = shell
    ? (providerEntries.get(shell.environmentId)?.get(shell.providerInstanceId) ?? null)
    : null;
  const title = shell?.title ?? props.fallback.title;
  const branch = shell ? shell.branch : (props.fallback.branch ?? null);
  return (
    <button
      type="button"
      onClick={props.onOpen}
      className={cn(
        CARD,
        "flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-xl px-3 py-2.5 text-left hover:bg-(--panel-surface-hover)",
      )}
    >
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span
          className={cn("truncate text-sm", pill ? "text-foreground" : "text-muted-foreground")}
        >
          {title}
        </span>
        {pill ? (
          <ThreadStatusLabel status={pill} />
        ) : (
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {shell
              ? formatRelativeTimeLabel(shell.latestUserMessageAt ?? shell.updatedAt)
              : formatRelativeTimeLabel(new Date(props.fallback.activityMs).toISOString())}
          </span>
        )}
      </span>
      <span className="flex min-h-3.5 items-center justify-between gap-2 text-muted-foreground/70 text-xs">
        <span className="truncate">{branch ?? ""}</span>
        {provider ? (
          <ProviderInstanceIcon
            driverKind={provider.driverKind}
            displayName={provider.displayName}
            accentColor={provider.accentColor}
            acpRegistryAgentId={provider.acpRegistryAgentId}
            acpRegistryIconUrl={provider.acpRegistryIconUrl}
            size="compact"
            iconClassName="opacity-60"
          />
        ) : null}
      </span>
    </button>
  );
}

function ActionList(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className={cn(CARD, "px-6 pt-5 pb-2")}>
      <h3 className="m-0 mb-1 font-semibold text-sm">{props.title}</h3>
      <div className="flex flex-col">{props.children}</div>
    </section>
  );
}

function ActionRow(props: {
  readonly marker: ReactNode;
  readonly title: string;
  readonly detail: string;
  readonly action: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 border-border/50 border-t py-3.5 first:border-t-0">
      <span className="row-span-2 flex size-6 items-center justify-center self-start">
        {props.marker}
      </span>
      <span className="font-medium text-sm">
        <Rich text={props.title} />
      </span>
      <span className="row-span-2 self-center">{props.action}</span>
      <span className="col-start-2 text-muted-foreground text-sm">
        <Rich text={props.detail} />
      </span>
    </div>
  );
}

function Bars(props: { readonly visual: Extract<Visual, { kind: "bars" }> }) {
  const max = Math.max(...props.visual.items.map((item) => Math.abs(item.value)), Number.MIN_VALUE);
  const unit = props.visual.unit ?? "";
  const spaced = /^\p{L}{2,}/u.test(unit) ? ` ${unit}` : unit;
  return (
    <div className="grid gap-3.5 px-5 pb-6">
      {props.visual.items.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[minmax(90px,32%)_minmax(0,1fr)_auto] items-center gap-3.5 text-sm"
        >
          <span
            className={cn("truncate", item.highlight ? "text-foreground" : "text-muted-foreground")}
          >
            {item.label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                "block h-full rounded-full",
                item.highlight ? "bg-foreground" : "bg-muted-foreground/40",
              )}
              style={{ width: `${Math.max(2, (Math.abs(item.value) / max) * 100)}%` }}
            />
          </span>
          <span className="whitespace-nowrap text-right font-medium tabular-nums">
            {item.value.toLocaleString()}
            <span className="font-normal text-muted-foreground">{spaced}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Spark(props: { readonly activity: ReadonlyArray<number>; readonly className?: string }) {
  const max = Math.max(1, ...props.activity);
  return (
    <div
      className={cn("grid items-end", props.className)}
      style={{ gridTemplateColumns: `repeat(${props.activity.length}, minmax(0, 1fr))` }}
    >
      {props.activity.map((count, index) => (
        <span
          // oxlint-disable-next-line react/no-array-index-key -- Slots are positional.
          key={index}
          className="w-0.5 justify-self-center rounded-full bg-muted-foreground/50"
          style={{ height: count === 0 ? 1 : `${Math.max(10, (count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
