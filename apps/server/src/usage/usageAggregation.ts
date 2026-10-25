// @effect-diagnostics globalDate:off
import type {
  UsageBucket,
  UsageCategoryCost,
  UsageDay,
  UsageResolution,
  UsageSeries,
  UsageSeriesStepHours,
  UsageTokenTotals,
} from "@t3tools/contracts";

import { EMPTY_TOTALS, type UsageRecord } from "@t3tools/provider-core/server/usage";
import { cacheSavingsUsd, priceUsage, type RateTable } from "./usagePricing.ts";

interface LocalTime {
  readonly day: string;
  readonly hour: number;
}

// en-CA gives ISO-ordered parts in the requested zone; Date getters are host-local.
function makeLocalTimeFormatter(timeZone: string): (timestampMs: number) => LocalTime {
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  } as const;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", { ...options, timeZone });
  } catch {
    format = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "UTC" });
  }
  const read = (timestampMs: number): LocalTime => {
    const parts = format.formatToParts(new Date(timestampMs));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((entry) => entry.type === type)?.value ?? "";
    return {
      day: `${part("year")}-${part("month")}-${part("day")}`,
      hour: Number(part("hour")) % 24,
    };
  };
  // Cache quarter-hour slots to avoid per-record Intl calls; fixed-offset midnight can split slots and needs exact formatting.
  const slots = new Map<number, LocalTime | null>();
  return (timestampMs) => {
    const slot = Math.floor(timestampMs / QUARTER_HOUR_MS);
    let local = slots.get(slot);
    if (local === undefined) {
      const first = read(slot * QUARTER_HOUR_MS);
      const last = read((slot + 1) * QUARTER_HOUR_MS - 1);
      local = first.day === last.day && first.hour === last.hour ? first : null;
      slots.set(slot, local);
    }
    return local ?? read(timestampMs);
  };
}

const QUARTER_HOUR_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** 100 days of hourly slots; longer series are omitted and charts fall back to days. */
const MAX_SERIES_SLOTS = 2400;

interface MutableSeriesRow {
  readonly totalTokens: number[];
  readonly costUsd: number[];
}

interface SeriesState {
  readonly stepHours: UsageSeriesStepHours;
  readonly sinceDayMs: number;
  readonly length: number;
  readonly rows: Map<string, MutableSeriesRow>;
}

interface MutableBucket {
  totals: { -readonly [K in keyof UsageTokenTotals]: number };
  costUsd: number;
  cacheSavingsUsd: number;
  categoryCostUsd: UsageCategoryCost | null;
  fastCostUsd: number;
  ultrafastCostUsd: number;
  speedPremiumUsd: number;
  records: number;
  unpricedRecords: number;
  providerReportedRecords: number;
  sessions: Set<string>;
}

export interface AggregateOptions {
  readonly timeZone: string;
  readonly sinceDay: string;
  readonly untilDay: string;
  readonly rates: RateTable;
  readonly priceOverrides?: RateTable;
  readonly modelAliases?: ReadonlyMap<string, string>;
  readonly resolution?: UsageResolution;
  readonly sinceTimeMs?: number;
  readonly untilTimeMs?: number;
  /** Day resolution only. */
  readonly seriesStepHours?: UsageSeriesStepHours;
  /** Series end at the slot containing this instant when it falls inside the window. */
  readonly seriesUntilMs?: number;
}

export function resolveModelAliases(
  aliases: Readonly<Record<string, string>>,
): ReadonlyMap<string, string> {
  const resolved = new Map<string, string>();
  for (const model of Object.keys(aliases)) {
    const seen = new Set([model]);
    let target = aliases[model]!;
    while (Object.hasOwn(aliases, target) && !seen.has(target)) {
      seen.add(target);
      target = aliases[target]!;
    }
    if (!Object.hasOwn(aliases, target)) resolved.set(model, target);
  }
  return resolved;
}

export interface AggregateResult {
  readonly buckets: readonly UsageBucket[];
  readonly series: UsageSeries | null;
  readonly duplicatesDropped: number;
  readonly outOfWindow: number;
}

/** Deduplicates across the whole scan; Claude copies records into resumed/forked transcripts. */
export class UsageAggregator {
  readonly #buckets = new Map<string, MutableBucket>();
  readonly #seen = new Set<string>();
  readonly #toLocal: (timestampMs: number) => LocalTime;
  readonly #hourlyWindow: { readonly sinceTimeMs: number; readonly untilTimeMs: number } | null;
  readonly #series: SeriesState | null;
  #lastSeriesRow: { readonly key: string; readonly row: MutableSeriesRow } | null = null;
  readonly #seriesDayIndex = new Map<string, number>();
  readonly #options: AggregateOptions;
  #lastBucket: {
    readonly day: string;
    readonly hourIndex: number;
    readonly provider: string;
    readonly model: string;
    readonly source: string;
    readonly bucket: MutableBucket;
  } | null = null;
  #duplicatesDropped = 0;
  #outOfWindow = 0;

  constructor(options: AggregateOptions) {
    this.#options = options;
    this.#toLocal = makeLocalTimeFormatter(options.timeZone);
    this.#series = this.#makeSeries(options);
    if (options.resolution === "hour") {
      if (options.sinceTimeMs === undefined || options.untilTimeMs === undefined) {
        throw new Error("Hourly usage aggregation requires exact time bounds");
      }
      this.#hourlyWindow = {
        sinceTimeMs: options.sinceTimeMs,
        untilTimeMs: options.untilTimeMs,
      };
    } else {
      this.#hourlyWindow = null;
    }
  }

  add(input: UsageRecord, sourcePath?: string): boolean {
    const record = this.#mapModel(input);
    if (record.dedupeKey !== null) {
      if (this.#seen.has(record.dedupeKey)) {
        this.#duplicatesDropped += 1;
        return false;
      }
      this.#seen.add(record.dedupeKey);
    }

    if (
      this.#hourlyWindow !== null &&
      (record.timestampMs < this.#hourlyWindow.sinceTimeMs ||
        record.timestampMs >= this.#hourlyWindow.untilTimeMs)
    ) {
      this.#outOfWindow += 1;
      return false;
    }

    const local = this.#toLocal(record.timestampMs);
    const day = local.day;
    if (
      this.#hourlyWindow === null &&
      (day < this.#options.sinceDay || day > this.#options.untilDay)
    ) {
      this.#outOfWindow += 1;
      return false;
    }

    const hourIndex =
      this.#hourlyWindow === null
        ? -1
        : Math.floor((record.timestampMs - this.#hourlyWindow.sinceTimeMs) / HOUR_MS);
    const bucket = this.#bucketFor(day, hourIndex, record.provider, record.model, sourcePath ?? "");

    const priced = priceUsage(this.#options.rates, record, this.#options.priceOverrides);

    const totals = bucket.totals;
    totals.uncachedInputTokens += record.totals.uncachedInputTokens;
    totals.cachedInputTokens += record.totals.cachedInputTokens;
    totals.cacheCreationTokens += record.totals.cacheCreationTokens;
    totals.outputTokens += record.totals.outputTokens;
    totals.reasoningTokens += record.totals.reasoningTokens;
    bucket.costUsd += priced.costUsd;
    if (priced.categoryCostUsd !== null) {
      const sum = bucket.categoryCostUsd;
      const add = priced.categoryCostUsd;
      bucket.categoryCostUsd =
        sum === null
          ? add
          : {
              input: sum.input + add.input,
              cacheRead: sum.cacheRead + add.cacheRead,
              cacheWrite: sum.cacheWrite + add.cacheWrite,
              output: sum.output + add.output,
            };
    }
    if (record.speed === "fast") bucket.fastCostUsd += priced.costUsd;
    if (record.speed === "ultrafast") bucket.ultrafastCostUsd += priced.costUsd;
    bucket.speedPremiumUsd += priced.speedPremiumUsd;
    bucket.cacheSavingsUsd += cacheSavingsUsd(
      this.#options.rates,
      record,
      this.#options.priceOverrides,
    );
    bucket.records += 1;
    if (priced.costSource === "unpriced") bucket.unpricedRecords += 1;
    if (priced.costSource === "providerReported") bucket.providerReportedRecords += 1;
    if (record.sessionId.length > 0) bucket.sessions.add(record.sessionId);

    const series = this.#series;
    if (series !== null) {
      const index = this.#seriesIndex(series, local);
      if (index >= 0 && index < series.length) {
        const row = this.#seriesRowFor(series, record.provider, record.model, sourcePath ?? "");
        // reasoningTokens is a subset of outputTokens and must not be added again.
        row.totalTokens[index] =
          (row.totalTokens[index] ?? 0) +
          record.totals.uncachedInputTokens +
          record.totals.cachedInputTokens +
          record.totals.cacheCreationTokens +
          record.totals.outputTokens;
        row.costUsd[index] = (row.costUsd[index] ?? 0) + priced.costUsd;
      }
    }
    return true;
  }

  #makeSeries(options: AggregateOptions): SeriesState | null {
    const stepHours = options.seriesStepHours;
    if (stepHours === undefined || options.resolution === "hour") return null;
    const sinceDayMs = Date.parse(`${options.sinceDay}T00:00:00Z`);
    const untilDayMs = Date.parse(`${options.untilDay}T00:00:00Z`);
    if (Number.isNaN(sinceDayMs) || Number.isNaN(untilDayMs) || untilDayMs < sinceDayMs) {
      return null;
    }
    const series = { stepHours, sinceDayMs, length: 0, rows: new Map<string, MutableSeriesRow>() };
    let length = (Math.round((untilDayMs - sinceDayMs) / DAY_MS) + 1) * (24 / stepHours);
    if (options.seriesUntilMs !== undefined) {
      const current = this.#seriesIndex(series, this.#toLocal(options.seriesUntilMs));
      if (current >= 0 && current < length) length = current + 1;
    }
    return length <= MAX_SERIES_SLOTS ? { ...series, length } : null;
  }

  #seriesIndex(series: Pick<SeriesState, "stepHours" | "sinceDayMs">, local: LocalTime): number {
    let dayIndex = this.#seriesDayIndex.get(local.day);
    if (dayIndex === undefined) {
      dayIndex = Math.round((Date.parse(`${local.day}T00:00:00Z`) - series.sinceDayMs) / DAY_MS);
      this.#seriesDayIndex.set(local.day, dayIndex);
    }
    return dayIndex * (24 / series.stepHours) + Math.floor(local.hour / series.stepHours);
  }

  #seriesRowFor(
    series: SeriesState,
    provider: string,
    model: string,
    source: string,
  ): MutableSeriesRow {
    const key = `${provider}\u0000${model}\u0000${source}`;
    if (this.#lastSeriesRow?.key === key) return this.#lastSeriesRow.row;
    let row = series.rows.get(key);
    if (row === undefined) {
      row = {
        totalTokens: Array.from({ length: series.length }, () => 0),
        costUsd: Array.from({ length: series.length }, () => 0),
      };
      series.rows.set(key, row);
    }
    this.#lastSeriesRow = { key, row };
    return row;
  }

  // Aliases use the target's rate, replacing provider-specific rateModel.
  #mapModel(record: UsageRecord): UsageRecord {
    const model = this.#options.modelAliases?.get(record.model);
    if (model === undefined) return record;
    const { rateModel: _rateModel, ...rest } = record;
    return { ...rest, model };
  }

  // Time-ordered records usually reuse the previous bucket; avoid rebuilding its key.
  #bucketFor(
    day: string,
    hourIndex: number,
    provider: string,
    model: string,
    source: string,
  ): MutableBucket {
    const last = this.#lastBucket;
    if (
      last !== null &&
      last.day === day &&
      last.hourIndex === hourIndex &&
      last.provider === provider &&
      last.model === model &&
      last.source === source
    ) {
      return last.bucket;
    }
    const window = this.#hourlyWindow;
    const hourStart =
      window === null ? "" : new Date(window.sinceTimeMs + hourIndex * HOUR_MS).toISOString();
    const key = `${day}\u0000${hourStart}\u0000${provider}\u0000${model}\u0000${source}`;
    let bucket = this.#buckets.get(key);
    if (bucket === undefined) {
      bucket = {
        totals: { ...EMPTY_TOTALS },
        costUsd: 0,
        cacheSavingsUsd: 0,
        categoryCostUsd: null,
        fastCostUsd: 0,
        ultrafastCostUsd: 0,
        speedPremiumUsd: 0,
        records: 0,
        unpricedRecords: 0,
        providerReportedRecords: 0,
        sessions: new Set<string>(),
      };
      this.#buckets.set(key, bucket);
    }
    this.#lastBucket = { day, hourIndex, provider, model, source, bucket };
    return bucket;
  }

  finish(): AggregateResult {
    const buckets: UsageBucket[] = [];
    for (const [key, bucket] of this.#buckets) {
      const [day = "", hourStart = "", provider = "", model = "", sourcePath = ""] =
        key.split("\u0000");
      const category = bucket.categoryCostUsd;
      const fastCostUsd = roundUsd(bucket.fastCostUsd);
      const ultrafastCostUsd = roundUsd(bucket.ultrafastCostUsd);
      const speedPremiumUsd = roundUsd(bucket.speedPremiumUsd);
      buckets.push({
        day: day as UsageDay,
        ...(hourStart === "" ? {} : { hourStart }),
        provider: provider as UsageBucket["provider"],
        model,
        ...(sourcePath === "" ? {} : { sourcePath }),
        totals: { ...bucket.totals },
        costUsd: bucket.costUsd,
        cacheSavingsUsd: bucket.cacheSavingsUsd,
        ...(category === null
          ? {}
          : {
              categoryCostUsd: {
                input: roundUsd(category.input),
                cacheRead: roundUsd(category.cacheRead),
                cacheWrite: roundUsd(category.cacheWrite),
                output: roundUsd(category.output),
              },
            }),
        ...(fastCostUsd === 0 ? {} : { fastCostUsd }),
        ...(ultrafastCostUsd === 0 ? {} : { ultrafastCostUsd }),
        ...(speedPremiumUsd === 0 ? {} : { speedPremiumUsd }),
        costSource: resolveCostSource(bucket),
        records: bucket.records,
        unpricedRecords: bucket.unpricedRecords,
        sessions: bucket.sessions.size,
      });
    }
    buckets.sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        (a.hourStart ?? "").localeCompare(b.hourStart ?? "") ||
        a.provider.localeCompare(b.provider) ||
        a.model.localeCompare(b.model),
    );

    return {
      buckets,
      series: this.#finishSeries(),
      duplicatesDropped: this.#duplicatesDropped,
      outOfWindow: this.#outOfWindow,
    };
  }

  #finishSeries(): UsageSeries | null {
    const series = this.#series;
    if (series === null) return null;
    const rows = [...series.rows].map(([key, row]) => {
      const [provider = "", model = "", sourcePath = ""] = key.split("\u0000");
      return {
        provider: provider as UsageBucket["provider"],
        model,
        ...(sourcePath === "" ? {} : { sourcePath }),
        totalTokens: row.totalTokens,
        costUsd: row.costUsd.map(roundUsd),
      };
    });
    rows.sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
    return { stepHours: series.stepHours, rows };
  }
}

function roundUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function resolveCostSource(bucket: MutableBucket): UsageBucket["costSource"] {
  if (bucket.unpricedRecords === bucket.records) return "unpriced";
  if (bucket.providerReportedRecords === bucket.records) return "providerReported";
  return "modelPriced";
}
