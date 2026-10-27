import type { LoadFn, RenderFn } from './types';

let isNoteDirty = false;

export function setNoteEditorDirty(dirty: boolean): void {
  isNoteDirty = dirty;
}

export function isNoteEditorPendingSave(): boolean {
  const fileEditor = document.querySelector<HTMLTextAreaElement>('#notes-file-editor');
  if (fileEditor && document.activeElement === fileEditor) {
    return true;
  }
  return isNoteDirty;
}

/**
 * Legacy notes panel binder (now obsolete as Notes Window is bound in home.ts).
 */
export function bindNotesPanel(_load: LoadFn, _render: RenderFn): void {
  // Obsolete: Notes Window events are actively bound in bindHomeActions
}
