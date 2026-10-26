import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { digestSnapshotJson, digestSnapshotPath, servedDigestPage } from "./dailyDigestAsset.ts";
import { DailyDigestPageSnapshot } from "@t3tools/contracts";

const snapshot: DailyDigestPageSnapshot = {
  content: {
    mood: "Steady",
    headline: "The new template reaches old digests.",
    summary: "Pages render from their snapshot.",
    visuals: [
      { kind: "image", title: "Kept", path: "/gone/shot.png" },
      { kind: "image", title: "Lost", path: "/gone/other.png" },
    ],
    facts: [],
    sections: [],
    decisions: [],
    nextSteps: [],
  },
  context: {
    projectTitle: "dscode",
    environmentId: "env-1",
    sinceMs: Date.parse("2026-10-25T07:00:00.000Z"),
    untilMs: Date.parse("2026-10-26T07:00:00.000Z"),
    activity: [0, 1],
    threads: [],
    timeZone: "UTC",
  },
  images: { "/gone/shot.png": "data:image/png;base64,AAAA" },
};

const writePage = Effect.fn(function* (snapshotJson: string | null) {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-digest-asset-" });
  const htmlPath = `${dir}/thread-1-html.html`;
  yield* fs.writeFileString(htmlPath, "<p>published design</p>");
  if (snapshotJson !== null) yield* fs.writeFileString(digestSnapshotPath(htmlPath), snapshotJson);
  return htmlPath;
});

const encodeSnapshot = Schema.encodeSync(Schema.fromJsonString(DailyDigestPageSnapshot));

it.layer(NodeServices.layer)("served digest page", (it) => {
  it.effect("renders from the snapshot with images it kept", () =>
    Effect.gen(function* () {
      const page = yield* servedDigestPage(yield* writePage(encodeSnapshot(snapshot)));
      const html = new TextDecoder().decode(page!);
      expect(html).toContain("The new template reaches old digests.");
      expect(html).toContain('src="data:image/png;base64,AAAA"');
      expect(html).not.toContain("/gone/");
      expect(html).not.toContain("published design");
    }),
  );

  it.effect("leaves pages without a usable snapshot to their stored html", () =>
    Effect.gen(function* () {
      expect(yield* servedDigestPage(yield* writePage(null))).toBeNull();
      expect(yield* servedDigestPage(yield* writePage('{"content":{}}'))).toBeNull();
    }),
  );

  it("hands clients the snapshot so they can render the digest themselves", () =>
    Effect.gen(function* () {
      const json = encodeSnapshot(snapshot);
      expect(yield* digestSnapshotJson(yield* writePage(json))).toBe(json);
      expect(yield* digestSnapshotJson(yield* writePage(null))).toBeNull();
    }));
});
