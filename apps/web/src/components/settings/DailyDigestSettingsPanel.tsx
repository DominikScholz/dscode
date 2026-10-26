import { useAtomValue } from "@effect/atom-react";
import { DEFAULT_DAILY_DIGEST_INSTRUCTIONS, type EnvironmentId } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { createModelSelection } from "@t3tools/shared/model";
import { useRef, useState } from "react";

import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionState,
  selectsPlanAgent,
} from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { useEnvironmentProviders } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useSettingsScope } from "./SettingsScopeContext";
import { useScopedModelDisabledReason } from "./useScopedModelAvailability";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

const AWAY_HOUR_OPTIONS = [2, 4, 6, 8, 10, 12, 16, 24] as const;

export function DailyDigestSettingsPanel() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const { environment } = useSettingsScope();
  const environmentId = environment?.environmentId ?? null;
  const providersByEnvironment = useEnvironmentProviders();
  const providers =
    (environmentId === null ? undefined : providersByEnvironment.get(environmentId)) ??
    EMPTY_SERVER_PROVIDERS;
  const instanceEntries = sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings, null),
  );
  const selection = resolveAppModelSelectionState(
    {
      ...settings,
      textGenerationModelSelection:
        settings.dailyDigestModelSelection ??
        settings.defaultModelSelection ??
        settings.textGenerationModelSelection,
    },
    providers,
  );
  const modelOptionsByInstance = getCustomModelOptionsByInstance(
    settings,
    providers,
    selection.instanceId,
    selection.model,
  );
  const modelDisabledReason = useScopedModelDisabledReason(settings, instanceEntries);
  const instanceEntry = instanceEntries.find((entry) => entry.instanceId === selection.instanceId);
  const instructionsEdited = useRef(false);

  return (
    <SettingsPageContainer>
      <SettingsSection id="daily-digest" title="Daily digest">
        <SettingsRow
          serverScoped
          settingKeys={["dailyDigestEnabled"]}
          {...searchableSetting("daily-digest")}
          description="When no device has been connected to this environment for a while, an agent writes a digest for each project that changed since its last one: a full-width page with what happened and next steps you start with a click. Turn it on for the machine that stays online."
          control={
            <Switch
              checked={settings.dailyDigestEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ dailyDigestEnabled: Boolean(checked) })
              }
              aria-label="Daily digest"
            />
          }
        />
        <SettingsRow
          serverScoped
          settingKeys={["dailyDigestAwayHours"]}
          {...searchableSetting("daily-digest-away-hours")}
          description="How long every device must stay disconnected before digests start. Connecting again restarts the wait."
          resetAction={
            settings.dailyDigestAwayHours !== DEFAULT_UNIFIED_SETTINGS.dailyDigestAwayHours ? (
              <SettingResetButton
                label="daily digest delay"
                onClick={() =>
                  updateSettings({
                    dailyDigestAwayHours: DEFAULT_UNIFIED_SETTINGS.dailyDigestAwayHours,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.dailyDigestAwayHours}
              onValueChange={(value) => {
                if (typeof value === "number") updateSettings({ dailyDigestAwayHours: value });
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Daily digest delay">
                <SelectValue>{(value: number) => `After ${value} hours`}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {AWAY_HOUR_OPTIONS.map((hours) => (
                  <SelectItem key={hours} hideIndicator value={hours}>
                    After {hours} hours
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          serverScoped
          settingKeys={["dailyDigestModelSelection"]}
          {...searchableSetting("daily-digest-model")}
          description="Model that reads the day's threads and commits to write each digest. A stronger model helps. Unset, digests use the default model for new threads, or the text generation model without one."
          resetAction={
            settings.dailyDigestModelSelection !== null ? (
              <SettingResetButton
                label="daily digest model"
                onClick={() => updateSettings({ dailyDigestModelSelection: null })}
              />
            ) : null
          }
          control={
            environmentId === null ? (
              <span className="text-sm text-muted-foreground">
                Connect an environment to choose its digest model.
              </span>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ProviderModelPicker
                  environmentId={environmentId}
                  activeInstanceId={selection.instanceId}
                  model={selection.model}
                  lockedProvider={null}
                  instanceEntries={instanceEntries}
                  modelOptionsByInstance={modelOptionsByInstance}
                  triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                  triggerAriaLabel="Daily digest model"
                  getModelDisabledReason={modelDisabledReason}
                  onInstanceModelChange={(instanceId, model) => {
                    const reason = modelDisabledReason(instanceId, model);
                    if (reason) {
                      toastManager.add({
                        type: "error",
                        title: "Digest model not saved",
                        description: reason,
                      });
                      return;
                    }
                    updateSettings({
                      dailyDigestModelSelection: createModelSelection(instanceId, model),
                    });
                  }}
                />
                {instanceEntry ? (
                  <TraitsPicker
                    provider={instanceEntry.driverKind}
                    models={instanceEntry.models}
                    model={selection.model}
                    modelOptions={selection.options ?? []}
                    allowPromptInjectedEffort={false}
                    planModeEnabled={
                      settings.planModeEnabled || selectsPlanAgent(selection.options)
                    }
                    triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                    onModelOptionsChange={(options) =>
                      updateSettings({
                        dailyDigestModelSelection: createModelSelection(
                          selection.instanceId,
                          selection.model,
                          options,
                        ),
                      })
                    }
                  />
                ) : null}
              </div>
            )
          }
        />
        <SettingsRow
          serverScoped
          settingKeys={["dailyDigestInstructions"]}
          {...searchableSetting("daily-digest-instructions")}
          description="Describe the digest you want: what comes first, how to lay out the page, which suggestions help you most. T3 Code always tells the agent how to publish the page and write prompt links."
          resetAction={
            settings.dailyDigestInstructions !== "" ? (
              <SettingResetButton
                label="daily digest instructions"
                onClick={() => updateSettings({ dailyDigestInstructions: "" })}
              />
            ) : null
          }
        >
          <div className="mt-3 max-w-2xl pb-3.5">
            <Textarea
              key={settings.dailyDigestInstructions}
              aria-label="Daily digest instructions"
              rows={5}
              defaultValue={settings.dailyDigestInstructions}
              placeholder={DEFAULT_DAILY_DIGEST_INSTRUCTIONS}
              onChange={() => {
                instructionsEdited.current = true;
              }}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (instructionsEdited.current && value !== settings.dailyDigestInstructions) {
                  updateSettings({ dailyDigestInstructions: value });
                }
                instructionsEdited.current = false;
              }}
            />
          </div>
        </SettingsRow>
        {environmentId === null ? null : <RunDigestNowRow environmentId={environmentId} />}
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function RunDigestNowRow(props: { environmentId: EnvironmentId }) {
  const canOperate = useAtomValue(
    serverEnvironment.runDailyDigestNow.permissionAtom(props.environmentId),
  );
  const runNow = useAtomCommand(serverEnvironment.runDailyDigestNow, {
    label: "daily digest run now",
  });
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const result = await runNow({ environmentId: props.environmentId, input: {} });
    setBusy(false);
    if (result._tag === "Failure") {
      if (isAtomCommandInterrupted(result)) return;
      toastManager.add({
        type: "error",
        title: "Could not start digests",
        description: String(squashAtomCommandFailure(result)),
      });
      return;
    }
    const count = result.value.threadIds.length;
    toastManager.add(
      count === 0
        ? {
            type: "info",
            title: "Nothing to digest",
            description: "No project changed since its last digest.",
          }
        : { type: "success", title: count === 1 ? "Started 1 digest" : `Started ${count} digests` },
    );
  };
  return (
    <SettingsRow
      title="Write digests now"
      description="Start digests for every project that changed since its last one, without waiting."
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={!canOperate || busy}
          onClick={() => void run()}
        >
          Run now
        </Button>
      }
    />
  );
}
