import { state, setState, setView } from './state';
import { setupScreenMarkup, sidebarMarkup, topbarMarkup, filePanelMarkup, taskPanelMarkup } from './markup';
import {
  bindAll,
  bindSetupScreen,
  initGlobalListeners,
  addResourceButtons,
  addCompleteSelectedBar,
  addCompletedFilters,
  addCreatorNote,
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
    // First-run / no workspace: show setup screen
    appRoot.innerHTML = setupScreenMarkup();
    bindSetupScreen(load);
    return;
  }

  appRoot.innerHTML = `
    <div class="app-shell">
      ${sidebarMarkup()}
      <main class="main-area">
        ${topbarMarkup()}
        <div class="content-grid">
          ${taskPanelMarkup()}
          ${filePanelMarkup()}
        </div>
      </main>
    </div>`;

  // Post-render DOM additions
  addCompletedFilters(render);
  addCompleteSelectedBar();
  addResourceButtons();
  addCreatorNote();

  // Bind all interactive events
  bindAll(load, render);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function load(pathToShow?: string): Promise<void> {
  const snapshot = await window.senku.getSnapshot(pathToShow);
  setState(snapshot);
  render();
}

// Boot — wire global listeners exactly once, then load initial state
initGlobalListeners(load, render);
void load();
