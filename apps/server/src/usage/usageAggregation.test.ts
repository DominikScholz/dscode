import { describe, expect, it } from "@effect/vitest";

import { resolveModelAliases, UsageAggregator } from "./usageAggregation.ts";
import type { RateTable } from "./usagePricing.ts";
import type { UsageRecord } from "@t3tools/provider-core/server/usage";

const rates: RateTable = new Map([
  [
    "claude-fable-5",
    {
      inputCostPerToken: 1e-5,
      outputCostPerToken: 5e-5,
      cacheReadCostPerToken: 1e-6,
      cacheCreationCostPerToken: 1.25e-5,
      fast: {
        inputCostPerToken: 2e-5,
        outputCostPerToken: 1e-4,
        cacheReadCostPerToken: 2e-6,
        cacheCreationCostPerToken: 2.5e-5,
      },
      ultrafast: null,
    },
  ],
]);

function record(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    provider: "claude",
    timestampMs: Date.parse("2026-08-07T04:05:13.944Z"),
    model: "claude-fable-5",
    sessionId: "session-a",
    totals: {
      uncachedInputTokens: 100,
      cachedInputTokens: 1000,
      cacheCreationTokens: 10,
      outputTokens: 50,
      reasoningTokens: 0,
    },
    reportedCostUsd: null,
    speed: "standard",
    dedupeKey: null,
    ...overrides,
  };
}

function aggregate(
  records: readonly UsageRecord[],
  timeZone = "UTC",
  resolution: "day" | "hour" = "day",
) {
  const hourlyBounds =
    resolution === "hour"
      ? {
          sinceTimeMs: Date.parse("2026-08-06T04:37:00.000Z"),
          untilTimeMs: Date.parse("2026-08-07T04:37:00.000Z"),
        }
      : {};
  const aggregator = new UsageAggregator({
    timeZone,
    sinceDay: "2026-08-01",
    untilDay: "2026-08-31",
    resolution,
    ...hourlyBounds,
    rates,
  });
  for (const item of records) aggregator.add(item);
  return aggregator.finish();
}

describe("UsageAggregator", () => {
  it("splits a bucket's cost by category and speed", () => {
    const [bucket] = aggregate([record(), record({ speed: "fast" })]).buckets;

    expect(bucket).toMatchObject({
      costUsd: expect.closeTo(0.016875),
      categoryCostUsd: {
        input: expect.closeTo(0.003),
        cacheRead: expect.closeTo(0.003),
        cacheWrite: expect.closeTo(0.000375),
        output: expect.closeTo(0.0075),
      },
      fastCostUsd: expect.closeTo(0.01125),
      speedPremiumUsd: expect.closeTo(0.005625),
    });
    expect(bucket).not.toHaveProperty("ultrafastCostUsd");
  });

  it("keeps only the first record for a repeated dedupe key", () => {
    const result = aggregate([
      record({ dedupeKey: "msg_1:" }),
      record({ dedupeKey: "msg_1:" }),
      record({ dedupeKey: "msg_1:" }),
    ]);

    expect(result.duplicatesDropped).toBe(2);
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0]?.records).toBe(1);
    expect(result.buckets[0]?.totals.outputTokens).toBe(50);
  });

  it("buckets by the day in the requested time zone", () => {
    const utc = aggregate([record()], "UTC");
    const losAngeles = aggregate([record()], "America/Los_Angeles");

    expect(utc.buckets[0]?.day).toBe("2026-08-07");
    expect(losAngeles.buckets[0]?.day).toBe("2026-08-06");
  });

  it("finds the day at a quarter-hour zone's midnight across interleaved buckets", () => {
    const result = aggregate(
      [
        record({ timestampMs: Date.parse("2026-08-01T18:14:59.999Z") }),
        record({ timestampMs: Date.parse("2026-08-01T18:15:00.000Z") }),
        record({ timestampMs: Date.parse("2026-08-01T18:15:00.000Z"), model: "claude-opus-5" }),
        record({ timestampMs: Date.parse("2026-08-01T18:16:00.000Z") }),
      ],
      "Asia/Kathmandu",
    );

    expect(result.buckets.map((bucket) => [bucket.day, bucket.model, bucket.records])).toEqual([
      ["2026-08-01", "claude-fable-5", 1],
      ["2026-08-02", "claude-fable-5", 2],
      ["2026-08-02", "claude-opus-5", 1],
    ]);
  });

  it("finds the day at a fixed offset's midnight between quarter hours", () => {
    const result = aggregate(
      [
        record({ timestampMs: Date.parse("2026-08-01T23:58:59.999Z") }),
        record({ timestampMs: Date.parse("2026-08-01T23:59:00.000Z") }),
      ],
      "+00:01",
    );

    expect(result.buckets.map((bucket) => [bucket.day, bucket.records])).toEqual([
      ["2026-08-01", 1],
      ["2026-08-02", 1],
    ]);
  });

  it("splits an hourly request into fixed buckets anchored to its exact start", () => {
    const result = aggregate(
      [
        record({ timestampMs: Date.parse("2026-08-07T02:40:13.944Z") }),
        record({ timestampMs: Date.parse("2026-08-07T03:40:13.944Z") }),
      ],
      "America/Los_Angeles",
      "hour",
    );

    expect(result.buckets.map((bucket) => [bucket.day, bucket.hourStart])).toEqual([
      ["2026-08-06", "2026-08-07T02:37:00.000Z"],
      ["2026-08-06", "2026-08-07T03:37:00.000Z"],
    ]);
  });

  it("uses an inclusive start and exclusive end for rolling windows", () => {
    const result = aggregate(
      [
        record({ timestampMs: Date.parse("2026-08-06T04:36:59.999Z") }),
        record({ timestampMs: Date.parse("2026-08-06T04:37:00.000Z") }),
        record({ timestampMs: Date.parse("2026-08-07T04:36:59.999Z") }),
        record({ timestampMs: Date.parse("2026-08-07T04:37:00.000Z") }),
      ],
      "UTC",
      "hour",
    );

    expect(result.outOfWindow).toBe(2);
    expect(result.buckets.map((bucket) => bucket.hourStart)).toEqual([
      "2026-08-06T04:37:00.000Z",
      "2026-08-07T03:37:00.000Z",
    ]);
  });

  it("counts tokens but not cost for a model with no rate", () => {
    const result = aggregate([record({ model: "kimi-k3" })]);

    expect(result.buckets[0]?.costUsd).toBe(0);
    expect(result.buckets[0]?.costSource).toBe("unpriced");
    expect(result.buckets[0]?.unpricedRecords).toBe(1);
    expect(result.buckets[0]?.totals.outputTokens).toBe(50);
  });

  it("prefers a reported cost over the rate table", () => {
    const result = aggregate([record({ reportedCostUsd: 1.25 })]);

    expect(result.buckets[0]?.costUsd).toBe(1.25);
    expect(result.buckets[0]?.costSource).toBe("providerReported");
  });

  it("folds a mapped model into its target and prices it there", () => {
    const aggregator = new UsageAggregator({
      timeZone: "UTC",
      sinceDay: "2026-08-01",
      untilDay: "2026-08-31",
      rates,
      modelAliases: resolveModelAliases({ "example-preview": "claude-fable-5" }),
    });
    aggregator.add(record());
    aggregator.add(record({ model: "example-preview", rateModel: "example-preview-high" }));
    const result = aggregator.finish();

    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0]?.model).toBe("claude-fable-5");
    expect(result.buckets[0]?.records).toBe(2);
    expect(result.buckets[0]?.costUsd).toBeCloseTo(0.00925, 9);
    expect(result.buckets[0]?.unpricedRecords).toBe(0);
  });
});

function aggregateSeries(
  records: readonly UsageRecord[],
  options: {
    readonly timeZone: string;
    readonly sinceDay: string;
    readonly untilDay: string;
    readonly stepHours?: 1 | 4;
    readonly untilMs?: number;
  },
) {
  const aggregator = new UsageAggregator({
    timeZone: options.timeZone,
    sinceDay: options.sinceDay,
    untilDay: options.untilDay,
    seriesStepHours: options.stepHours ?? 1,
    ...(options.untilMs === undefined ? {} : { seriesUntilMs: options.untilMs }),
    rates,
  });
  for (const item of records) aggregator.add(item);
  return aggregator.finish();
}

function nonZeroSlots(values: readonly number[] | undefined) {
  return (values ?? []).flatMap((value, index) => (value === 0 ? [] : [[index, value]]));
}

describe("UsageAggregator series", () => {
  it("places slots on wall-clock hours in the requested zone", () => {
    const { series } = aggregateSeries(
      [
        record({ timestampMs: Date.parse("2026-08-01T05:59:00.000Z") }),
        record({ timestampMs: Date.parse("2026-08-01T22:30:00.000Z") }),
      ],
      { timeZone: "Europe/Berlin", sinceDay: "2026-08-01", untilDay: "2026-08-02" },
    );

    expect(series?.rows).toHaveLength(1);
    expect(series?.rows[0]?.totalTokens).toHaveLength(48);
    // 07:59 and 00:30 the next day in Berlin; tokens exclude the reasoning subset.
    expect(nonZeroSlots(series?.rows[0]?.totalTokens)).toEqual([
      [7, 1160],
      [24, 1160],
    ]);
  });

  it("groups wider slots by local hour", () => {
    const { series } = aggregateSeries(
      [
        record({ timestampMs: Date.parse("2026-08-01T13:00:00.000Z") }),
        record({ timestampMs: Date.parse("2026-08-01T15:59:59.999Z") }),
        record({ timestampMs: Date.parse("2026-08-01T16:00:00.000Z") }),
      ],
      { timeZone: "UTC", sinceDay: "2026-08-01", untilDay: "2026-08-01", stepHours: 4 },
    );

    expect(nonZeroSlots(series?.rows[0]?.totalTokens)).toEqual([
      [3, 2320],
      [4, 1160],
    ]);
  });

  it("folds a repeated fall-back hour into one slot", () => {
    const { series } = aggregateSeries(
      [
        // 02:30 CEST, then 02:30 CET after clocks go back.
        record({ timestampMs: Date.parse("2026-10-25T00:30:00.000Z") }),
        record({ timestampMs: Date.parse("2026-10-25T01:30:00.000Z") }),
      ],
      { timeZone: "Europe/Berlin", sinceDay: "2026-10-25", untilDay: "2026-10-25" },
    );

    expect(series?.rows[0]?.totalTokens).toHaveLength(24);
    expect(nonZeroSlots(series?.rows[0]?.totalTokens)).toEqual([[2, 2320]]);
  });

  it("ends at the current slot and keeps later records out of the series only", () => {
    const result = aggregateSeries(
      [
        record({ timestampMs: Date.parse("2026-08-02T10:20:00.000Z") }),
        record({ timestampMs: Date.parse("2026-08-02T11:05:00.000Z") }),
      ],
      {
        timeZone: "UTC",
        sinceDay: "2026-08-01",
        untilDay: "2026-08-02",
        untilMs: Date.parse("2026-08-02T10:30:00.000Z"),
      },
    );

    expect(result.series?.rows[0]?.totalTokens).toHaveLength(35);
    expect(nonZeroSlots(result.series?.rows[0]?.totalTokens)).toEqual([[34, 1160]]);
    expect(result.buckets[0]?.records).toBe(2);
  });

  it("adds up to the daily buckets beside it", () => {
    const result = aggregateSeries(
      [
        record({ timestampMs: Date.parse("2026-08-01T01:00:00.000Z") }),
        record({ timestampMs: Date.parse("2026-08-01T09:00:00.000Z"), speed: "fast" }),
        record({ timestampMs: Date.parse("2026-08-01T17:00:00.000Z"), reportedCostUsd: 0.5 }),
      ],
      { timeZone: "UTC", sinceDay: "2026-08-01", untilDay: "2026-08-01" },
    );
    const [bucket] = result.buckets;
    const [row] = result.series?.rows ?? [];

    expect(row?.totalTokens.reduce((sum, value) => sum + value, 0)).toBe(3 * 1160);
    expect(row?.costUsd.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
      bucket?.costUsd ?? 0,
      6,
    );
  });

  it("is omitted for hourly requests and windows past the slot cap", () => {
    const hourly = aggregate([record()], "UTC", "hour");
    const year = aggregateSeries([record()], {
      timeZone: "UTC",
      sinceDay: "2026-01-01",
      untilDay: "2026-12-31",
    });

    expect(hourly.series).toBeNull();
    expect(year.series).toBeNull();
  });
});

describe("resolveModelAliases", () => {
  it("follows chains to the final model and drops chains that enter a loop", () => {
    expect(
      resolveModelAliases({
        "preview[1m]": "preview",
        preview: "example-model",
        loop: "back",
        back: "loop",
        intoLoop: "loop",
        self: "self",
      }),
    ).toEqual(
      new Map([
        ["preview[1m]", "example-model"],
        ["preview", "example-model"],
      ]),
    );
  });
});
