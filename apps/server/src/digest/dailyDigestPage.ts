import * as Schema from "effect/Schema";

const Text = (max: number) => Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(max));

const DAILY_DIGEST_STATUSES = ["shipped", "in_progress", "blocked", "research", "idle"] as const;

export const DailyDigestPageContent = Schema.Struct({
  mood: Text(48).annotate({
    description: "A few words on the day overall, such as 'Strong day, two branches at risk'.",
  }),
  headline: Text(140).annotate({
    description: "One plain sentence, at most 20 words: what matters most today.",
  }),
  summary: Text(360).annotate({ description: "Two short sentences on what moved." }),
  visuals: Schema.Array(
    Schema.Union([
      Schema.Struct({
        kind: Schema.Literal("image"),
        title: Text(60),
        caption: Schema.optional(Text(160)),
        path: Text(1024).annotate({
          description: "Absolute path to a png, jpg, gif, or webp on this machine.",
        }),
        threadId: Schema.optional(Text(200)),
      }),
      Schema.Struct({
        kind: Schema.Literal("bars"),
        title: Text(60),
        caption: Schema.optional(Text(160)),
        unit: Schema.optional(Text(12)),
        items: Schema.Array(
          Schema.Struct({
            label: Text(40),
            value: Schema.Number,
            highlight: Schema.optional(Schema.Boolean),
          }),
        ).check(Schema.isMinLength(2), Schema.isMaxLength(8)),
        threadId: Schema.optional(Text(200)),
      }),
    ]),
  )
    .check(Schema.isMaxLength(4))
    .annotate({
      description:
        "The most telling visuals, first is the largest: images from the threads, or a bars comparison of numbers from them.",
    }),
  facts: Schema.Array(Schema.Struct({ label: Text(28), value: Text(16) }))
    .check(Schema.isMaxLength(4))
    .annotate({ description: "Up to four numbers that describe the window, besides commits." }),
  sections: Schema.Array(
    Schema.Struct({
      title: Text(60),
      status: Schema.Literals(DAILY_DIGEST_STATUSES),
      summary: Text(200).annotate({ description: "One short sentence on what changed." }),
      issue: Schema.optional(Text(110)).annotate({
        description: "A problem worth knowing here, such as unpushed work or a failing check.",
      }),
      threadId: Schema.optional(Text(200)),
    }),
  )
    .check(Schema.isMaxLength(8))
    .annotate({ description: "What happened: one per workstream, most important first." }),
  decisions: Schema.Array(
    Schema.Struct({
      question: Text(110),
      context: Text(200),
      threadId: Schema.optional(Text(200)),
      prompt: Schema.optional(Text(2000)).annotate({
        description: "Put in that thread's composer when the reader opens it.",
      }),
    }),
  )
    .check(Schema.isMaxLength(5))
    .annotate({ description: "Decisions only the reader can make. Empty when there are none." }),
  nextSteps: Schema.Array(
    Schema.Struct({
      title: Text(80),
      reason: Text(140),
      prompt: Text(4000).annotate({
        description: "A complete task for a new thread in this project.",
      }),
    }),
  )
    .check(Schema.isMaxLength(5))
    .annotate({ description: "Three to five, most valuable first." }),
});
export type DailyDigestPageContent = typeof DailyDigestPageContent.Type;

const DailyDigestPageContext = Schema.Struct({
  projectTitle: Schema.String,
  environmentId: Schema.String,
  sinceMs: Schema.Number,
  untilMs: Schema.Number,
  /** Commit counts in even slots across the window. */
  activity: Schema.Array(Schema.Number),
  /** Main threads that were active in the window, newest first. */
  threads: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      status: Schema.String,
      activityMs: Schema.Number,
    }),
  ),
  timeZone: Schema.optional(Schema.String),
  /** The project's icon as a data URI, as the app shows it. */
  icon: Schema.optional(Schema.String),
});
type DailyDigestPageContext = typeof DailyDigestPageContext.Type;

/** Everything a digest page renders from, kept beside it so it re-renders with today's template. */
export const DailyDigestPageSnapshot = Schema.Struct({
  content: DailyDigestPageContent,
  context: DailyDigestPageContext,
  /** Image visuals' data URIs by path, since the files may be gone by the next render. */
  images: Schema.Record(Schema.String, Schema.String),
});
export type DailyDigestPageSnapshot = typeof DailyDigestPageSnapshot.Type;

export function renderDailyDigestSnapshot(snapshot: DailyDigestPageSnapshot): string {
  const visuals = snapshot.content.visuals.flatMap((visual): Visual[] => {
    if (visual.kind !== "image") return [visual];
    const image = snapshot.images[visual.path];
    return image?.startsWith("data:image/") ? [{ ...visual, path: image }] : [];
  });
  return renderDailyDigestPage({ ...snapshot.content, visuals }, snapshot.context);
}

const STATUS_LABELS: Record<(typeof DAILY_DIGEST_STATUSES)[number], [string, string]> = {
  shipped: ["Shipped", "ok"],
  in_progress: ["In progress", "run"],
  blocked: ["Needs you", "ask"],
  research: ["Research", "off"],
  idle: ["Idle", "off"],
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Escapes text and turns `backticks` into code. */
const rich = (value: string) =>
  escapeHtml(value).replace(/`([^`]+)`/g, (_match, code: string) => `<code>${code}</code>`);

const APP_ORIGIN = "https://app.t3.codes";

function threadHref(environmentId: string, threadId: string, prompt?: string): string {
  const path = `${APP_ORIGIN}/${encodeURIComponent(environmentId)}/${encodeURIComponent(threadId)}`;
  return prompt === undefined ? path : `${path}?prompt=${encodeURIComponent(prompt)}`;
}

function newThreadHref(prompt: string): string {
  return `${APP_ORIGIN}/new?prompt=${encodeURIComponent(prompt)}`;
}

const line = (opacity: number) => `color-mix(in srgb,var(--foreground) ${opacity}%,transparent)`;

// Theme variables only, so the page follows light, dark, and custom themes.
const STYLES = `
html,body{background:transparent!important}
.dd{--hair:${line(6)};--surface:color-mix(in srgb,var(--foreground) 4.5%,var(--background));--control:color-mix(in srgb,var(--foreground) 9%,var(--background));--control-hover:color-mix(in srgb,var(--foreground) 13%,var(--background));--edge:inset 0 1px 0 ${line(5)},inset 0 0 0 1px ${line(2.5)};display:flex;flex-direction:column;gap:22px;max-width:1240px;margin:0 auto;padding:6px 4px 28px}
.ok{--tone:color-mix(in srgb,var(--success) 62%,var(--foreground))}
.run{--tone:color-mix(in srgb,var(--info) 58%,var(--foreground))}
.ask{--tone:color-mix(in srgb,var(--warning) 66%,var(--foreground))}
.off{--tone:var(--muted-foreground)}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:10px}
.ttl{display:flex;align-items:center;gap:14px;min-width:0}
.tile{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:10px;font-size:15px;font-weight:700;color:var(--background);background:var(--foreground)}
.tile.icon{overflow:hidden;background:none}
.tile img{width:100%;height:100%;object-fit:contain}
.ttl h1{margin:0;font-size:20px;font-weight:600;letter-spacing:-.015em;white-space:nowrap}
.raised{border:1px solid transparent;background:var(--control)}
.pill{display:inline-flex;align-items:center;height:34px;padding:0 15px;border-radius:11px;font-size:14px;font-weight:600}
.chip{display:inline-flex;align-items:center;gap:7px;height:24px;padding:0 9px 0 8px;border-radius:7px;font-size:12px;font-weight:500;white-space:nowrap;color:color-mix(in srgb,var(--foreground) 82%,transparent);background:${line(7)}}
.chip::before{content:"";width:6px;height:6px;border-radius:999px;background:var(--tone)}
.card{position:relative;border-radius:18px;background:var(--surface);box-shadow:var(--edge)}
.hero{display:grid;gap:22px}
@media (min-width:900px){.hero{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}}
.brief{display:flex;flex-direction:column;justify-content:space-between;gap:44px;min-height:310px;padding:30px 34px 34px;overflow:hidden;background:radial-gradient(90% 80% at 0% 0%,${line(9)},transparent 65%),var(--surface)}
.brief-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.mood{display:inline-flex;align-items:center;height:30px;padding:0 13px;border-radius:999px;font-size:13px;color:color-mix(in srgb,var(--foreground) 85%,transparent)}
.stamp{font-size:12px;color:var(--muted-foreground)}
.headline{margin:0;max-width:30ch;font-size:24px;line-height:1.38;font-weight:600;letter-spacing:-.015em;text-wrap:pretty}
.summary{margin:14px 0 0;max-width:58ch;font-size:14.5px;line-height:1.6;color:var(--muted-foreground)}
.plot-card{display:flex;flex-direction:column;padding:28px 34px 22px}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
.card-head h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em}
.legend{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--muted-foreground)}
.legend i{width:7px;height:7px;border-radius:999px;background:var(--foreground);box-shadow:0 0 8px ${line(60)}}
.plot{position:relative;flex:1;min-height:170px;padding-right:44px}
.plot svg{position:absolute;inset:0 44px 0 0;width:calc(100% - 44px);height:100%;overflow:visible}
.plot polyline{filter:drop-shadow(0 0 6px ${line(45)})}
.ylab{position:absolute;right:0;font-size:11px;color:var(--muted-foreground);transform:translateY(-50%);font-variant-numeric:tabular-nums}
.comb{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));align-items:end;height:34px;margin:14px 44px 0 0}
.comb i{justify-self:center;width:2px;min-height:2px;border-radius:1px;background:${line(32)}}
.axis{display:flex;justify-content:space-between;margin:12px 44px 0 0;font-size:11.5px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));padding:24px 8px}
.strip div{display:grid;gap:9px;justify-items:center;text-align:center;padding:2px 12px}
.strip div+div{border-left:1px solid var(--hair)}
.strip span{font-size:12.5px;color:var(--muted-foreground)}
.strip strong{font-size:19px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.sec{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:30px 4px -4px}
.sec h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:color-mix(in srgb,var(--foreground) 62%,transparent)}
.sec span{font-size:12.5px;color:var(--muted-foreground)}
.table{overflow:hidden}
.tr{display:grid;gap:6px 24px;align-items:center;padding:17px 26px;border-top:1px solid var(--hair)}
.tr:first-child{border-top:0}
@media (min-width:820px){.tr{grid-template-columns:minmax(0,1.7fr) 124px minmax(0,1fr) 92px}}
.th{padding-top:15px;padding-bottom:13px;font-size:12px;color:var(--muted-foreground);background:${line(2)}}
@media (max-width:819px){.th{display:none}}
.name{display:flex;gap:12px;min-width:0}
.name .dot{flex:none;width:7px;height:7px;margin-top:7px;border-radius:999px;background:var(--tone)}
.name b{display:block;font-size:14.5px;font-weight:600}
.name p{margin:3px 0 0;font-size:13px;line-height:1.5;color:var(--muted-foreground)}
.note{margin:0;font-size:13px;line-height:1.5;color:var(--muted-foreground)}
.note.risk{color:color-mix(in srgb,var(--warning) 48%,var(--foreground))}
.act{justify-self:end}
@media (max-width:819px){.act{justify-self:start}}
.btn{display:inline-flex;align-items:center;height:32px;padding:0 13px;border-radius:10px;font-size:13px;font-weight:500;text-decoration:none;white-space:nowrap;color:var(--foreground);background:var(--control)}
.btn:hover{background:var(--control-hover)}
.proceed{display:grid;gap:22px;align-items:start}
@media (min-width:900px){.proceed.two{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.list{padding:24px 26px 10px}
.list h3{margin:0 0 6px;font-size:15px;font-weight:600}
.row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:4px 14px;align-items:center;padding:16px 0;border-top:1px solid var(--hair)}
.list h3+.row{border-top:0}
.row .mk{grid-row:span 2;align-self:start;display:grid;place-items:center;width:24px;height:24px;margin-top:-1px;border-radius:999px;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;color:color-mix(in srgb,var(--foreground) 75%,transparent)}
.row .mk.q{width:7px;height:7px;margin:7px 9px 0;border:0;background:var(--tone)}
.row b{font-size:14.5px;font-weight:600}
.row p{grid-column:2;margin:0;font-size:13px;line-height:1.5;color:var(--muted-foreground)}
.row .btn{grid-column:3;grid-row:1 / span 2}
.vis{display:flex;flex-direction:column;overflow:hidden;margin:0}
.shot{position:relative;flex:1;min-height:240px;overflow:hidden;border-radius:17px 17px 0 0;background:var(--background);border-bottom:1px solid var(--hair)}
.shot img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:top center}
.gallery .shot{flex:none;aspect-ratio:16/10;min-height:0}
.cap{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 22px 18px}
.cap b{display:block;font-size:14.5px;font-weight:600}
.cap span{display:block;margin-top:3px;font-size:13px;line-height:1.5;color:var(--muted-foreground)}
.cap.over{padding:26px 30px 6px}
.bar-list{flex:1;display:grid;align-content:center;gap:15px;padding:18px 30px 28px}
.bar{display:grid;grid-template-columns:minmax(90px,32%) minmax(0,1fr) auto;align-items:center;gap:14px;font-size:13px}
.bar span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--muted-foreground)}
.track{height:8px;border-radius:999px;background:${line(7)};overflow:hidden}
.fill{height:100%;border-radius:999px;background:${line(32)}}
.bar.hi span{color:var(--foreground)}
.bar.hi .fill{background:var(--foreground)}
.bar b{min-width:58px;text-align:right;white-space:nowrap;font-weight:600;font-variant-numeric:tabular-nums}
.bar b i{font-style:normal;font-weight:400;color:var(--muted-foreground)}
.gallery{display:grid;gap:22px;align-items:start;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.threads{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(270px,1fr))}
.thread{display:flex;align-items:center;gap:12px;min-width:0;padding:14px 16px;border-radius:14px;text-decoration:none;color:inherit}
.thread:hover{background:var(--control)}
.thread .dot{flex:none;width:7px;height:7px;border-radius:999px;background:var(--tone)}
.thread div{min-width:0}
.thread b{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:14px;font-weight:600}
.thread span{display:block;margin-top:2px;font-size:12px;color:var(--muted-foreground)}
.spark{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));align-items:end;width:120px;height:20px}
.spark i{justify-self:center;width:2px;min-height:1px;border-radius:1px;background:${line(40)}}
code{font-family:var(--font-mono);font-size:.86em;padding:1px 5px;border-radius:5px;background:${line(8)}}
@media (max-width:600px){.brief,.plot-card{padding:22px}.headline{font-size:20px}.tr{padding:14px 18px}.list{padding:20px 18px 6px}.row{grid-template-columns:auto minmax(0,1fr)}.row .btn{grid-column:2;grid-row:auto;justify-self:start;margin-top:8px}}
`;

function formatTime(ms: number, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { ...options, ...(timeZone ? { timeZone } : {}) }).format(
    ms,
  );
}

const PLOT_WIDTH = 600;
const PLOT_HEIGHT = 200;

function plot(activity: ReadonlyArray<number>): string {
  const total = activity.reduce((sum, count) => sum + count, 0);
  const top = Math.max(1, total);
  const y = (value: number) => PLOT_HEIGHT - 8 - (value / top) * (PLOT_HEIGHT - 24);
  let running = 0;
  const points = activity.map((count, index) => {
    running += count;
    const x = activity.length <= 1 ? PLOT_WIDTH : (index / (activity.length - 1)) * PLOT_WIDTH;
    return [x, y(running)] as const;
  });
  const path = points.map(([x, py]) => `${x.toFixed(1)},${py.toFixed(1)}`).join(" ");
  // Zero-length round caps stay round under the stretched view box.
  const dots = points
    .filter((_point, index) => index % 4 === 3 || index === points.length - 1)
    .map(
      ([x, py]) =>
        `<path d="M${x.toFixed(1)} ${py.toFixed(1)}h0" stroke="var(--foreground)" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`,
    )
    .join("");
  const ticks = [0, 0.5, 1].map((share) => Math.round(top * share));
  const grid = ticks
    .map(
      (tick) =>
        `<line x1="0" x2="${PLOT_WIDTH}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}" stroke="${line(14)}" stroke-dasharray="2 5" vector-effect="non-scaling-stroke"/>`,
    )
    .join("");
  const labels = ticks
    .map(
      (tick) =>
        `<span class="ylab" style="top:${((y(tick) / PLOT_HEIGHT) * 100).toFixed(1)}%">${tick}</span>`,
    )
    .join("");
  const [lastX, lastY] = points.at(-1) ?? [PLOT_WIDTH, y(0)];
  const max = Math.max(1, ...activity);
  const bars = activity
    .map((count) => `<i style="height:${count === 0 ? 0 : Math.max(8, (count / max) * 100)}%"></i>`)
    .join("");
  return `<div class="plot"><svg viewBox="0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}" preserveAspectRatio="none" role="img" aria-label="Commits over the window"><defs><linearGradient id="dd-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--foreground)" stop-opacity=".16"/><stop offset="1" stop-color="var(--foreground)" stop-opacity="0"/></linearGradient></defs>${grid}<polygon fill="url(#dd-area)" points="0,${PLOT_HEIGHT} ${path} ${PLOT_WIDTH},${PLOT_HEIGHT}"/><polyline fill="none" stroke="var(--foreground)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${path}"/>${dots}<path d="M${lastX.toFixed(1)} ${lastY.toFixed(1)}h0" stroke="${line(18)}" stroke-width="14" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>${labels}</div><div class="comb" style="--n:${activity.length}">${bars}</div>`;
}

type Visual = DailyDigestPageContent["visuals"][number];

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function visualCard(visual: Visual, environmentId: string, className: string): string {
  const open = visual.threadId
    ? `<a class="btn" href="${escapeHtml(threadHref(environmentId, visual.threadId))}">Open</a>`
    : "";
  const caption = `<div><b>${rich(visual.title)}</b>${visual.caption ? `<span>${rich(visual.caption)}</span>` : ""}</div>${open}`;
  if (visual.kind === "image") {
    return `<figure class="card vis ${className}"><div class="shot"><img src="${escapeHtml(visual.path)}" alt="${escapeHtml(visual.title)}"></div><figcaption class="cap">${caption}</figcaption></figure>`;
  }
  const max = Math.max(...visual.items.map((item) => Math.abs(item.value)), Number.MIN_VALUE);
  // Words such as "commits" or "ms" read as a separate unit; "%" and "x" hug the number.
  const unit = visual.unit
    ? `<i>${/^[\p{L}]{2,}/u.test(visual.unit) ? " " : ""}${escapeHtml(visual.unit)}</i>`
    : "";
  const rows = visual.items
    .map(
      (item) =>
        `<div class="bar${item.highlight ? " hi" : ""}"><span>${rich(item.label)}</span><div class="track"><div class="fill" style="width:${Math.max(2, (Math.abs(item.value) / max) * 100).toFixed(1)}%"></div></div><b>${escapeHtml(formatNumber(item.value))}${unit}</b></div>`,
    )
    .join("");
  return `<figure class="card vis ${className}"><figcaption class="cap over">${caption}</figcaption><div class="bar-list">${rows}</div></figure>`;
}

const THREAD_STATUS: Record<string, [string, string]> = {
  running: ["Running", "run"],
  preparing: ["Running", "run"],
  starting: ["Running", "run"],
  queued: ["Queued", "run"],
  waiting: ["Waiting on you", "ask"],
  failed: ["Stopped with an error", "ask"],
  interrupted: ["Stopped", "off"],
};

export function renderDailyDigestPage(
  content: DailyDigestPageContent,
  context: DailyDigestPageContext,
): string {
  const { environmentId, timeZone } = context;
  const commits = context.activity.reduce((sum, count) => sum + count, 0);
  const span = context.untilMs - context.sinceMs;
  const axis = [0, 1, 2, 3, 4]
    .map(
      (step) =>
        `<span>${formatTime(context.sinceMs + (span * step) / 4, timeZone, { hour: "2-digit", minute: "2-digit" })}</span>`,
    )
    .join("");
  const since = formatTime(context.sinceMs, timeZone, {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const summarized = formatTime(context.untilMs, timeZone, { hour: "2-digit", minute: "2-digit" });
  const today = formatTime(context.untilMs, timeZone, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const commitLabel = commits === 1 ? "1 commit" : `${commits} commits`;
  const sparkMax = Math.max(1, ...context.activity);
  const spark = `<div class="spark" style="--n:${context.activity.length}">${context.activity
    .map(
      (count) =>
        `<i style="height:${count === 0 ? 0 : Math.max(10, (count / sparkMax) * 100)}%"></i>`,
    )
    .join("")}</div>`;
  const strip = [
    `<div><span>Commits</span><strong>${commits}</strong>${spark}</div>`,
    ...content.facts.map(
      (fact) => `<div><span>${rich(fact.label)}</span><strong>${rich(fact.value)}</strong></div>`,
    ),
  ].join("");
  const [lead, ...moreVisuals] = content.visuals;
  const heroSide =
    lead === undefined
      ? `<section class="card plot-card"><div class="card-head"><h2>Commits</h2><span class="legend"><i></i>Since ${since}</span></div>${plot(context.activity)}<div class="axis">${axis}</div></section>`
      : visualCard(lead, environmentId, "lead");
  const highlights =
    moreVisuals.length === 0
      ? ""
      : `<div class="sec"><h2>Highlights</h2></div><div class="gallery">${moreVisuals
          .map((visual) => visualCard(visual, environmentId, ""))
          .join("")}</div>`;
  const threadCards = context.threads
    .map((thread) => {
      const [label, tone] = THREAD_STATUS[thread.status] ?? [
        `Last active ${formatTime(thread.activityMs, timeZone, { weekday: "short", hour: "2-digit", minute: "2-digit" })}`,
        "off",
      ];
      return `<a class="card thread" href="${escapeHtml(threadHref(environmentId, thread.id))}"><span class="dot ${tone}"></span><div><b>${escapeHtml(thread.title)}</b><span>${label}</span></div></a>`;
    })
    .join("");
  const threadList =
    threadCards === ""
      ? ""
      : `<div class="sec"><h2>Threads</h2><span>${context.threads.length === 1 ? "1 active" : `${context.threads.length} active`}</span></div><div class="threads">${threadCards}</div>`;
  const rows = content.sections
    .map((section) => {
      const [label, tone] = STATUS_LABELS[section.status];
      const note = section.issue
        ? `<p class="note risk">${rich(section.issue)}</p>`
        : `<span></span>`;
      const open = section.threadId
        ? `<a class="btn act" href="${escapeHtml(threadHref(environmentId, section.threadId))}">Open</a>`
        : `<span></span>`;
      return `<div class="tr"><div class="name"><span class="dot ${tone}"></span><div><b>${rich(section.title)}</b><p>${rich(section.summary)}</p></div></div><span><span class="chip ${tone}">${label}</span></span>${note}${open}</div>`;
    })
    .join("");
  const happened =
    rows === ""
      ? ""
      : `<div class="sec"><h2>What happened</h2><span>${content.sections.length === 1 ? "1 workstream" : `${content.sections.length} workstreams`}</span></div>
<section class="card table"><div class="tr th"><span>Workstream</span><span>Status</span><span>Note</span><span></span></div>${rows}</section>`;
  const decisions =
    content.decisions.length === 0
      ? ""
      : `<section class="card list"><h3>Your call</h3>${content.decisions
          .map((decision) => {
            const answer = decision.threadId
              ? `<a class="btn" href="${escapeHtml(threadHref(environmentId, decision.threadId, decision.prompt))}">Answer</a>`
              : decision.prompt
                ? `<a class="btn" href="${escapeHtml(newThreadHref(decision.prompt))}">Start thread</a>`
                : "";
            return `<div class="row"><span class="mk q ask"></span><b>${rich(decision.question)}</b><p>${rich(decision.context)}</p>${answer}</div>`;
          })
          .join("")}</section>`;
  const steps =
    content.nextSteps.length === 0
      ? ""
      : `<section class="card list"><h3>Next steps</h3>${content.nextSteps
          .map(
            (step, index) =>
              `<div class="row"><span class="mk raised">${index + 1}</span><b>${rich(step.title)}</b><p>${rich(step.reason)}</p><a class="btn" href="${escapeHtml(newThreadHref(step.prompt))}">Start thread</a></div>`,
          )
          .join("")}</section>`;
  const proceed =
    decisions === "" && steps === ""
      ? ""
      : `<div class="sec"><h2>How to proceed</h2></div><div class="proceed${decisions !== "" && steps !== "" ? " two" : ""}">${decisions}${steps}</div>`;
  const tile = context.icon?.startsWith("data:image/")
    ? `<span class="tile icon"><img src="${escapeHtml(context.icon)}" alt=""></span>`
    : `<span class="tile">${escapeHtml(context.projectTitle.trim().charAt(0).toUpperCase() || "?")}</span>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLES}</style></head><body><div class="dd">
<header class="top"><div class="ttl">${tile}<h1>${escapeHtml(context.projectTitle)} digest</h1><span class="chip ok">${commitLabel}</span></div><span class="pill raised">${today}</span></header>
<div class="hero">
<section class="card brief"><div class="brief-top"><span class="mood raised">${rich(content.mood)}</span><span class="stamp">Summarized at ${summarized}</span></div><div><p class="headline">${rich(content.headline)}</p><p class="summary">${rich(content.summary)}</p></div></section>
${heroSide}
</div>
<section class="card strip">${strip}</section>
${highlights}
${threadList}
${happened}
${proceed}
</div></body></html>`;
}
