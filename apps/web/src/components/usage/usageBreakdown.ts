import type { UsageTokenTotals } from "@t3tools/contracts";
import {
  isModelCostUnknown,
  type CategoryCost,
  type ModelTotals,
  type SpeedCost,
} from "@t3tools/shared/usageMerge";

import type { ShareSegment } from "./UsageShareBar";

export function sortModelsByTokens(models: readonly ModelTotals[]) {
  return models.toSorted(
    (left, right) => right.totalTokens - left.totalTokens || right.costUsd - left.costUsd,
  );
}

/** Unknown cost yields null cost share; unpriced models still have token shares. */
export function modelShare(model: ModelTotals, metric: "cost" | "tokens"): number | null {
  if (metric === "tokens") return model.tokenShare;
  return isModelCostUnknown(model) ? null : model.costShare;
}

/** Returns null without input; cache writes count as misses because input was fully processed. */
export function cacheHitRate({ tokens }: ModelTotals): number | null {
  const input = tokens.uncachedInputTokens + tokens.cachedInputTokens + tokens.cacheCreationTokens;
  return input === 0 ? null : tokens.cachedInputTokens / input;
}

/** Effective USD per million priced tokens, or `null` when none were priced. */
export function costPerMillionTokens(model: ModelTotals): number | null {
  const pricedTokens = model.totalTokens - model.unpricedTokens;
  return pricedTokens <= 0 || isModelCostUnknown(model)
    ? null
    : (model.costUsd / pricedTokens) * 1_000_000;
}

export function costTypeSegments(cost: CategoryCost): readonly ShareSegment[] {
  return [
    { label: "Input", value: cost.input },
    { label: "Cache read", value: cost.cacheRead },
    { label: "Cache write", value: cost.cacheWrite },
    { label: "Output", value: cost.output },
    { label: "Other", value: cost.unsplit >= 0.005 ? cost.unsplit : 0 },
  ];
}

export function tokenTypeSegments(
  tokens: Omit<UsageTokenTotals, "reasoningTokens">,
): readonly ShareSegment[] {
  return [
    { label: "Input", value: tokens.uncachedInputTokens },
    { label: "Cache read", value: tokens.cachedInputTokens },
    { label: "Cache write", value: tokens.cacheCreationTokens },
    { label: "Output", value: tokens.outputTokens },
  ];
}

export function speedCostSegments(cost: SpeedCost): readonly ShareSegment[] {
  return [
    { label: "Standard", value: cost.standard },
    { label: "Fast", value: cost.fast },
    { label: "Ultrafast", value: cost.ultrafast },
  ];
}
