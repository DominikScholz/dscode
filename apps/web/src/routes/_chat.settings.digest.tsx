import { createFileRoute } from "@tanstack/react-router";

import { DailyDigestSettingsPanel } from "../components/settings/DailyDigestSettingsPanel";

export const Route = createFileRoute("/_chat/settings/digest")({
  component: DailyDigestSettingsPanel,
});
