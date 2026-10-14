import { state, setState, currentView } from './state';
import {
  sidebarMarkup,
  topbarMarkup,
  errorBannerMarkup,
  filePanelMarkup,
  taskPanelMarkup,
  homePanelMarkup,
  dailyNotePanelMarkup,
} from './markup';
import {
  bindAll,
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

  // Note view replaces the task panel with the daily note editor
  const mainContent = currentView === 'Note'
    ? `<div class="content-grid">
         ${dailyNotePanelMarkup()}
         <div class="right-column">
           ${filePanelMarkup()}
         </div>
       </div>`
    : currentView === 'Home'
    ? `<div class="content-grid">
         ${homePanelMarkup()}
         <div class="right-column">${filePanelMarkup()}</div>
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

  // Keep active space visible and centered in the sidebar list
  const scrollToActiveSpace = () => {
    const activeSpace = appRoot.querySelector<HTMLElement>('.space-row.current');
    const spaceList = appRoot.querySelector<HTMLElement>('.space-list');
    if (activeSpace && spaceList) {
      const rowTop = activeSpace.offsetTop;
      const rowHeight = activeSpace.offsetHeight;
      const listHeight = spaceList.clientHeight;
      if (listHeight > 0) {
        spaceList.scrollTop = Math.max(0, rowTop - listHeight / 2 + rowHeight / 2);
      } else {
        activeSpace.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    }
  };
  requestAnimationFrame(() => {
    scrollToActiveSpace();
    setTimeout(scrollToActiveSpace, 60);
  });
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

let loadSeq = 0;

async function load(pathToShow?: string): Promise<void> {
  const seq = ++loadSeq;
  try {
    const snapshot = await window.senku.getSnapshot(pathToShow);
    // Two quick requests can finish out of order. Only the newest one may draw.
    if (seq !== loadSeq) return;
    setState(snapshot);
    render();
  } catch (error) {
    if (seq !== loadSeq) return;
    console.error('Senku could not load:', error);
    // Keep whatever is on screen. Only show the error screen if nothing was drawn yet.
    if (state?.workspace || state?.settings) return;
    appRoot.innerHTML = `
      <main class="setup-shell">
        <h1>Something went wrong.</h1>
        <p class="setup-copy">Senku could not read its data. Your files and tasks are safe.</p>
        <button class="primary-button" id="retry-load" style="max-width:200px">Try again <span>→</span></button>
      </main>`;
    appRoot.querySelector('#retry-load')?.addEventListener('click', () => void load(pathToShow));
  }
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
