import {
  scopeProjectRef,
  scopedThreadKey,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  DailyDigestPageSnapshot,
  EnvironmentId,
  type EnvironmentMachineKind,
  ProjectId,
  ProviderDriverKind,
  type AssetResource,
  type ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import { htmlRenderFileName, type HtmlRenderReference } from "@t3tools/shared/htmlRender";
import { sanitizeLinkedPrompt } from "@t3tools/shared/promptLinks";
import { useAtomValue } from "@effect/atom-react";
import { ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

import { useAssetUrls, useAssetUrlState } from "~/assets/assetUrls";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useClientSettings } from "~/hooks/useSettings";
import { useTheme } from "~/hooks/useTheme";
import { cn } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";
import { useProject, useThreadShell } from "~/state/entities";
import {
  useEnvironmentIdentities,
  useEnvironmentMachines,
  usePrimaryEnvironmentId,
} from "~/state/environments";
import { providerEntriesByEnvironmentAtom } from "~/state/providerEntries";
import { buildThreadRouteParams } from "~/threadRoutes";
import { openExpandedImagePreview } from "../chat/ExpandedImageDialog";
import { FileTagChipContent } from "../chat/FileTagChip";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { ProjectFavicon } from "../ProjectFavicon";
import { useOpenProjectGraph } from "../project-graph/projectGraphNavigation";
import { placeLinkedPrompt, sendLinkedPrompt } from "../promptLinks/linkedPrompt";
import {
  SidebarThreadCardPreview,
  SidebarThreadRow,
  type SidebarProviderEntry,
} from "../sidebar/SidebarThreadRow";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

type Snapshot = DailyDigestPageSnapshot;
type Visual = Snapshot["content"]["visuals"][number];

const decodeSnapshot = Schema.decodeUnknownSync(Schema.fromJsonString(DailyDigestPageSnapshot));
const SHOWN_ITEMS = 6;
const CARD = "relative rounded-2xl bg-(--panel-surface) panel-edge squircle";
const STATUS_LABELS = {
  shipped: "Shipped",
  in_progress: "In progress",
  blocked: "Needs you",
  research: "Research",
  idle: "Idle",
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

// The icon's average colour, saturated, lights the page the way Fey lights one by its ticker.
function useIconGlow(src: string | undefined) {
  const [glow, setGlow] = useState<{ readonly src: string; readonly color: string } | null>(null);
  useEffect(() => {
    if (!src) return;
    const image = new Image();
    const controller = new AbortController();
    image.addEventListener(
      "load",
      () => {
        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, 8, 8);
        const data = context.getImageData(0, 0, 8, 8).data;
        let [r, g, b, n] = [0, 0, 0, 0];
        for (let index = 0; index < data.length; index += 4) {
          if (data[index + 3]! < 128) continue;
          r += data[index]!;
          g += data[index + 1]!;
          b += data[index + 2]!;
          n += 1;
        }
        if (n === 0) return;
        const average = `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`;
        setGlow({ src, color: `oklch(from ${average} 0.72 min(0.16, calc(c * 2)) h)` });
      },
      { signal: controller.signal },
    );
    image.src = src;
    return () => controller.abort();
  }, [src]);
  return glow !== null && glow.src === src ? glow.color : null;
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
  const threadEnvironmentId = EnvironmentId.make(context.environmentId);
  const projectRef = context.remote
    ? scopeProjectRef(threadEnvironmentId, ProjectId.make(context.remote.projectId))
    : digestShell
      ? scopeProjectRef(props.environmentId, digestShell.projectId)
      : null;
  const project = useProject(projectRef);
  const iconImage = context.icon?.startsWith("data:image/") ? context.icon : undefined;
  const glow = useIconGlow(iconImage);
  const commits = context.activity.reduce((sum, count) => sum + count, 0);
  const threadRefFor = (threadId: string) =>
    scopeThreadRef(threadEnvironmentId, ThreadId.make(threadId));
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
  const remoteImages = context.remote
    ? content.visuals.filter((visual) => visual.kind === "image" && visual.threadId !== undefined)
    : [];
  const resources: AssetResource[] = remoteImages.map((visual) => ({
    _tag: "media-file",
    threadId: ThreadId.make(visual.threadId!),
    path: visual.kind === "image" ? visual.path : "",
  }));
  const imageUrls = useAssetUrls(threadEnvironmentId, resources);
  const imageSrc = (visual: Extract<Visual, { kind: "image" }>) =>
    props.snapshot.images[visual.path] ?? imageUrls[remoteImages.indexOf(visual)] ?? null;
  const visuals = content.visuals.filter(
    (visual) =>
      visual.kind !== "image" || imageSrc(visual) !== null || (context.remote && visual.threadId),
  );
  const images = visuals.filter((visual) => visual.kind === "image");
  const charts = visuals.filter((visual) => visual.kind === "bars");
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(context.timeZone ? { timeZone: context.timeZone } : {}),
  }).format(context.untilMs);
  type ActivityList = "commits" | "files" | "branches";
  const stats: ReadonlyArray<{
    readonly label: string;
    readonly value: string;
    readonly list?: ActivityList;
  }> = [
    context.remote
      ? { label: "Threads", value: String(context.threads.length) }
      : {
          label: "Commits",
          value: String(commits),
          ...(context.commits && commits > 0 ? { list: "commits" as const } : {}),
        },
    ...(context.repo
      ? [
          {
            label: "Uncommitted",
            value: String(context.repo.uncommittedFiles),
            ...(context.repo.files?.length ? { list: "files" as const } : {}),
          },
          {
            label: "Unpushed",
            value: String(context.repo.unpushedCommits),
            ...(context.repo.unpushedBranches?.length ? { list: "branches" as const } : {}),
          },
        ]
      : []),
    ...content.facts,
  ];
  const [openList, setOpenList] = useState<ActivityList | null>(null);
  const hasBriefing = content.decisions.length > 0 || content.nextSteps.length > 0;

  const visualCard = (visual: Visual) =>
    visual.kind === "image" ? (
      <figure className={cn(CARD, "m-0 flex w-full overflow-hidden bg-background")}>
        {imageSrc(visual) !== null ? (
          <button
            type="button"
            aria-label={visual.title}
            className="block w-full cursor-zoom-in"
            onClick={() => expandImage(imageSrc(visual) ?? "", visual.title)}
          >
            <img
              src={imageSrc(visual) ?? ""}
              alt={visual.title}
              className="block h-[25rem] w-auto min-w-80 max-w-none object-cover object-top"
            />
          </button>
        ) : (
          <div className="flex h-[25rem] w-80 items-center justify-center p-6 text-center text-muted-foreground text-sm">
            Connect to {context.remote?.machine} to load this screenshot.
          </div>
        )}
      </figure>
    ) : (
      <figure className={cn(CARD, "m-0 flex w-full flex-col overflow-hidden")}>
        <figcaption className="flex items-start justify-between gap-2 px-5 pt-4 pb-0.5">
          <div className="min-w-0">
            <div className="font-medium text-xs leading-snug">{visual.title}</div>
            {visual.caption ? (
              <div className="mt-0.5 line-clamp-1 text-muted-foreground text-xs leading-relaxed">
                <Rich text={visual.caption} />
              </div>
            ) : null}
          </div>
          {visual.threadId ? (
            <Button variant="ghost-muted" size="xs" onClick={() => openThread(visual.threadId!)}>
              Open
            </Button>
          ) : null}
        </figcaption>
        <Bars visual={visual} />
      </figure>
    );

  const happened =
    content.sections.length > 0 ? (
      <BriefingCard title="What happened">
        {content.sections.map((section) => (
          <BriefingRow
            key={section.title}
            marker={<StatusDot status={section.status} />}
            title={section.title}
            aside={<StatusLabel status={section.status} />}
            detail={section.summary}
            issue={section.issue}
            onClick={section.threadId ? () => openThread(section.threadId!) : undefined}
          />
        ))}
      </BriefingCard>
    ) : null;
  const whatsNext = hasBriefing ? (
    <BriefingCard title="What's next">
      {content.decisions.map((decision) => (
        <BriefingRow
          key={decision.question}
          marker={<span className="size-1.5 rounded-full bg-warning text-warning digest-halo" />}
          title={decision.question}
          detail={decision.context}
          action={decision.threadId || decision.prompt ? "Answer" : undefined}
          onClick={
            decision.threadId
              ? () => answerInThread(decision.threadId!, decision.prompt ?? "")
              : decision.prompt
                ? () => void startThread(decision.prompt!)
                : undefined
          }
        />
      ))}
      {content.nextSteps.map((step, index) => (
        <BriefingRow
          key={step.title}
          marker={
            <span className="font-medium text-muted-foreground text-xs tabular-nums">
              {index + 1}
            </span>
          }
          title={step.title}
          detail={step.reason}
          action="Start"
          onClick={() => void startThread(step.prompt)}
        />
      ))}
    </BriefingCard>
  ) : null;
  const chartCards =
    charts.length > 0 ? (
      <div className="grid gap-6 @3xl:grid-cols-2">
        {charts.map((visual) => (
          <div key={visual.title} className="flex">
            {visualCard(visual)}
          </div>
        ))}
      </div>
    ) : null;

  const hero = (
    <section className="relative flex flex-1 flex-col justify-between gap-6 overflow-hidden rounded-2xl px-8 pt-6 pb-7 squircle digest-lit">
      <span className="font-medium text-muted-foreground text-sm">{content.mood}</span>
      <div className="flex flex-col gap-3">
        <p className="m-0 max-w-[36ch] text-pretty font-semibold text-3xl leading-tight tracking-tight">
          <Rich text={content.headline} />
        </p>
        <p className="m-0 max-w-[72ch] text-muted-foreground text-sm leading-relaxed">
          <Rich text={content.summary} />
        </p>
      </div>
    </section>
  );
  return (
    <div
      className="@container mx-auto flex w-full max-w-[1240px] flex-col gap-8 pb-12"
      style={glow ? ({ "--lit": glow } as CSSProperties) : undefined}
    >
      <header className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <h1 className="m-0 flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 font-semibold text-xl">
          <span className="shrink-0">Daily Digest</span>
          <span className="inline-flex min-w-0 items-center gap-3">
            {iconImage ? (
              <img src={iconImage} alt="" className="size-8 shrink-0 rounded-lg object-contain" />
            ) : project ? (
              <ProjectFavicon project={project} className="size-8" />
            ) : null}
            <span className="truncate">{context.projectTitle}</span>
          </span>
          {context.remote ? <Badge variant="outline">{context.remote.machine}</Badge> : null}
        </h1>
        <span className="text-muted-foreground text-sm">
          <span className="font-medium text-foreground">{today}</span>
          {" · "}
          {formatClock(context.untilMs, context.timeZone)}
        </span>
      </header>

      {images.length > 0 ? (
        <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-6">
            {hero}
            {chartCards}
          </div>
          <div className="flex flex-wrap gap-6">
            {images.map((visual) => (
              <div key={visual.title} className="flex w-min max-w-full">
                {visualCard(visual)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {hero}
          {chartCards}
        </>
      )}

      {happened || whatsNext ? (
        <div className={cn("grid gap-6", happened && whatsNext && "@4xl:grid-cols-2")}>
          {happened}
          {whatsNext}
        </div>
      ) : null}

      <section className={cn(CARD, "overflow-hidden")}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]">
          {stats.map((stat) => {
            const list = stat.list;
            const body = (
              <>
                <span className="truncate text-muted-foreground text-xs">
                  <Rich text={stat.label} />
                </span>
                <span className="font-semibold text-base tabular-nums leading-none">
                  <Rich text={stat.value} />
                </span>
              </>
            );
            const cell = "flex flex-col items-center justify-center gap-2 px-4 py-5 text-center";
            return list ? (
              <button
                key={stat.label}
                type="button"
                aria-expanded={openList === list}
                onClick={() => setOpenList(openList === list ? null : list)}
                className={cn(
                  cell,
                  "cursor-pointer digest-groove-divider hover:bg-(--panel-surface-hover)",
                  openList === list && "bg-(--panel-surface-hover)",
                )}
              >
                {body}
              </button>
            ) : (
              <div key={stat.label} className={cn(cell, "digest-groove-divider")}>
                {body}
              </div>
            );
          })}
        </div>
        {context.remote ? null : (
          <div className="relative px-6 pb-4">
            <div aria-hidden className="absolute inset-0 digest-dot-grid" />
            <Spark activity={context.activity} className="relative h-8" />
            <div className="relative mt-1.5 flex justify-between text-muted-foreground/70 text-xs tabular-nums">
              <span>{formatClock(context.sinceMs, context.timeZone)}</span>
              <span>{formatClock(context.untilMs, context.timeZone)}</span>
            </div>
          </div>
        )}
        {openList ? (
          <div className="flex flex-col px-5 pb-3 digest-grooves">
            {openList === "commits" && context.commits ? (
              <ExpandableList
                total={commits}
                empty="No commits in this window."
                items={context.commits.map((commit) => (
                  <ListRowButton key={commit.hash} onClick={openProjectGraph}>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="truncate">{commit.subject}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-2 text-muted-foreground text-xs">
                        {commit.branch ? (
                          <span className="max-w-48 truncate">{commit.branch}</span>
                        ) : null}
                        <span className="tabular-nums">
                          {formatClock(commit.timeMs, context.timeZone)}
                        </span>
                      </span>
                    </span>
                  </ListRowButton>
                ))}
              />
            ) : openList === "files" && context.repo?.files ? (
              <FileRows
                files={context.repo.files}
                total={context.repo.uncommittedFiles}
                environmentId={props.environmentId}
                threadRef={props.threadRef}
                cwd={project?.workspaceRoot}
              />
            ) : openList === "branches" && context.repo?.unpushedBranches ? (
              <ExpandableList
                total={context.repo.unpushedBranches.length}
                empty="Everything is pushed."
                items={context.repo.unpushedBranches.map((entry) => (
                  <ListRowButton key={entry.branch} onClick={openProjectGraph}>
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate">{entry.branch}</span>
                      <span className="text-muted-foreground tabular-nums">{entry.count}</span>
                    </span>
                  </ListRowButton>
                ))}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      {context.threads.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 px-1 font-medium text-muted-foreground text-sm">
            Threads{" "}
            <span className="text-muted-foreground/60 tabular-nums">{context.threads.length}</span>
          </h2>
          <DigestThreads
            environmentId={threadEnvironmentId}
            threads={context.threads}
            onOpen={openThread}
          />
        </section>
      ) : null}
    </div>
  );
}

const STATUS_DOTS = {
  shipped: "bg-success",
  in_progress: "bg-info",
  blocked: "bg-warning",
  research: "bg-violet-400",
  idle: "bg-muted-foreground/50",
} as const;

function StatusDot(props: { readonly status: Snapshot["content"]["sections"][number]["status"] }) {
  return <span className={cn("size-1.5 rounded-full", STATUS_DOTS[props.status])} />;
}

function StatusLabel(props: {
  readonly status: Snapshot["content"]["sections"][number]["status"];
}) {
  return <span className="text-muted-foreground text-xs">{STATUS_LABELS[props.status]}</span>;
}

function BriefingCard(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className={cn(CARD, "flex flex-col overflow-hidden pb-3")}>
      <h2 className="m-0 px-6 pt-5 pb-2 font-medium text-muted-foreground text-sm">
        {props.title}
      </h2>
      <div className="flex flex-col gap-0.5 px-3">{props.children}</div>
    </section>
  );
}

function BriefingRow(props: {
  readonly marker: ReactNode;
  readonly title: string;
  readonly detail: string;
  readonly aside?: ReactNode;
  readonly issue?: string | undefined;
  readonly action?: string | undefined;
  readonly onClick?: (() => void) | undefined;
}) {
  const content = (
    <>
      <span className="flex h-5 w-3 shrink-0 items-center justify-center">{props.marker}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-sm">
            <Rich text={props.title} />
          </span>
          {props.aside}
        </span>
        <span className="line-clamp-2 text-muted-foreground text-sm">
          <Rich text={props.detail} />
        </span>
        {props.issue ? (
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
            <WarningCircleIcon aria-hidden weight="fill" className="size-3 shrink-0 text-warning" />
            <span className="truncate">
              <Rich text={props.issue} />
            </span>
          </span>
        ) : null}
      </span>
      {props.action ? (
        <span className="flex h-5 shrink-0 items-center gap-1 text-muted-foreground text-xs group-hover/briefing:text-foreground">
          {props.action}
          <ArrowRightIcon aria-hidden className="size-3" />
        </span>
      ) : null}
    </>
  );
  const row = "group/briefing flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left";
  return props.onClick ? (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(row, "cursor-pointer hover:bg-(--panel-surface-hover)")}
    >
      {content}
    </button>
  ) : (
    <div className={row}>{content}</div>
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

const EMPTY_PROVIDER_ENTRIES: ReadonlyMap<string, SidebarProviderEntry> = new Map();
const noop = () => {};

/** The window's threads as the sidebar draws them, live where this client has the thread. */
function DigestThreads(props: {
  readonly environmentId: EnvironmentId;
  readonly threads: Snapshot["context"]["threads"];
  readonly onOpen: (threadId: string) => void;
}) {
  const providerEntries =
    useAtomValue(providerEntriesByEnvironmentAtom).get(props.environmentId) ??
    EMPTY_PROVIDER_ENTRIES;
  const environmentLabel =
    useEnvironmentIdentities().find(
      (environment) => environment.environmentId === props.environmentId,
    )?.label ?? null;
  const environmentMachine = useEnvironmentMachines().get(props.environmentId) ?? "server";
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,14.5rem)] gap-x-2 p-0">
      {props.threads.map((thread) => (
        <DigestThreadRow
          key={thread.id}
          threadRef={scopeThreadRef(props.environmentId, ThreadId.make(thread.id))}
          fallback={thread}
          providerEntries={providerEntries}
          environmentLabel={environmentLabel}
          environmentMachine={environmentMachine}
          currentEnvironmentId={primaryEnvironmentId}
          timestampFormat={timestampFormat}
          onOpen={() => props.onOpen(thread.id)}
        />
      ))}
    </ul>
  );
}

function DigestThreadRow(props: {
  readonly threadRef: ScopedThreadRef;
  readonly fallback: Snapshot["context"]["threads"][number];
  readonly providerEntries: ReadonlyMap<string, SidebarProviderEntry>;
  readonly environmentLabel: string | null;
  readonly environmentMachine: EnvironmentMachineKind;
  readonly currentEnvironmentId: EnvironmentId | null;
  readonly timestampFormat: TimestampFormat;
  readonly onOpen: () => void;
}) {
  const shell = useThreadShell(props.threadRef);
  const project = useProject(shell ? scopeProjectRef(shell.environmentId, shell.projectId) : null);
  if (shell === null) {
    const provider = props.fallback.provider;
    return (
      <SidebarThreadCardPreview
        title={props.fallback.title}
        branch={props.fallback.branch ?? null}
        timestamp={new Date(props.fallback.activityMs).toISOString()}
        done={props.fallback.done === true}
        onOpen={props.onOpen}
        provider={
          provider ? (
            <ProviderInstanceIcon
              driverKind={ProviderDriverKind.make(provider === "claude" ? "claudeAgent" : "codex")}
              displayName={provider === "claude" ? "Claude" : "Codex"}
              size="compact"
              iconClassName="opacity-60"
            />
          ) : null
        }
      />
    );
  }
  return (
    <SidebarThreadRow
      thread={shell}
      variant="card"
      variantAction="settle"
      settlementSupported={false}
      snoozeSupported={false}
      pinningSupported={false}
      isPinned={false}
      groupLabel={null}
      groupProject={null}
      dropVerb={null}
      dragOverPinned={false}
      sweepAction={null}
      snoozeWakeLabelText={null}
      wokeAt={null}
      isActive={false}
      isRouteThread={false}
      openPullRequestsInRightPanel={false}
      jumpLabel={null}
      currentEnvironmentId={props.currentEnvironmentId}
      environmentLabel={props.environmentLabel}
      environmentMachine={props.environmentMachine}
      scratchMachineLabel={null}
      project={project}
      projectDisplayName={project?.title ?? null}
      providerEntryByInstanceId={props.providerEntries}
      timestampFormat={props.timestampFormat}
      onThreadClick={props.onOpen}
      onThreadActivate={props.onOpen}
      onStartRename={noop}
      onRenameTitleChange={noop}
      onCommitRename={noop}
      onCancelRename={noop}
      isRenaming={false}
      renamingTitle=""
      onContextMenu={noop}
      onSettle={noop}
      onActionSweepStart={noop}
      onUnsettle={noop}
      onSnooze={noop}
      onUnsnooze={noop}
      onUnpin={noop}
      onAcknowledgeWoke={noop}
    />
  );
}

function Bars(props: { readonly visual: Extract<Visual, { kind: "bars" }> }) {
  const max = Math.max(...props.visual.items.map((item) => Math.abs(item.value)), Number.MIN_VALUE);
  const unit = props.visual.unit ?? "";
  const spaced = /^\p{L}{2,}/u.test(unit) ? ` ${unit}` : unit;
  return (
    <div className="grid gap-2 px-5 pt-2.5 pb-4">
      {props.visual.items.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[minmax(90px,38%)_minmax(0,1fr)_auto] items-center gap-3 text-xs"
        >
          <span
            className={cn("truncate", item.highlight ? "text-foreground" : "text-muted-foreground")}
          >
            {item.label}
          </span>
          <span className="relative flex h-1 items-center rounded-full panel-well">
            <span
              className={cn(
                "relative block h-full rounded-full",
                item.highlight ? "bg-foreground" : "bg-muted-foreground/40",
              )}
              style={{ width: `${Math.max(2, (Math.abs(item.value) / max) * 100)}%` }}
            >
              {item.highlight ? (
                <span className="absolute top-1/2 right-0 size-1.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground text-foreground digest-halo" />
              ) : null}
            </span>
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
          className={cn(
            "w-0.5 justify-self-center rounded-full",
            count === 0 ? "bg-muted-foreground/25" : "bg-foreground/70",
          )}
          style={{ height: count === 0 ? 1 : `${Math.max(10, (count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
