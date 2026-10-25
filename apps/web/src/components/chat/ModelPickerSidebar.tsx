import { Toolbar } from "@base-ui/react/toolbar";
import { type ProviderInstanceId } from "@t3tools/contracts";
import { memo } from "react";
import { SparklesIcon, StarIcon } from "lucide-react";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import {
  isProviderInstancePickerReady,
  shouldShowInstanceBadge,
  type ProviderInstanceEntry,
} from "../../providerInstances";

function describeUnavailableInstance(entry: ProviderInstanceEntry): string {
  const label = entry.displayName;
  if (!entry.enabled || entry.status === "disabled") {
    return `${label}: Disabled in settings.`;
  }
  if (entry.status === "ready" && entry.isAvailable) {
    return label;
  }
  const kind =
    entry.status === "error" ? "Unavailable" : entry.status === "warning" ? "Limited" : "Not ready";
  const msg = entry.snapshot.message?.trim();
  return msg ? `${label}: ${kind}. ${msg}` : `${label}: ${kind}.`;
}

const NEW_BADGE_CLASS =
  "pointer-events-none absolute -right-0.5 top-0.5 z-10 flex size-3.5 items-center justify-center rounded-full text-update-foreground";

const PICKER_TOOLTIP_SIDE = "left" as const;
const PICKER_TOOLTIP_SIDE_OFFSET = 8;

const railButtonClassName = (isSelected: boolean, isDisabled = false) =>
  cn(
    "relative isolate flex aspect-square w-full cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none squircle transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    isSelected
      ? "text-foreground popup-row-raised"
      : "hover:bg-(--popup-row-selected) hover:text-foreground",
    isDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
  );

export const ModelPickerSidebar = memo(function ModelPickerSidebar(props: {
  selectedInstanceId: ProviderInstanceId | "favorites";
  onSelectInstance: (instanceId: ProviderInstanceId | "favorites") => void;
  onFocusSearch: () => void;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  showFavorites?: boolean;
  disabledInstanceIds?: ReadonlySet<ProviderInstanceId>;
  selectableUnavailableInstanceIds?: ReadonlySet<ProviderInstanceId>;
  getDisabledInstanceTooltip?: (entry: ProviderInstanceEntry) => string;
  newBadgeInstanceIds?: ReadonlySet<ProviderInstanceId>;
}) {
  const showFavorites = props.showFavorites ?? true;
  const favoritesSelected = props.selectedInstanceId === "favorites";

  return (
    <Toolbar.Root
      className="w-11 shrink-0 overflow-hidden"
      data-model-picker-sidebar="true"
      aria-label="Providers"
      orientation="vertical"
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          props.onFocusSearch();
          return;
        }
      }}
    >
      <div className="h-full overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-h-full flex-col gap-1 p-1">
          {showFavorites ? (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Toolbar.Button
                      className={railButtonClassName(favoritesSelected)}
                      onClick={() => props.onSelectInstance("favorites")}
                      type="button"
                      aria-label="Favorites"
                      aria-pressed={favoritesSelected}
                    >
                      <StarIcon
                        className={cn("size-4.5 shrink-0", favoritesSelected && "fill-current")}
                        aria-hidden
                      />
                    </Toolbar.Button>
                  }
                />
                <TooltipPopup
                  side={PICKER_TOOLTIP_SIDE}
                  sideOffset={PICKER_TOOLTIP_SIDE_OFFSET}
                  align="center"
                >
                  Favorites
                </TooltipPopup>
              </Tooltip>
              <div className="mx-1.5 h-px shrink-0 bg-border" aria-hidden="true" />
            </>
          ) : null}

          {props.instanceEntries.map((entry) => {
            const isUnavailable = !isProviderInstancePickerReady(entry);
            const isContextDisabled = props.disabledInstanceIds?.has(entry.instanceId) ?? false;
            const unavailableSelectionIsReachable =
              props.selectableUnavailableInstanceIds?.has(entry.instanceId) ?? false;
            const isDisabled =
              (isUnavailable && !unavailableSelectionIsReachable) || isContextDisabled;
            const isSelected = props.selectedInstanceId === entry.instanceId;
            const showNewBadge = props.newBadgeInstanceIds?.has(entry.instanceId) ?? false;
            const showInstanceBadge = shouldShowInstanceBadge(entry, props.instanceEntries);

            const tooltip = isUnavailable
              ? describeUnavailableInstance(entry)
              : isContextDisabled
                ? (props.getDisabledInstanceTooltip?.(entry) ?? entry.displayName)
                : showNewBadge
                  ? `${entry.displayName} (New)`
                  : entry.displayName;

            const button = (
              <Toolbar.Button
                className={railButtonClassName(isSelected, isDisabled)}
                data-provider-accent-color={entry.accentColor}
                onClick={() => !isDisabled && props.onSelectInstance(entry.instanceId)}
                disabled={isDisabled}
                focusableWhenDisabled={!isDisabled}
                aria-pressed={isSelected}
                type="button"
                aria-label={
                  isUnavailable || isContextDisabled
                    ? tooltip
                    : showNewBadge
                      ? `${entry.displayName}, new`
                      : entry.displayName
                }
              >
                <ProviderInstanceIcon
                  driverKind={entry.driverKind}
                  displayName={entry.displayName}
                  accentColor={entry.accentColor}
                  acpRegistryAgentId={entry.acpRegistryAgentId}
                  acpRegistryIconUrl={entry.acpRegistryIconUrl}
                  showBadge={showInstanceBadge}
                  className="size-6 z-30"
                  iconClassName="size-5"
                  indicatorBackground={
                    isSelected ? "var(--popup-row-raised)" : "var(--popup-surface)"
                  }
                  {...(entry.accentColor ? { badgeClassName: "h-3 min-w-3 px-0.5 text-5xs" } : {})}
                />
                {showNewBadge ? (
                  <span className={NEW_BADGE_CLASS} aria-hidden>
                    <SparklesIcon className="size-2" />
                  </span>
                ) : null}
              </Toolbar.Button>
            );

            return (
              <Tooltip key={entry.instanceId}>
                <TooltipTrigger
                  render={isDisabled ? <span className="block w-full">{button}</span> : button}
                />
                <TooltipPopup
                  side={PICKER_TOOLTIP_SIDE}
                  sideOffset={PICKER_TOOLTIP_SIDE_OFFSET}
                  align="center"
                >
                  {tooltip}
                </TooltipPopup>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </Toolbar.Root>
  );
});
