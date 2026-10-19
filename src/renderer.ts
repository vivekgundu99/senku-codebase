import { state, setState, currentView } from './state';
import {
  sidebarMarkup,
  topbarMarkup,
  filePanelMarkup,
  homePanelMarkup,
  logPanelMarkup,
  launchpadsPanelMarkup,
  dailyNotePanelMarkup,
  notesPanelMarkup,
} from './markup';
import { bindAll, initGlobalListeners, bindDailyNote, bindNotesPanel } from './events';

const appRoot = document.querySelector<HTMLDivElement>('#app')!;

function render(): void {
  let leftPanel = '';
  if (currentView === 'Note') leftPanel = dailyNotePanelMarkup();
  else if (currentView === 'Notes') leftPanel = notesPanelMarkup();
  else if (currentView === 'Log') leftPanel = logPanelMarkup();
  else if (currentView === 'Launchpads') leftPanel = launchpadsPanelMarkup();
  else leftPanel = homePanelMarkup();

  // Notes gets full width; Log gets full width; files panel shows otherwise
  const showFiles = currentView !== 'Log' && currentView !== 'Notes';

  const mainContent = showFiles
    ? `<div class="content-grid">
         ${leftPanel}
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
        <div class="quick-log-bar">
          <input
            id="quick-log-input"
            type="text"
            placeholder="What just happened? Hit Enter to log it."
            autocomplete="off"
            spellcheck="false"
            maxlength="500"
          />
        </div>
      </main>
    </div>`;

  bindAll(load, render);
  bindDailyNote();
  bindNotesPanel(load, render);

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
