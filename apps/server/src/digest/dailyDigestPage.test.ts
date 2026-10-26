import { describe, expect, it } from "@effect/vitest";

import { type DailyDigestPageContent, renderDailyDigestPage } from "./dailyDigestPage.ts";

const context = {
  projectTitle: "dscode",
  environmentId: "env-1",
  sinceMs: Date.parse("2026-10-25T07:00:00.000Z"),
  untilMs: Date.parse("2026-10-26T07:00:00.000Z"),
  activity: [0, 2, 1, 0],
  timeZone: "UTC",
};

const content: DailyDigestPageContent = {
  mood: "Calm day",
  headline: "Ship <it> & `main`",
  summary: "Summary.",
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
  it("escapes the agent's text and turns backticks into code", () => {
    const html = renderDailyDigestPage(content, context);
    expect(html).toContain("Ship &lt;it&gt; &amp; <code>main</code>");
    expect(html).not.toContain("<it>");
  });

  it("titles every page the same way and builds the links itself", () => {
    const html = renderDailyDigestPage(content, context);
    expect(html).toContain("<h1>dscode digest</h1>");
    expect(html).toContain('href="https://app.t3.codes/env-1/thread%3A1"');
    expect(html).toContain('href="https://app.t3.codes/env-1/thread%3A1?prompt=Yes%20%26%20go"');
    expect(html).toContain('href="https://app.t3.codes/new?prompt=Add%20a%20CI%20workflow"');
    expect(html).toContain("3 commits");
  });

  it("leaves out sections with nothing in them", () => {
    const html = renderDailyDigestPage({ ...content, decisions: [], nextSteps: [] }, context);
    expect(html).not.toContain("How to proceed");
    expect(html).toContain("What happened");
  });
});
