import * as Schema from "effect/Schema";

const Text = (max: number) => Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(max));

const DAILY_DIGEST_STATUSES = ["shipped", "in_progress", "blocked", "research", "idle"] as const;

export const DailyDigestPageContent = Schema.Struct({
  headline: Text(140).annotate({
    description: "One plain sentence, at most 20 words: what matters most today.",
  }),
  summary: Text(480).annotate({ description: "Two or three short sentences on what moved." }),
  facts: Schema.Array(Schema.Struct({ label: Text(32), value: Text(16) }))
    .check(Schema.isMaxLength(4))
    .annotate({ description: "Up to four numbers that describe the window, besides commits." }),
  sections: Schema.Array(
    Schema.Struct({
      title: Text(60),
      status: Schema.Literals(DAILY_DIGEST_STATUSES),
      summary: Text(280).annotate({ description: "One or two short sentences." }),
      points: Schema.optional(Schema.Array(Text(110)).check(Schema.isMaxLength(3))).annotate({
        description: "Up to three short facts, only when they add something.",
      }),
      issue: Schema.optional(Text(160)).annotate({
        description: "A problem worth knowing here, such as unpushed work or a failing check.",
      }),
      threadId: Schema.optional(Text(200)),
    }),
  )
    .check(Schema.isMaxLength(8))
    .annotate({ description: "What happened: one per workstream, most important first." }),
  decisions: Schema.Array(
    Schema.Struct({
      question: Text(120),
      context: Text(240),
      threadId: Schema.optional(Text(200)),
      prompt: Schema.optional(Text(2000)).annotate({
        description: "Put in that thread's composer when the reader opens it.",
      }),
    }),
  )
    .check(Schema.isMaxLength(6))
    .annotate({ description: "Decisions only the reader can make. Empty when there are none." }),
  nextSteps: Schema.Array(
    Schema.Struct({
      title: Text(80),
      reason: Text(160),
      prompt: Text(4000).annotate({
        description: "A complete task for a new thread in this project.",
      }),
    }),
  )
    .check(Schema.isMaxLength(6))
    .annotate({ description: "Three to five, most valuable first." }),
});
export type DailyDigestPageContent = typeof DailyDigestPageContent.Type;

export interface DailyDigestPageContext {
  readonly projectTitle: string;
  readonly environmentId: string;
  readonly sinceMs: number;
  readonly untilMs: number;
  /** Commit counts in even slots across the window. */
  readonly activity: ReadonlyArray<number>;
  readonly timeZone?: string;
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

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const line = (opacity: number) => `color-mix(in srgb,var(--foreground) ${opacity}%,transparent)`;

// Theme variables only, so the page follows light, dark, and custom themes.
const STYLES = `
.dd{display:flex;flex-direction:column;gap:28px;max-width:1180px;margin:0 auto}
.head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:4px 2px}
.id{display:inline-flex;align-items:center;gap:10px;padding:5px 14px 5px 5px;border-radius:999px;border:1px solid ${line(9)};background:${line(3)}}
.mark{display:grid;place-items:center;width:26px;height:26px;border-radius:999px;font-size:12px;font-weight:700;background:var(--foreground);color:var(--background);box-shadow:0 0 18px color-mix(in srgb,var(--foreground) 22%,transparent)}
.id b{font-size:14px;font-weight:600}
.id span{font-size:14px;color:var(--muted-foreground)}
.head time{font-size:13px;color:var(--muted-foreground)}
.head time b{color:var(--foreground);font-weight:600}
.panel{padding:36px;border-radius:24px;border:1px solid ${line(8)};background:${GRAIN},color-mix(in srgb,var(--foreground) 2.5%,var(--background));box-shadow:inset 0 1px 0 ${line(6)}}
.panel>h2{margin:0 0 28px;font-size:20px;font-weight:500;letter-spacing:-.015em;color:var(--muted-foreground)}
.headline{margin:0;max-width:40ch;font-size:28px;line-height:1.2;font-weight:600;letter-spacing:-.025em;text-wrap:balance}
.summary{margin:16px 0 0;max-width:68ch;font-size:16px;line-height:1.6;color:color-mix(in srgb,var(--foreground) 78%,transparent)}
.inset{margin-top:32px;border-radius:18px;border:1px solid ${line(8)};background:var(--background)}
.inset-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 24px;border-bottom:1px solid ${line(8)};font-size:15px;color:var(--muted-foreground)}
.inset-body{display:grid;gap:28px;padding:28px 24px 24px}
@media (min-width:860px){.inset-body{grid-template-columns:minmax(200px,1fr) minmax(0,2.4fr);gap:40px}}
.total{display:flex;align-items:baseline;gap:10px}
.total strong{font-size:34px;line-height:1;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.total span{font-size:15px;color:var(--muted-foreground)}
.facts{display:grid;gap:12px;margin:24px 0 0;padding:0}
.facts div{display:flex;justify-content:space-between;gap:16px;padding-top:12px;border-top:1px solid ${line(7)};font-size:14px}
.facts dt{color:var(--muted-foreground)}
.facts dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums}
.chart svg{display:block;width:100%;height:140px;background-image:radial-gradient(${line(12)} 1px,transparent 1.2px);background-size:10px 10px}
.comb{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));align-items:end;height:36px;margin-top:8px}
.comb i{justify-self:center;width:2px;min-height:2px;border-radius:1px;background:${line(30)}}
.axis{display:flex;justify-content:space-between;margin-top:10px;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.badge{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:7px;font-size:12px;font-weight:600;white-space:nowrap;background:color-mix(in srgb,currentColor 14%,transparent)}
.ok{color:var(--success)}.run{color:var(--info)}.ask{color:var(--warning)}.off{color:var(--muted-foreground)}
.streams{display:grid;gap:20px}
@media (min-width:860px){.streams{grid-template-columns:repeat(2,minmax(0,1fr))}}
.stream{display:flex;flex-direction:column;padding:24px;border-radius:18px;border:1px solid ${line(8)};background:var(--background)}
.stream-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}
.stream h3{margin:0;font-size:17px;line-height:1.35;font-weight:600;letter-spacing:-.01em}
.stream p{margin:0;font-size:14px;line-height:1.6;color:var(--muted-foreground)}
.stream ul{margin:12px 0 0;padding:0 0 0 18px;font-size:14px;line-height:1.6;color:var(--muted-foreground)}
.stream li+li{margin-top:4px}
.issue{margin-top:14px!important;padding:10px 12px;border-radius:10px;color:color-mix(in srgb,var(--destructive) 70%,var(--foreground))!important;background:color-mix(in srgb,var(--destructive) 9%,transparent)}
.stream footer{margin-top:auto;padding-top:20px}
.btn{display:inline-flex;align-items:center;height:32px;padding:0 13px;border-radius:10px;font-size:13px;font-weight:500;text-decoration:none;white-space:nowrap;color:var(--foreground);border:1px solid ${line(12)};background:${line(4)};box-shadow:inset 0 1px 0 ${line(7)}}
.btn:hover{background:${line(9)}}
.sub{margin:0 0 4px;font-size:15px;font-weight:600}
.calls{margin-bottom:36px}
.rows{list-style:none;margin:0;padding:0}
.rows li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 18px;align-items:center;padding:20px 0;border-top:1px solid ${line(8)}}
.rows li:first-child{border-top:0}
@media (min-width:700px){.rows li{grid-template-columns:auto minmax(0,1fr) auto}}
.rows .n{grid-row:span 2;align-self:start;display:grid;place-items:center;width:30px;height:30px;border-radius:999px;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--muted-foreground);border:1px solid ${line(12)}}
.rows .q{grid-row:span 2;align-self:start;width:10px;height:10px;margin:7px 10px 0;border-radius:999px;background:var(--warning);box-shadow:0 0 12px color-mix(in srgb,var(--warning) 60%,transparent)}
.rows b{font-size:16px;font-weight:600;letter-spacing:-.01em}
.rows p{grid-column:2;margin:0;font-size:14px;line-height:1.55;color:var(--muted-foreground)}
.rows .btn{grid-column:2;justify-self:start;margin-top:10px}
@media (min-width:700px){.rows .btn{grid-column:3;grid-row:1 / span 2;margin-top:0}}
code{font-family:var(--font-mono);font-size:.86em;padding:1px 5px;border-radius:5px;background:${line(8)}}
@media (max-width:600px){.panel{padding:22px}.headline{font-size:23px}}
`;

function formatTime(ms: number, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { ...options, ...(timeZone ? { timeZone } : {}) }).format(
    ms,
  );
}

function chart(activity: ReadonlyArray<number>): string {
  const total = activity.reduce((sum, count) => sum + count, 0);
  const max = Math.max(1, ...activity);
  const points: string[] = [];
  let running = 0;
  activity.forEach((count, index) => {
    running += count;
    const x = activity.length <= 1 ? 476 : (index / (activity.length - 1)) * 476;
    const y = total === 0 ? 130 : 130 - (running / total) * 120;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  const last = points.at(-1)?.split(",") ?? ["476", "130"];
  const bars = activity
    .map((count) => `<i style="height:${count === 0 ? 0 : Math.max(8, (count / max) * 100)}%"></i>`)
    .join("");
  return `<svg viewBox="0 0 480 140" preserveAspectRatio="none" role="img" aria-label="Commits over the window"><polyline fill="none" stroke="var(--foreground)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${points.join(" ")}"/><circle cx="${last[0]}" cy="${last[1]}" r="7" fill="${line(14)}"/><circle cx="${last[0]}" cy="${last[1]}" r="3" fill="var(--foreground)"/></svg><div class="comb" style="--n:${activity.length}">${bars}</div>`;
}

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
  const today = formatTime(context.untilMs, timeZone, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const facts = content.facts
    .map((fact) => `<div><dt>${rich(fact.label)}</dt><dd>${rich(fact.value)}</dd></div>`)
    .join("");
  const sections = content.sections
    .map((section) => {
      const [label, tone] = STATUS_LABELS[section.status];
      const points =
        section.points && section.points.length > 0
          ? `<ul>${section.points.map((point) => `<li>${rich(point)}</li>`).join("")}</ul>`
          : "";
      const issue = section.issue ? `<p class="issue">${rich(section.issue)}</p>` : "";
      const open = section.threadId
        ? `<footer><a class="btn" href="${escapeHtml(threadHref(environmentId, section.threadId))}">Open thread</a></footer>`
        : "";
      return `<article class="stream"><div class="stream-head"><h3>${rich(section.title)}</h3><span class="badge ${tone}">${label}</span></div><p>${rich(section.summary)}</p>${points}${issue}${open}</article>`;
    })
    .join("");
  const decisions =
    content.decisions.length === 0
      ? ""
      : `<div class="calls"><h3 class="sub">Your call</h3><ol class="rows">${content.decisions
          .map((decision) => {
            const answer = decision.threadId
              ? `<a class="btn" href="${escapeHtml(threadHref(environmentId, decision.threadId, decision.prompt))}">Answer in thread</a>`
              : decision.prompt
                ? `<a class="btn" href="${escapeHtml(newThreadHref(decision.prompt))}">Start thread</a>`
                : "";
            return `<li><span class="q"></span><b>${rich(decision.question)}</b><p>${rich(decision.context)}</p>${answer}</li>`;
          })
          .join("")}</ol></div>`;
  const steps =
    content.nextSteps.length === 0
      ? ""
      : `<h3 class="sub">Next steps</h3><ol class="rows">${content.nextSteps
          .map(
            (step, index) =>
              `<li><span class="n">${index + 1}</span><b>${rich(step.title)}</b><p>${rich(step.reason)}</p><a class="btn" href="${escapeHtml(newThreadHref(step.prompt))}">Start thread</a></li>`,
          )
          .join("")}</ol>`;
  const proceed =
    decisions === "" && steps === ""
      ? ""
      : `<section class="panel"><h2>How to proceed</h2>${decisions}${steps}</section>`;
  const happened =
    sections === ""
      ? ""
      : `<section class="panel"><h2>What happened</h2><div class="streams">${sections}</div></section>`;
  const initial = escapeHtml(context.projectTitle.trim().charAt(0).toUpperCase() || "?");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLES}</style></head><body><div class="dd">
<header class="head"><div class="id"><span class="mark">${initial}</span><b>${escapeHtml(context.projectTitle)}</b><span>Daily digest</span></div><time><b>${today}</b></time></header>
<section class="panel"><p class="headline">${rich(content.headline)}</p><p class="summary">${rich(content.summary)}</p>
<div class="inset"><div class="inset-head"><span>Activity since ${since}</span><span class="badge off">${commits === 1 ? "1 commit" : `${commits} commits`}</span></div>
<div class="inset-body"><div><div class="total"><strong>${commits}</strong><span>${commits === 1 ? "commit" : "commits"} on local branches</span></div>${facts === "" ? "" : `<dl class="facts">${facts}</dl>`}</div>
<div class="chart">${chart(context.activity)}<div class="axis">${axis}</div></div></div></div></section>
${happened}
${proceed}
</div></body></html>`;
}
