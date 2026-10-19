import { state, setState, currentView } from './state';
import {
  sidebarMarkup,
  topbarMarkup,
  filePanelMarkup,
  homePanelMarkup,
  logPanelMarkup,
  launchpadsPanelMarkup,
  notesPanelMarkup,
} from './markup';
import { bindAll, initGlobalListeners, bindNotesPanel } from './events';

const appRoot = document.querySelector<HTMLDivElement>('#app')!;

function render(): void {
  let leftPanel = '';
  if (currentView === 'Notes') leftPanel = notesPanelMarkup();
  else if (currentView === 'Log') leftPanel = logPanelMarkup();
  else if (currentView === 'Launchpads') leftPanel = launchpadsPanelMarkup();
  else leftPanel = homePanelMarkup();

  // Notes and Log get full width; Home and Launchpads show the File Manager on the right
  const showFiles = currentView !== 'Log' && currentView !== 'Notes';

  const mainContent = showFiles
    ? `<div class="content-grid">
         <div class="tasks-panel">${leftPanel}</div>
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
  if (currentView === 'Notes') bindNotesPanel(load, render);

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
void load();
