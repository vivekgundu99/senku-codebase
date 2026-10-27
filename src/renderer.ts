import {
  state,
  setState,
  currentView,
  setAllLog,
  isPathAvailabilityCacheStale,
  setCachedPathAvailability,
  isFilePaneCompact,
} from './state';
import {
  sidebarMarkup,
  topbarMarkup,
  filePanelMarkup,
  overviewPanelMarkup,
  homePanelMarkup,
  logPanelMarkup,
  launchpadsPanelMarkup,
  notesWindowMarkup,
} from './markup';
import { bindAll, initGlobalListeners, isNoteEditorPendingSave } from './events';

const appRoot = document.querySelector<HTMLDivElement>('#app')!;

function render(): void {
  // Capture focus, selection, value, and scroll before DOM wipe
  const activeEl = document.activeElement;
  const activeId = activeEl instanceof HTMLElement && activeEl.id ? activeEl.id : null;
  let selStart: number | null = null;
  let selEnd: number | null = null;
  let activeVal: string | null = null;
  if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
    selStart = activeEl.selectionStart;
    selEnd = activeEl.selectionEnd;
    activeVal = activeEl.value;
  }
  const notesScroll = appRoot.querySelector<HTMLElement>('#notes-editor')?.scrollTop;
  const fileListScroll = appRoot.querySelector<HTMLElement>('.file-list')?.scrollTop;
  const logEntriesScroll = appRoot.querySelector<HTMLElement>('.log-entries')?.scrollTop;

  let leftPanel = '';
  if (currentView === 'Notes') leftPanel = notesWindowMarkup();
  else if (currentView === 'Log') leftPanel = logPanelMarkup('space');
  else if (currentView === 'AllLog') leftPanel = logPanelMarkup('all');
  else if (currentView === 'Launchpads') leftPanel = launchpadsPanelMarkup();
  else leftPanel = overviewPanelMarkup();

  // The files panel shows for Home, Overview, and Notes.
  const showFiles = currentView === 'Home' || currentView === 'Overview' || currentView === 'Notes';

  const mainContent = showFiles
    ? `<div class="content-grid ${isFilePaneCompact ? 'compact-files' : ''}">
         <div class="main-left">${leftPanel}</div>
         <div class="right-column">${filePanelMarkup()}</div>
       </div>`
    : `<div class="content-grid content-grid-full">
         ${leftPanel}
       </div>`;

  appRoot.innerHTML = `
    <div class="app-shell">
      ${sidebarMarkup()}
      <main class="main-area">
        ${topbarMarkup()}
        ${mainContent}
      </main>
    </div>`;

  bindAll(load, render);

  // Check existence of local paths in Launchpads panel (cached for 10 s)
  if (currentView === 'Launchpads' && isPathAvailabilityCacheStale()) {
    const localPaths: string[] = [];
    for (const lp of (state.launchpads ?? [])) {
      for (const p of lp.paths || []) {
        const trimmed = p.trim();
        if (trimmed && !/^https?:\/\//i.test(trimmed)) {
          localPaths.push(trimmed);
        }
      }
    }
    if (localPaths.length > 0) {
      void window.senku.checkPathsExist(localPaths).then((results) => {
        setCachedPathAvailability(results);
        if (currentView === 'Launchpads') {
          const chips = appRoot.querySelectorAll<HTMLElement>('.lp-path-chip[data-open-item]');
          chips.forEach((chip) => {
            const item = chip.dataset.openItem;
            if (item && results[item] === 'missing') {
              chip.classList.add('missing');
              chip.title = 'Missing';
            }
          });
        }
      });
    }
  }

  // Restore scroll
  if (notesScroll !== undefined) {
    const el = appRoot.querySelector<HTMLElement>('#notes-editor');
    if (el) el.scrollTop = notesScroll;
  }
  if (fileListScroll !== undefined) {
    const el = appRoot.querySelector<HTMLElement>('.file-list');
    if (el) el.scrollTop = fileListScroll;
  }
  if (logEntriesScroll !== undefined) {
    const el = appRoot.querySelector<HTMLElement>('.log-entries');
    if (el) el.scrollTop = logEntriesScroll;
  }

  // Restore focus, value, and selection
  if (activeId) {
    const restored = appRoot.querySelector<HTMLElement>(`#${activeId}`);
    if (restored) {
      if ((restored instanceof HTMLInputElement || restored instanceof HTMLTextAreaElement) && activeVal !== null) {
        restored.value = activeVal;
        if (selStart !== null && selEnd !== null) {
          try {
            restored.setSelectionRange(selStart, selEnd);
          } catch {}
        }
      }
      restored.focus();
    }
  }

  // Keep active space visible in sidebar
  requestAnimationFrame(() => {
    const activeSpace = appRoot.querySelector<HTMLElement>('.space-row.current');
    const spaceList = appRoot.querySelector<HTMLElement>('.space-list');
    if (activeSpace && spaceList) {
      spaceList.scrollTop = Math.max(0, activeSpace.offsetTop - spaceList.clientHeight / 2 + activeSpace.offsetHeight / 2);
    }
  });
}

let loadSeq = 0;

async function load(pathToShow?: string): Promise<void> {
  const seq = ++loadSeq;
  try {
    const snapshot = await window.senku.getSnapshot(pathToShow);
    if (seq !== loadSeq) return;
    setState(snapshot);
    if (currentView === 'AllLog') {
      const all = await window.senku.listAllLogs();
      if (seq !== loadSeq) return;
      setAllLog(all);
    }
    render();
  } catch (error) {
    if (seq !== loadSeq) return;
    console.error('Senku could not load:', error);
    if (state?.workspace || state?.settings) return;
    appRoot.innerHTML = `
      <main class="setup-shell">
        <h1>Something went wrong.</h1>
        <p class="setup-copy">Senku could not read its data. Your files are safe.</p>
        <button class="primary-button" id="retry-load" style="max-width:200px">Try again <span>→</span></button>
      </main>`;
    appRoot.querySelector('#retry-load')?.addEventListener('click', () => void load(pathToShow));
  }
}

initGlobalListeners(load, render);
window.senku.onOpenQuickNote(() => {
  void window.senku.showOverlay();
});
window.senku.onSnapshotUpdated(async () => {
  if (currentView === 'Notes' && document.activeElement?.id === 'notes-editor' && isNoteEditorPendingSave()) {
    try {
      const snapshot = await window.senku.getSnapshot(state.currentPath);
      setState(snapshot);
    } catch (err) {
      console.error(err);
    }
    return;
  }
  void load(state.currentPath);
});
void load();
