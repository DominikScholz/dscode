import { memo } from "react";

import { useT3ProjectFileScripts } from "../../hooks/useT3ProjectFileScripts";
import BaseGitActionsControl from "../GitActionsControl";
import ProjectScriptsControl from "../ProjectScriptsControl";
import { OpenInPicker } from "./OpenInPicker";
import type { ThreadDetailsPanelProps } from "./ThreadDetailsPanel";

const GitActionsControl = memo(BaseGitActionsControl);

/**
 * The details card's actions as one compact row, for the top bar and composer
 * dock arrangements. Labels appear once the row's container is wide enough.
 */
export function ThreadActionsToolbar(props: ThreadDetailsPanelProps) {
  const fileScripts = useT3ProjectFileScripts(
    props.environmentId,
    props.activeProjectScripts ? props.gitCwd : null,
  );
  return (
    <div
      data-thread-actions
      className="@container/header-actions flex min-w-0 flex-1 items-center justify-end gap-1.5"
    >
      {props.showOpenInPicker ? (
        <OpenInPicker
          keybindings={props.keybindings}
          environmentId={props.environmentId}
          availableEditors={props.availableEditors}
          openInCwd={props.gitCwd}
        />
      ) : null}
      {props.activeProjectScripts ? (
        <ProjectScriptsControl
          environmentId={props.environmentId}
          scripts={props.activeProjectScripts}
          fileScripts={fileScripts}
          preferredScriptId={props.preferredScriptId}
          onRunScript={props.onRunProjectScript}
          onAddScript={props.onAddProjectScript}
          onUpdateScript={props.onUpdateProjectScript}
          onDeleteScript={props.onDeleteProjectScript}
        />
      ) : null}
      {props.gitCwd && props.activeProjectName ? (
        <GitActionsControl
          gitCwd={props.gitCwd}
          activeThreadRef={{ environmentId: props.environmentId, threadId: props.threadId }}
          {...(props.draftId ? { draftId: props.draftId } : {})}
          {...(props.onOpenChanges ? { onOpenChanges: props.onOpenChanges } : {})}
        />
      ) : null}
    </div>
  );
}
