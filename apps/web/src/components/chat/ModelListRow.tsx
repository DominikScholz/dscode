import { type ProviderDriverKind, type ProviderInstanceId } from "@t3tools/contracts";
import { memo } from "react";
import { CheckIcon, StarIcon } from "lucide-react";
import {
  getDisplayModelName,
  getProviderRowLabel,
  getTriggerDisplayModelLabel,
} from "./providerIconUtils";
import { ComboboxItem } from "../ui/combobox";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Kbd } from "../ui/kbd";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { modelPickerModelKey } from "./modelPickerKeys";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

export const ModelListRow = memo(function ModelListRow(props: {
  index: number;
  slug: string;
  name: string;
  shortName?: string | undefined;
  subProvider?: string | undefined;
  instanceId: ProviderInstanceId;
  driverKind: ProviderDriverKind;
  providerDisplayName: string;
  providerAccentColor?: string | undefined;
  acpRegistryAgentId?: string | undefined;
  acpRegistryIconUrl?: string | undefined;
  isFavorite: boolean;
  isSelected: boolean;
  showProvider: boolean;
  preferShortName?: boolean;
  useTriggerLabel?: boolean;
  showNewBadge?: boolean;
  unavailable?: boolean;
  jumpLabel?: string | null;
  disabledReason?: string | null;
  onToggleFavorite: (instanceId: ProviderInstanceId, slug: string) => void;
}) {
  const model = {
    slug: props.slug,
    name: props.name,
    shortName: props.shortName,
    subProvider: props.subProvider,
  };
  const providerLabel = getProviderRowLabel(props.providerDisplayName, props.subProvider);

  const row = (
    <ComboboxItem
      hideIndicator
      index={props.index}
      value={modelPickerModelKey(props.instanceId, props.slug)}
      disabled={Boolean(props.disabledReason)}
      className={cn(
        "group relative w-full !min-w-0 max-w-full cursor-pointer",
        props.disabledReason &&
          "data-disabled:pointer-events-auto data-disabled:cursor-not-allowed",
      )}
    >
      <div className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate">
            {props.useTriggerLabel
              ? getTriggerDisplayModelLabel(model)
              : getDisplayModelName(
                  model,
                  props.preferShortName ? { preferShortName: true } : undefined,
                )}
          </span>
          {props.showNewBadge ? (
            <span
              className="shrink-0 rounded border border-update/35 bg-update/15 px-0.5 py-px text-3xs font-bold uppercase leading-none tracking-wide text-update-foreground"
              aria-label="New model"
            >
              New
            </span>
          ) : null}
          {props.unavailable ? (
            <Badge variant="outline" size="sm">
              Unavailable
            </Badge>
          ) : null}
        </div>
        {props.showProvider && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs leading-snug">
            <ProviderInstanceIcon
              driverKind={props.driverKind}
              displayName={props.providerDisplayName}
              acpRegistryAgentId={props.acpRegistryAgentId}
              acpRegistryIconUrl={props.acpRegistryIconUrl}
              className="size-3"
              iconClassName="size-3"
            />
            <span className="truncate">{providerLabel}</span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {props.isSelected ? <CheckIcon className="size-3.5 text-foreground" aria-hidden /> : null}
        {props.jumpLabel ? <Kbd>{props.jumpLabel}</Kbd> : null}
        <span
          className={cn(
            "flex",
            !props.isFavorite &&
              "opacity-0 transition-opacity group-hover:opacity-100 group-data-highlighted:opacity-100 has-focus-visible:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  className="-mr-1 shrink-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onToggleFavorite(props.instanceId, props.slug);
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                  }}
                  disabled={Boolean(props.disabledReason)}
                  aria-label={props.isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <StarIcon
                    className={cn(
                      "size-3.5 sm:size-3",
                      props.isFavorite && "fill-current text-warning",
                    )}
                  />
                </Button>
              }
            />
            <TooltipPopup side="top" align="center">
              {props.isFavorite ? "Remove from favorites" : "Add to favorites"}
            </TooltipPopup>
          </Tooltip>
        </span>
      </div>
    </ComboboxItem>
  );

  if (!props.disabledReason) {
    return row;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={row} />
      <TooltipPopup side="left" align="center">
        {props.disabledReason}
      </TooltipPopup>
    </Tooltip>
  );
});
