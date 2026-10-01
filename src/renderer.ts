import { state, setState, currentView } from './state';
import {
  setupScreenMarkup,
  sidebarMarkup,
  topbarMarkup,
  errorBannerMarkup,
  filePanelMarkup,
  taskPanelMarkup,
  dailyNotePanelMarkup,
} from './markup';
import {
  bindAll,
  bindSetupScreen,
  initGlobalListeners,
  addResourceButtons,
  addCompleteSelectedBar,
  addCompletedFilters,
  bindDailyNote,
} from './events';

// ---------------------------------------------------------------------------
// Root element
// ---------------------------------------------------------------------------

const appRoot = document.querySelector<HTMLDivElement>('#app')!;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  if (!state?.workspace) {
    appRoot.innerHTML = setupScreenMarkup();
    bindSetupScreen(load);
    return;
  }

  // Note view replaces the task panel with the daily note editor
  const mainContent = currentView === 'Note'
    ? `<div class="content-grid">
         ${dailyNotePanelMarkup()}
         <div class="right-column">
           ${filePanelMarkup()}
         </div>
       </div>`
    : `${errorBannerMarkup()}
       <div class="content-grid">
         ${taskPanelMarkup()}
         <div class="right-column">
           ${filePanelMarkup()}
         </div>
       </div>`;

  appRoot.innerHTML = `
    <div class="app-shell">
      ${sidebarMarkup()}
      <main class="main-area">
        ${topbarMarkup()}
        ${mainContent}
      </main>
    </div>`;

  // Post-render additions
  addCompletedFilters(render);
  addCompleteSelectedBar();
  addResourceButtons();

  // Bind per-render events
  bindAll(load, render);

  // Daily note autosave (re-bound each render so it always has the fresh textarea)
  bindDailyNote();
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function load(pathToShow?: string): Promise<void> {
  const snapshot = await window.senku.getSnapshot(pathToShow);
  setState(snapshot);
  render();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

// Wire global (document-level) listeners exactly once
initGlobalListeners(load, render);

// Listen for tasks:changed pushed from main process (after quick-add)
window.senku.onTasksChanged(() => void load(state?.currentPath));

// Initial load
void load();
