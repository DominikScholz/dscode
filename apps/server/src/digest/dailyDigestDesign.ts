// Theme variables only, so the page follows light, dark, and custom themes.
const DIGEST_STYLESHEET = `.dg{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-flow:row dense;gap:12px}
.t{grid-column:span 12;min-width:0;background:var(--card);border:1px solid var(--border);border-radius:calc(var(--radius) + 10px);padding:20px}
@media (min-width:640px){.s3,.s4{grid-column:span 6}}
@media (min-width:960px){.s8{grid-column:span 8}.s6{grid-column:span 6}.s5{grid-column:span 5}.s4{grid-column:span 4}.s3{grid-column:span 3}.r2{grid-row:span 2}}
.t h2{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:15px;font-weight:600;letter-spacing:-.01em}
.t h2 .c{margin-left:auto;font-size:12px;font-weight:500;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.dot{flex:none;width:8px;height:8px;border-radius:50%;background:currentColor}
.ok{color:var(--success)}.run{color:var(--info)}.ask{color:var(--warning)}.risk{color:var(--destructive)}
a{color:inherit;text-decoration:underline;text-decoration-color:color-mix(in srgb,currentColor 35%,transparent);text-underline-offset:3px}
a:hover{text-decoration-color:currentColor}
code{font-size:12px;padding:1px 5px;border-radius:5px;background:var(--code-background)}
.hero{background:none;border:0;padding:8px 4px 4px;display:flex;flex-direction:column}
.meta{display:flex;flex-wrap:wrap;gap:4px 16px;margin:0 0 16px;font-size:12.5px;color:var(--muted-foreground)}
.meta strong{color:var(--foreground);font-weight:600}
.lede{margin:0 0 14px;font-size:34px;line-height:1.1;font-weight:650;letter-spacing:-.03em;text-wrap:balance}
.sub{margin:0;max-width:62ch;color:var(--muted-foreground);font-size:14.5px;line-height:1.55}
.needs{background:color-mix(in srgb,var(--warning) 7%,var(--card));border-color:color-mix(in srgb,var(--warning) 38%,var(--border))}
.q{padding:14px 0;border-top:1px solid color-mix(in srgb,var(--warning) 22%,var(--border))}
.q:first-of-type{padding-top:0;border-top:0}
.q b{display:block;margin-bottom:4px;font-weight:600}
.q p{margin:0;font-size:13px;color:var(--muted-foreground)}
.pill{display:inline-flex;margin-top:10px;padding:5px 11px;border-radius:999px;font-size:12.5px;font-weight:600;text-decoration:none;color:color-mix(in srgb,var(--warning) 70%,var(--foreground));background:color-mix(in srgb,var(--warning) 16%,transparent)}
.pill:hover{background:color-mix(in srgb,var(--warning) 26%,transparent)}
.items{display:grid;gap:14px;margin:0;padding:0;list-style:none}
.items b{display:block;font-weight:600;margin-bottom:2px}
.items p{margin:0;font-size:13px;color:var(--muted-foreground)}
.items small{display:block;margin-top:4px;font-size:12px;color:var(--muted-foreground)}
.quiet{background:var(--muted);border-color:transparent}
.nums{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 12px}
.nums strong{display:block;font-size:28px;line-height:1.1;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.nums span{font-size:12px;color:var(--muted-foreground)}
.hist,.runs{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:3px}
.hist{align-items:end;height:64px}
.hist i{height:calc(var(--h) * 1%);min-height:3px;border-radius:3px 3px 1px 1px;background:var(--info)}
.hist i.z{background:var(--border)}
.runs{margin-top:6px}.runs i{height:4px;border-radius:2px}.runs i.on{background:var(--success)}
.axis{display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.legend{display:flex;gap:16px}.legend em{font-style:normal;display:inline-flex;align-items:center;gap:6px}
.legend em::before{content:"";width:10px;height:4px;border-radius:2px;background:var(--info)}
.legend em.th::before{background:var(--success)}
.mv{display:flex;flex-direction:column;gap:6px;text-decoration:none;color:inherit}
.mv:hover{border-color:var(--ring)}
.mv .n{font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.mv b{font-size:15px;font-weight:600;letter-spacing:-.01em}
.mv p{margin:0;font-size:13px;color:var(--muted-foreground)}
.mv.lead b{font-size:20px;letter-spacing:-.02em}
.mv .go{margin-top:auto;padding-top:10px;font-size:12.5px;font-weight:600;color:var(--primary)}`;

const DIGEST_SKELETON = `<div class="dg">
<section class="t s8 hero"><div class="meta"><strong>PROJECT</strong><span>WINDOW</span></div><p class="lede">VERDICT</p><p class="sub">CONTEXT</p></section>
<section class="t s4 r2 needs"><h2><span class="dot ask"></span><span>Needs you</span><span class="c">N</span></h2><div class="q"><b>DECISION</b><p>WHY</p><a class="pill" href="THREAD_PROMPT_LINK">Answer in thread</a></div></section>
<section class="t s8"><h2><span>Your day</span><span class="c legend"><em>N commits</em><em class="th">N thread runs</em></span></h2><div class="hist"><i class="z" style="--h:0"></i><i style="--h:60"></i>…24</div><div class="runs"><i></i><i class="on"></i>…24</div><div class="axis"><span>06:00</span>…<span>06:00</span></div></section>
<section class="t s5"><h2><span class="dot ok"></span><span>Shipped</span><span class="c">N</span></h2><ul class="items"><li><b>WHAT</b><p>DETAIL</p><small><a href="THREAD_LINK">THREAD TITLE</a></small></li></ul></section>
<section class="t s4"><h2><span class="dot run"></span><span>In progress</span>…</h2>…</section>
<section class="t s3 quiet"><h2><span>In numbers</span></h2><div class="nums"><div><strong>N</strong><span>LABEL</span></div>…4</div></section>
<section class="t s8"><h2><span class="dot risk"></span><span>Risks</span></h2>…</section>
<section class="t s4"><h2><span>Threads touched</span></h2>…</section>
<a class="t s6 mv lead" href="NEW_PROMPT_LINK"><span class="n">1</span><b>MOVE</b><p>WHY</p><span class="go">Start thread</span></a>
<a class="t s3 mv" href="NEW_PROMPT_LINK"><span class="n">2</span>…</a>
</div>`;

export const DAILY_DIGEST_DESIGN = [
  "Design, unless the reader's instructions describe their own: a bento grid that reads in 20 seconds, in this order: verdict, what needs the reader, what moved, what to start.",
  `Put this stylesheet in a <style> tag verbatim. Add rules only for something it lacks, and only with theme variables:\n${DIGEST_STYLESHEET}`,
  `Follow this structure (uppercase words are placeholders):\n${DIGEST_SKELETON}`,
  "- The verdict is one plain sentence of at most 20 words that says what matters most today; it is the page's only large type. The context under it is two or three sentences.",
  "- Needs you lists decisions and questions only the reader can answer, most urgent first, each with a thread link carrying a prompt when one helps. It is the only tinted tile; leave it out when nothing needs the reader.",
  "- Your day has 24 bars spread evenly over the window. Each bar's --h is that slot's commit count as a percent of the busiest slot; empty slots get class z and --h:0. The runs row marks slots where a thread run happened. Label five evenly spaced times in local time.",
  "- Shipped, In progress, and Risks hold short items: a bold line, one sentence of detail, and the thread link under it. In numbers holds two to four numbers that change a decision, not decoration.",
  "- Next moves are ranked, so they are numbered: the first is the wide lead tile, the rest are s3 tiles, three to five in all. Each is a prompt link with a verb-first title and a one-line reason.",
  "- Leave out any tile with nothing real to say, and keep each row filled: in a row of 12 columns, tiles must add up to 12.",
  "- Copy: sentence case, plain verbs, no filler. Link text names where it goes, such as Open thread or Answer in thread, without arrows. No all-caps labels, no text joined by middle dots, no emoji.",
].join("\n");
