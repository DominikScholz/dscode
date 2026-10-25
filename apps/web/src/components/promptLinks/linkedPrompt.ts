import type { ScopedThreadRef } from "@t3tools/contracts";
import type { LinkedPrompt } from "@t3tools/shared/promptLinks";

import {
  type ComposerThreadTarget,
  type DraftId,
  useComposerDraftStore,
} from "~/composerDraftStore";

import { toastManager } from "../ui/toast";

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** Only in-app clicks set history state, so a pasted or external link can never auto-send. */
    promptLinkSource?: ScopedThreadRef;
  }
}

// In memory only, so a reload never sends a linked prompt again.
const draftsToSend = new Set<DraftId>();

export function takeLinkedPromptSend(draftId: DraftId): boolean {
  return draftsToSend.delete(draftId);
}

export function warnAboutHiddenCharacters(prompt: LinkedPrompt): void {
  if (prompt.hiddenCharacters === 0) return;
  toastManager.add({
    type: "warning",
    title: "This prompt had hidden characters, it may be malicious",
    description: `T3 Code removed ${prompt.hiddenCharacters} hidden character${prompt.hiddenCharacters === 1 ? "" : "s"}. Read the prompt before you send it.`,
    timeout: 0,
  });
}

export function placeLinkedPrompt(
  target: ComposerThreadTarget,
  prompt: LinkedPrompt,
  notes: ReadonlyArray<string> = [],
): void {
  warnAboutHiddenCharacters(prompt);
  const place = () => {
    useComposerDraftStore.getState().setPrompt(target, prompt.text);
    toastManager.add({
      type: "info",
      title: "Prompt added from a link",
      description: ["Read it before you send.", ...notes].join(" "),
    });
  };
  const existing = useComposerDraftStore.getState().getComposerDraft(target)?.prompt ?? "";
  if (existing.trim().length === 0 || existing === prompt.text) {
    place();
    return;
  }
  const id = toastManager.add({
    type: "info",
    title: "Linked prompt ready",
    description: "This thread already has a draft. Replace it with the linked prompt?",
    timeout: 0,
    actionProps: {
      children: "Replace draft",
      onClick: () => {
        toastManager.close(id);
        place();
      },
    },
  });
}

/** Hidden characters fall back to placing the prompt, so the reader sees it first. */
export function sendLinkedPrompt(
  draftId: DraftId,
  prompt: LinkedPrompt,
  notes: ReadonlyArray<string> = [],
): void {
  if (prompt.hiddenCharacters > 0) {
    placeLinkedPrompt(draftId, prompt, notes);
    return;
  }
  draftsToSend.add(draftId);
  useComposerDraftStore.getState().setPrompt(draftId, prompt.text);
  if (notes.length > 0) {
    toastManager.add({ type: "info", title: "Linked prompt sent", description: notes.join(" ") });
  }
}
