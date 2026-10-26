import {
  type DAILY_DIGEST_STATUSES,
  type DailyDigestPageContent,
  type DailyDigestPageContext,
  type DailyDigestPageSnapshot,
  type ProjectIconColor,
} from "@t3tools/contracts";
import { deriveProjectIdentity } from "@t3tools/shared/projectIdentity";

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
.dd{--hair:${line(6)};--surface:color-mix(in srgb,var(--foreground) 4%,var(--background));--control:color-mix(in srgb,var(--foreground) 9%,var(--background));--control-hover:color-mix(in srgb,var(--foreground) 13%,var(--background));--lit-strong:${line(26)};--lit-mid:${line(9)};--rim:${line(4.5)};--groove:light-dark(${line(10)},rgb(0 0 0/.55));--groove-light:light-dark(transparent,rgb(255 255 255/.06));--grain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n' color-interpolation-filters='sRGB'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch' result='t'/%3E%3CfeColorMatrix in='t' result='w' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0.04 0.04 0.04 0 -0.06'/%3E%3CfeColorMatrix in='t' result='k' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -0.04 -0.04 -0.04 0 0.06'/%3E%3CfeMerge%3E%3CfeMergeNode in='w'/%3E%3CfeMergeNode in='k'/%3E%3C/feMerge%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E") 0 0/128px 128px;display:flex;flex-direction:column;gap:22px;max-width:1240px;margin:0 auto;padding:6px 4px 28px}
.ok{--tone:color-mix(in srgb,var(--success) 62%,var(--foreground))}
.run{--tone:color-mix(in srgb,var(--info) 58%,var(--foreground))}
.ask{--tone:color-mix(in srgb,var(--warning) 66%,var(--foreground))}
.bad{--tone:color-mix(in srgb,var(--destructive) 70%,var(--foreground))}
.off{--tone:var(--muted-foreground)}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:10px}
.ttl{display:flex;align-items:center;gap:14px;min-width:0}
.tile{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:10px;font-size:15px;font-weight:700;color:var(--background);background:var(--foreground)}
.tile.mono{color:var(--mono);background:color-mix(in srgb,var(--mono) 14%,transparent);font-family:var(--font-mono);font-size:14px}
.tile.emoji{background:var(--control);font-size:20px}
.tile.icon{overflow:hidden;background:none}
.tile img{width:100%;height:100%;object-fit:contain}
.ttl h1{margin:0;font-size:20px;font-weight:600;letter-spacing:-.015em;white-space:nowrap}
.raised{border:1px solid transparent;background:var(--control)}
.pill{display:inline-flex;align-items:center;height:34px;padding:0 15px;border-radius:11px;font-size:14px;font-weight:600}
.chip{display:inline-flex;align-items:center;gap:7px;height:24px;padding:0 9px 0 8px;border-radius:7px;font-size:12px;font-weight:500;white-space:nowrap;color:color-mix(in srgb,var(--foreground) 82%,transparent);background:${line(7)}}
.chip::before{content:"";width:6px;height:6px;border-radius:999px;background:var(--tone)}
.card{position:relative;border-radius:16px;background:var(--grain),var(--surface)}
.card::after{content:"";position:absolute;inset:0;z-index:1;border-radius:inherit;padding:1px;pointer-events:none;background:radial-gradient(var(--lit,22rem 10rem at 3rem 3rem),var(--lit-strong),var(--lit-mid) 40%,var(--rim));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.hero{display:grid;gap:22px}
@media (min-width:900px){.hero{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}}
.brief{display:flex;flex-direction:column;justify-content:space-between;gap:44px;min-height:310px;padding:30px 34px 34px;overflow:hidden;background:radial-gradient(90% 80% at 0% 0%,${line(7)},transparent 65%),var(--grain),var(--surface)}
.brief-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.mood{display:inline-flex;align-items:center;height:30px;padding:0 13px;border-radius:999px;font-size:13px;color:color-mix(in srgb,var(--foreground) 85%,transparent);background:color-mix(in srgb,var(--background) 60%,transparent);box-shadow:inset 0 0 0 1px ${line(7)},inset 0 1px 2px rgb(0 0 0/.25)}
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
.stats{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.stat{padding:20px 22px 16px}
.stat header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}
.stat h3{margin:0;font-size:13px;font-weight:500;color:var(--muted-foreground)}
.stat strong{font-size:30px;line-height:1;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.stat ul{margin:0;padding:0;list-style:none}
.stat li{display:flex;align-items:center;gap:10px;min-width:0;padding:8px 0;font-size:13px;border-top:1px solid var(--groove);box-shadow:inset 0 1px 0 var(--groove-light)}
.stat li span{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.stat li code{flex:none;color:var(--muted-foreground)}
.stat li i{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-style:normal}
.stat li.two{display:grid;gap:3px}
.stat li small{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px;color:var(--muted-foreground)}
.stat li small time{margin-left:auto}
.stat li time,.stat li b{flex:none;font-size:12px;font-weight:500;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.stat li b{color:var(--foreground)}
.stat .st{min-width:22px;text-align:center}
.stat .none,.stat .more{margin:4px 0 2px;font-size:12.5px;color:var(--muted-foreground)}
.stat .spark{width:100%;height:28px}
.sec{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:30px 4px -4px}
.sec h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:color-mix(in srgb,var(--foreground) 62%,transparent)}
.sec span{font-size:12.5px;color:var(--muted-foreground)}
.table{overflow:hidden}
.tr{display:grid;gap:6px 24px;align-items:center;padding:17px 26px;border-top:1px solid var(--groove);box-shadow:inset 0 1px 0 var(--groove-light)}
.tr:first-child{border-top:0;box-shadow:none}
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
.row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:4px 14px;align-items:center;padding:16px 0;border-top:1px solid var(--groove);box-shadow:inset 0 1px 0 var(--groove-light)}
.list h3+.row{border-top:0;box-shadow:none}
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
.threads{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.thread{--lit:12rem 6rem at 1.5rem 1.5rem;display:grid;gap:6px;min-width:0;padding:11px 12px 10px;border-radius:12px;text-decoration:none;color:inherit}
.thread:hover{background:var(--grain),var(--control)}
.thread .line{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
.thread b{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:14px;font-weight:500;color:var(--muted-foreground)}
.thread.live b{color:var(--foreground)}
.thread time{flex:none;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.thread em{flex:none;display:inline-flex;align-items:center;gap:4px;font-size:12px;font-style:normal;font-weight:500;color:var(--tone)}
.thread em svg{width:14px;height:14px}
.thread .sub{min-height:14px;font-size:12px;color:color-mix(in srgb,var(--muted-foreground) 70%,transparent)}
.thread .sub span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.thread .mark{flex:none;width:14px;height:14px}
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
  running: ["Working", "run"],
  preparing: ["Working", "run"],
  starting: ["Working", "run"],
  queued: ["Queued", "run"],
  waiting: ["Needs input", "ask"],
  failed: ["Failed", "bad"],
};

// Tailwind 600 and 400, as the app's monograms use in light and dark.
const MONOGRAM_COLORS: Record<ProjectIconColor, string> = {
  gray: "light-dark(#4b5563,#9ca3af)",
  red: "light-dark(#dc2626,#f87171)",
  orange: "light-dark(#ea580c,#fb923c)",
  amber: "light-dark(#d97706,#fbbf24)",
  yellow: "light-dark(#ca8a04,#facc15)",
  lime: "light-dark(#65a30d,#a3e635)",
  green: "light-dark(#16a34a,#4ade80)",
  emerald: "light-dark(#059669,#34d399)",
  teal: "light-dark(#0d9488,#2dd4bf)",
  cyan: "light-dark(#0891b2,#22d3ee)",
  sky: "light-dark(#0284c7,#38bdf8)",
  blue: "light-dark(#2563eb,#60a5fa)",
  indigo: "light-dark(#4f46e5,#818cf8)",
  violet: "light-dark(#7c3aed,#a78bfa)",
  purple: "light-dark(#9333ea,#c084fc)",
  fuchsia: "light-dark(#c026d3,#e879f9)",
  pink: "light-dark(#db2777,#f472b6)",
  rose: "light-dark(#e11d48,#fb7185)",
};

function projectTile(context: DailyDigestPageContext): string {
  if (context.icon?.startsWith("data:image/")) {
    return `<span class="tile icon"><img src="${escapeHtml(context.icon)}" alt=""></span>`;
  }
  if (context.emoji) return `<span class="tile emoji">${escapeHtml(context.emoji)}</span>`;
  const derived = deriveProjectIdentity(context.projectTitle);
  const { text, color } = context.monogram ?? { text: derived.monogram, color: derived.color };
  return `<span class="tile mono" style="--mono:${MONOGRAM_COLORS[color]}">${escapeHtml(text)}</span>`;
}

// The sidebar's provider marks, defined once and reused by every thread row.
const PROVIDER_SYMBOLS = `<svg width="0" height="0" style="position:absolute"><symbol id="dd-claude" viewBox="0 0 256 257"><path fill="#d97757" d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"/></symbol><symbol id="dd-openai" viewBox="100 100 411 411"><path fill="currentColor" fill-rule="evenodd" d="M252.794 108.802C289.191 99.0484 326.265 110.305 351.148 135.135C385.113 126.072 422.85 134.862 449.492 161.505C476.136 188.149 484.925 225.888 475.862 259.85V259.854C500.696 284.735 511.95 321.81 502.198 358.207C492.447 394.602 464.161 421.084 430.215 430.217C421.083 464.162 394.603 492.448 358.206 502.199C321.812 511.951 284.734 500.693 259.852 475.864C225.887 484.927 188.15 476.137 161.507 449.495C134.864 422.851 126.073 385.111 135.136 351.149C110.304 326.266 99.0496 289.192 108.801 252.795C118.552 216.4 146.84 189.918 180.784 180.785C189.917 146.841 216.396 118.553 252.794 108.802ZM374.292 407.145C374.292 411.271 372.092 415.086 368.517 417.148L283.723 466.102C302.487 480.585 327.555 486.459 352.217 479.852C386.997 470.532 410.068 439.312 410.555 405.006V317.717C410.555 315.08 409.125 312.621 406.843 311.303L374.292 292.509V407.145ZM251.868 415.897C248.296 417.959 243.893 417.959 240.317 415.897L155.526 366.942C152.366 390.436 159.811 415.08 177.866 433.136H177.863C203.325 458.594 241.896 462.962 271.85 446.232L347.449 402.586C349.735 401.268 351.148 398.8 351.148 396.163V358.579L251.868 415.897ZM368.602 220.628C366.319 219.309 363.474 219.318 361.191 220.637L328.641 239.431L427.921 296.749C431.496 298.811 433.697 302.627 433.697 306.752V404.661C455.622 395.654 473.244 376.881 479.851 352.218C489.169 317.442 473.668 281.85 444.201 264.274L368.602 220.628ZM177.303 206.34C155.377 215.348 137.756 234.122 131.148 258.783C121.832 293.561 137.331 329.153 166.799 346.727L242.398 390.373C244.68 391.692 247.525 391.684 249.807 390.366L282.357 371.572L183.078 314.253C179.504 312.189 177.303 308.375 177.303 304.251V206.34ZM259.849 279.145V331.858L305.5 358.213L351.15 331.858V279.145L305.5 252.789L259.849 279.145ZM327.276 144.9C308.512 130.418 283.445 124.543 258.782 131.15C224.002 140.471 200.931 171.691 200.445 205.995V293.286C200.445 295.923 201.875 298.381 204.158 299.7L236.707 318.493V203.856C236.707 199.731 238.909 195.916 242.483 193.853L327.276 144.9ZM433.137 177.867C407.675 152.407 369.103 148.038 339.149 164.769L263.55 208.415C261.265 209.734 259.852 212.202 259.852 214.838V252.423L359.132 195.105C362.703 193.041 367.108 193.041 370.682 195.105L455.473 244.06C458.635 220.567 451.189 195.922 433.135 177.867H433.137Z"/></symbol></svg>`;

function relativeAge(fromMs: number, toMs: number): string {
  const minutes = Math.max(0, Math.round((toMs - fromMs) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

function threadRow(
  thread: DailyDigestPageContext["threads"][number],
  context: DailyDigestPageContext,
): string {
  const status = THREAD_STATUS[thread.status];
  const trail = status
    ? `<em class="${status[1]}">${status[0]}</em>`
    : thread.done
      ? `<em class="ok"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m5.2 8.2 1.9 1.9 3.7-3.9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Done</em>`
      : `<time>${relativeAge(thread.activityMs, context.untilMs)}</time>`;
  const provider = thread.provider
    ? `<svg class="mark"><use href="#dd-${thread.provider}"/></svg>`
    : "";
  return `<a class="card thread${status || thread.done ? " live" : ""}" href="${escapeHtml(threadHref(context.environmentId, thread.id))}"><span class="line"><b>${escapeHtml(thread.title)}</b>${trail}</span><span class="line sub"><span>${escapeHtml(thread.branch ?? "")}</span>${provider}</span></a>`;
}

const SHOWN_ITEMS = 6;

function statCard(title: string, count: number | string, body: string): string {
  return `<section class="card stat"><header><h3>${title}</h3><strong>${count}</strong></header>${body}</section>`;
}

function statList(items: ReadonlyArray<string>, total: number, empty: string): string {
  if (items.length === 0) return `<p class="none">${empty}</p>`;
  const more = total - Math.min(items.length, SHOWN_ITEMS);
  return `<ul>${items.slice(0, SHOWN_ITEMS).join("")}</ul>${more > 0 ? `<p class="more">and ${more} more</p>` : ""}`;
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
  const time = (ms: number) => formatTime(ms, timeZone, { hour: "2-digit", minute: "2-digit" });
  const commitList = context.commits
    ? statList(
        context.commits.map(
          (commit) =>
            `<li class="two"><span>${escapeHtml(commit.subject)}</span><small><code>${escapeHtml(commit.hash)}</code>${commit.branch ? `<i>${escapeHtml(commit.branch)}</i>` : ""}<time>${time(commit.timeMs)}</time></small></li>`,
        ),
        commits,
        "No commits in this window.",
      )
    : spark;
  const repo = context.repo;
  const stats = [
    statCard("Commits", commits, commitList),
    ...(repo === undefined
      ? []
      : [
          statCard(
            "Uncommitted files",
            repo.uncommittedFiles,
            repo.files
              ? statList(
                  repo.files.map(
                    (file) =>
                      `<li><code class="st">${escapeHtml(file.status)}</code><span>${escapeHtml(file.path)}</span></li>`,
                  ),
                  repo.uncommittedFiles,
                  "The checkout is clean.",
                )
              : "",
          ),
          statCard(
            "Unpushed commits",
            repo.unpushedCommits,
            repo.unpushedBranches
              ? statList(
                  repo.unpushedBranches.map(
                    (entry) =>
                      `<li><span>${escapeHtml(entry.branch)}</span><b>${entry.count}</b></li>`,
                  ),
                  repo.unpushedBranches.length,
                  "Everything is pushed.",
                )
              : "",
          ),
        ]),
    ...(content.facts.length === 0
      ? []
      : [
          `<section class="card stat"><header><h3>Also</h3></header><ul>${content.facts
            .map((fact) => `<li><span>${rich(fact.label)}</span><b>${rich(fact.value)}</b></li>`)
            .join("")}</ul></section>`,
        ]),
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
  const threadCards = context.threads.map((thread) => threadRow(thread, context)).join("");
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
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLES}</style></head><body><div class="dd">${context.threads.some((thread) => thread.provider) ? PROVIDER_SYMBOLS : ""}
<header class="top"><div class="ttl">${projectTile(context)}<h1>${escapeHtml(context.projectTitle)} digest</h1><span class="chip ok">${commitLabel}</span></div><span class="pill raised">${today}</span></header>
<div class="hero">
<section class="card brief"><div class="brief-top"><span class="mood">${rich(content.mood)}</span><span class="stamp">Summarized at ${summarized}</span></div><div><p class="headline">${rich(content.headline)}</p><p class="summary">${rich(content.summary)}</p></div></section>
${heroSide}
</div>
<div class="stats">${stats}</div>
${highlights}
${threadList}
${happened}
${proceed}
</div></body></html>`;
}
