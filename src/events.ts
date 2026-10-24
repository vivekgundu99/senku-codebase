export type { LoadFn, RenderFn } from './events/types';
export { isNoteEditorPendingSave, bindNotesPanel } from './events/notes';
export { initGlobalListeners } from './events/global';

import type { LoadFn, RenderFn } from './events/types';
import { bindNavigation, bindSidebarButtons, bindTopbarButtons } from './events/navigation';
import { bindFileActions } from './events/files';
import { bindHomeActions } from './events/home';
import { bindLogPanel } from './events/logs';
import { bindLaunchpadActions } from './events/launchpads';

// ---------------------------------------------------------------------------
// Main event binding (runs after each render)
// ---------------------------------------------------------------------------

export function bindAll(load: LoadFn, render: RenderFn): void {
  bindNavigation(load, render);
  bindSidebarButtons(load, render);
  bindTopbarButtons(load, render);
  bindFileActions(load);
  bindHomeActions(load, render);
  bindLogPanel(load, render);
  bindLaunchpadActions(load);
}
