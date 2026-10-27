import { describe, expect, it } from "@effect/vitest";

import type { DailyDigestPageContent } from "@t3tools/contracts";

import { renderDailyDigestPage, renderDailyDigestSnapshot } from "./dailyDigestPage.ts";

const context = {
  projectTitle: "dscode",
  environmentId: "env-1",
  sinceMs: Date.parse("2026-10-25T07:00:00.000Z"),
  untilMs: Date.parse("2026-10-26T07:00:00.000Z"),
  activity: [0, 2, 1, 0],
  threads: [{ id: "thread:2", title: "Bench <fast>", status: "running", activityMs: 0 }],
  timeZone: "UTC",
};

const content: DailyDigestPageContent = {
  mood: "Calm day",
  headline: "Ship <it> & `main`",
  summary: "Summary.",
  visuals: [],
  facts: [],
  sections: [
    {
      title: "Work",
      status: "in_progress",
      summary: "Done.",
      threadId: "thread:1",
      issue: "Unpushed.",
    },
  ],
  decisions: [{ question: "Push?", context: "Ask.", threadId: "thread:1", prompt: "Yes & go" }],
  nextSteps: [{ title: "Add CI", reason: "Safety.", prompt: "Add a CI workflow" }],
};

describe("renderDailyDigestPage", () => {
  it("routes remote actions and screenshots to their source without inventing git counts", () => {
    const html = renderDailyDigestSnapshot({
      content: {
        ...content,
        visuals: [
          {
            kind: "image",
            title: "Mobile screen",
            path: "/remote/screen.png",
            threadId: "thread:1",
          },
        ],
      },
      context: { ...context, activity: [], remote: { machine: "idom", projectId: "mobile" } },
      images: {},
    });
    expect(html).toContain("environmentId=env-1&amp;projectId=mobile");
    expect(html).toContain('href="https://app.t3.codes/env-1/thread%3A1"');
    expect(html).toContain("Screenshot from idom");
    expect(html).not.toContain('src="/remote/');
    expect(html).not.toContain("0 commits");
    expect(html).not.toContain("<h3>Commits</h3>");
  });
  it("escapes the agent's text and turns backticks into code", () => {
    const html = renderDailyDigestPage(content, context);
    expect(html).toContain("Ship &lt;it&gt; &amp; <code>main</code>");
    expect(html).not.toContain("<it>");
  });

  it("titles every page the same way and builds the links itself", () => {
    const html = renderDailyDigestPage(content, context);
    expect(html).toContain("<h1><span>Daily Digest -</span>");
    expect(html).toContain("<span>dscode</span></span></h1>");
    expect(html).toContain('href="https://app.t3.codes/env-1/thread%3A1"');
    expect(html).toContain('href="https://app.t3.codes/env-1/thread%3A1?prompt=Yes%20%26%20go"');
    expect(html).toContain('href="https://app.t3.codes/new?prompt=Add%20a%20CI%20workflow"');
  });

  it("shows the project's icon like the app, down to its derived monogram", () => {
    const icon = "data:image/svg+xml;base64,PHN2Zy8+";
    expect(renderDailyDigestPage(content, { ...context, icon })).toContain(
      `<span class="tile icon"><img src="${icon}" alt=""></span>`,
    );
    expect(renderDailyDigestPage(content, { ...context, emoji: "🚀" })).toContain(
      '<span class="tile emoji">🚀</span>',
    );
    expect(
      renderDailyDigestPage(content, { ...context, monogram: { text: "T3", color: "blue" } }),
    ).toMatch(/<span class="tile mono" style="--mono:light-dark\(#2563eb,#60a5fa\)">T3<\/span>/);
    expect(renderDailyDigestPage(content, { ...context, projectTitle: "server" })).toMatch(
      /<span class="tile mono"[^>]*>SR<\/span>/,
    );
  });

  it("lists the commits, changed files, and unpushed branches under their totals", () => {
    const html = renderDailyDigestPage(content, {
      ...context,
      commits: Array.from({ length: 8 }, (_, index) => ({
        hash: `c${index}`,
        subject: index === 0 ? "Fix <script>" : `Commit ${index}`,
        timeMs: context.untilMs - index * 60_000,
        branch: "main",
      })),
      repo: {
        uncommittedFiles: 2,
        unpushedCommits: 5,
        files: [
          { status: "M", path: "src/a.ts" },
          { status: "??", path: "notes.md" },
        ],
        unpushedBranches: [],
      },
    });
    expect(html).toContain("<h3>Commits</h3><strong>3</strong>");
    expect(html).toContain("<span>Fix &lt;script&gt;</span><small><code>c0</code><i>main</i>");
    expect(html).not.toContain("<code>c6</code>");
    expect(html).toContain("<h3>Uncommitted files</h3><strong>2</strong>");
    expect(html).toContain('<code class="st">??</code><span>notes.md</span>');
    expect(html).toContain("<h3>Unpushed commits</h3><strong>5</strong>");
    expect(html).toContain("Everything is pushed.");
  });

  it("leaves out sections with nothing in them", () => {
    const html = renderDailyDigestPage({ ...content, decisions: [], nextSteps: [] }, context);
    expect(html).not.toContain("How to proceed");
    expect(html).toContain("What happened");
  });

  it("includes supplied visuals and falls back to the commits chart without one", () => {
    const withVisuals = renderDailyDigestPage(
      {
        ...content,
        visuals: [
          { kind: "image", title: "New panel", path: "/tmp/shot.png", threadId: "thread:1" },
          {
            kind: "bars",
            title: "Startup",
            unit: "ms",
            items: [
              { label: "Before", value: 400 },
              { label: "After", value: 100, highlight: true },
            ],
          },
        ],
      },
      context,
    );
    expect(withVisuals).toContain('<img src="/tmp/shot.png"');
    expect(withVisuals).toContain("Highlights");
    expect(withVisuals).toContain('<div class="bar hi"><span>After</span>');
    expect(withVisuals).not.toContain('class="card plot-card"');
    expect(renderDailyDigestPage(content, context)).toContain('class="card plot-card"');
  });

  it("always lists the window's threads with links", () => {
    const html = renderDailyDigestPage(content, context);
    expect(html).toContain('href="https://app.t3.codes/env-1/thread%3A2"');
    expect(html).toContain('<b>Bench &lt;fast&gt;</b><em class="run">Working</em>');
  });
});
