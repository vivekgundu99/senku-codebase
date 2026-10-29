import {
  state,
  isGlobalNotesMode,
  setGlobalNotesMode,
  homeCenterMode,
  setHomeCenterMode,
  activeMarkdownFile,
  setActiveMarkdownFile,
  setFilePaneCompact,
  setView,
} from './state';
import { toast } from './toast';

export type LoadFn = (path?: string) => Promise<void>;
export type RenderFn = () => void;

/**
 * Unified Global Refresh (Shortcut 'r', Topbar Refresh button, Command Palette):
 * - If inside Senku Notes: reloads the active markdown file and refreshes the notes folder on disk without kicking the user to Home.
 * - If in Workspace: executes a clean soft restart back to Home Space Overview.
 */
export async function triggerGlobalRefresh(load: LoadFn, render: RenderFn): Promise<void> {
  if (isGlobalNotesMode || homeCenterMode === 'notes') {
    if (activeMarkdownFile) {
      try {
        const fresh = await window.senku.readTextFile(activeMarkdownFile.path);
        activeMarkdownFile.content = fresh;
      } catch {}
    }
    let folder = state.currentPath;
    if (isGlobalNotesMode && (!folder || !folder.toLowerCase().includes('notes'))) {
      folder = await window.senku.getNotesPath();
    }
    if (folder) {
      await load(folder);
    }
    render();
    toast('Note refreshed');
    return;
  }

  setGlobalNotesMode(false);
  setHomeCenterMode('overview');
  setActiveMarkdownFile(null);
  setFilePaneCompact(false);
  setView('Home');
  await load(state.workspace?.masterFolder);
  render();
  toast('Restarted to Home');
}

