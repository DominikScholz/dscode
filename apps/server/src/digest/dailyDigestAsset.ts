import { injectHtmlRenderBootstrap } from "@t3tools/shared/htmlRender";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { DailyDigestPageSnapshot } from "@t3tools/contracts";

import { renderDailyDigestSnapshot } from "./dailyDigestPage.ts";

export const digestSnapshotPath = (htmlPath: string) => htmlPath.replace(/\.html$/, ".digest.json");

const decodeSnapshot = Schema.decodeUnknownEffect(Schema.fromJsonString(DailyDigestPageSnapshot));

/**
 * A digest page rendered from its snapshot with the current template, so design changes reach
 * old digests. Null for other HTML, or when the snapshot is unusable and the stored page stands.
 */
export const servedDigestPage = Effect.fn("DailyDigest.servedPage")(function* (htmlPath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const snapshotPath = digestSnapshotPath(htmlPath);
  if (snapshotPath === htmlPath || !(yield* fileSystem.exists(snapshotPath))) return null;
  return yield* fileSystem.readFileString(snapshotPath).pipe(
    Effect.flatMap(decodeSnapshot),
    Effect.map((snapshot) =>
      new TextEncoder().encode(injectHtmlRenderBootstrap(renderDailyDigestSnapshot(snapshot))),
    ),
    Effect.catchCause((cause) =>
      Effect.logWarning("Could not render a digest from its snapshot", { cause }).pipe(
        Effect.as(null),
      ),
    ),
  );
});

/** A digest page's snapshot for clients that render the digest themselves, or null. */
export const digestSnapshotJson = Effect.fn("DailyDigest.snapshotJson")(function* (
  htmlPath: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const snapshotPath = digestSnapshotPath(htmlPath);
  if (snapshotPath === htmlPath || !(yield* fileSystem.exists(snapshotPath))) return null;
  return yield* fileSystem.readFileString(snapshotPath);
});
