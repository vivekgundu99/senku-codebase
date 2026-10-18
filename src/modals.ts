import { setState, state } from './state';
import { checkMainFolder, escapeHtml, DEFAULT_GREETING } from './utils';
import pkg from '../package.json';

// ---------------------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------------------

function createOverlay(innerHtml: string): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = innerHtml;
  document.body.append(overlay);

  // Close on X button
  overlay.querySelector('#close-modal')?.addEventListener('click', () => overlay.remove());

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Prevent double-submits
  overlay.addEventListener('submit', (e) => {
    const form = e.target as HTMLElement;
    if (form.dataset.busy) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    form.dataset.busy = '1';
    setTimeout(() => delete form.dataset.busy, 800);
  }, true);

  // Close on Escape
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') overlay.remove(); };
  document.addEventListener('keydown', onKey);
  const removeOverlay = overlay.remove.bind(overlay);
  overlay.remove = () => {
    document.removeEventListener('keydown', onKey);
    removeOverlay();
  };

  return overlay;
}

function folderAllowed(overlay: HTMLElement, selector: string, folder: string): boolean {
  const check = checkMainFolder(folder);
  if (check.level === 'block') {
    showFormError(overlay, selector, check.message);
    return false;
  }
  return check.level === 'ok' || confirm(check.message);
}

function showFormError(overlay: HTMLElement, selector: string, message: string): void {
  const el = overlay.querySelector(selector);
  if (el) el.textContent = message;
}

// ---------------------------------------------------------------------------
// Profile & Settings modal
// ---------------------------------------------------------------------------

export function openProfileModal(render: () => void): void {
  if (!state) return;

  const userInitial = state.settings.userName ? state.settings.userName.charAt(0).toUpperCase() : 'S';

  const overlay = createOverlay(`
    <form class="modal-card profile-modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>

      <div class="profile-modal-header">
        <div class="profile-modal-avatar">
          <span>${escapeHtml(userInitial)}</span>
        </div>
        <div>
          <span class="section-kicker">SETTINGS &amp; IDENTITY</span>
          <h2>${escapeHtml(state.settings.userName || 'Profile')}</h2>
        </div>
      </div>

      <div class="profile-modal-body">
        <label>Your display name
          <input name="userName" id="profile-user-name" required value="${escapeHtml(state.settings.userName)}" placeholder="e.g. Vivek" autocomplete="off" />
        </label>

        <label>Daily morning greeting
          <input name="greeting" id="profile-greeting" value="${escapeHtml(state.settings.greeting || DEFAULT_GREETING)}" placeholder="${escapeHtml(DEFAULT_GREETING)}" autocomplete="off" />
        </label>

        <div class="profile-chips-line">
          <button type="button" class="preset-chip" data-set-greeting="Good morning, {name}.">Good morning</button>
          <button type="button" class="preset-chip" data-set-greeting="Deep focus mode, {name}.">Deep focus</button>
          <button type="button" class="preset-chip" data-set-greeting="Let's build, {name}.">Let's build</button>
          <button type="button" class="preset-chip" data-set-greeting="One tiny step at a time.">One step</button>
        </div>

        <div class="profile-toggle-row">
          <div class="toggle-text">
            <strong>Launch on Windows startup</strong>
            <small>Open automatically so your files and focus are ready when you log in.</small>
          </div>
          <button type="button" id="app-startup-toggle" class="toggle ${state.settings.launchAtStartup ? 'on' : ''}" aria-label="Toggle launch at startup"><span></span></button>
        </div>

        <button id="user-guide" class="profile-guide-btn" type="button">
          <span>📖 Senku User Guide &amp; Shortcuts</span>
          <span>↗</span>
        </button>
      </div>

      <p class="form-error" id="profile-error"></p>

      <div class="profile-modal-footer">
        <button class="primary-button" type="submit">Save Changes <span>→</span></button>
        <div class="profile-version-tag">Senku v${pkg.version} · Made by a Navodayan</div>
      </div>
    </form>`);

  // Greeting presets
  overlay.querySelectorAll<HTMLElement>('[data-set-greeting]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = overlay.querySelector<HTMLInputElement>('#profile-greeting');
      if (input && btn.dataset.setGreeting) {
        input.value = btn.dataset.setGreeting;
        input.focus();
      }
    });
  });

  // Windows startup toggle
  const toggle = overlay.querySelector('#app-startup-toggle');
  toggle?.addEventListener('click', () => toggle?.classList.toggle('on'));

  // User guide
  overlay.querySelector('#user-guide')?.addEventListener('click', async () => {
    const result = await window.senku.openUserGuide();
    if (!result.ok) alert(result.error || 'User guide not found.');
  });

  // Form submit
  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const name = String(data.get('userName') ?? '').trim();
    if (!name) {
      showFormError(overlay, '#profile-error', 'Enter a display name.');
      return;
    }
    const greeting = String(data.get('greeting') ?? '').trim() || DEFAULT_GREETING;
    const launchAtStartup = overlay.querySelector('#app-startup-toggle')?.classList.contains('on') ?? state.settings.launchAtStartup;

    const snapshot = await window.senku.saveSettings({
      ...state.settings,
      userName: name,
      greeting,
      launchAtStartup,
    });
    setState(snapshot);
    overlay.remove();
    render();
  });
}

export function openAppSettingsModal(render: () => void): void {
  openProfileModal(render);
}

// ---------------------------------------------------------------------------
// New workspace form modal
// ---------------------------------------------------------------------------

export function openWorkspaceFormModal(load: (path?: string) => Promise<void>): void {
  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">NEW SPACE</span>
      <h2>Give a folder its own Space.</h2>
      <p class="modal-copy">Pick one folder for a subject or project, like “DSA” or “WebDev”. You get full file navigation and quick actions instantly.</p>
      <label>Space name
        <input name="name" required placeholder="e.g. DSA, WebDev, College" />
      </label>
      <label>Main folder
        <div class="path-input">
          <input name="folder" required placeholder="C:\\Users\\you\\projects" />
          <button type="button" id="browse-folder" class="ghost-button">Browse</button>
        </div>
      </label>
      <p class="form-error" id="workspace-error"></p>
      <button class="primary-button" type="submit">Create Space <span>→</span></button>
    </form>`);

  overlay.querySelector('#browse-folder')?.addEventListener('click', async () => {
    const folder = await window.senku.chooseMasterFolder();
    if (folder) {
      (overlay.querySelector('[name="folder"]') as HTMLInputElement).value = folder;
    }
  });

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    if (!folderAllowed(overlay, '#workspace-error', String(data.get('folder')))) return;
    try {
      await window.senku.createWorkspace(
        String(data.get('name')),
        String(data.get('folder')),
      );
      overlay.remove();
      await load();
    } catch (err) {
      showFormError(
        overlay,
        '#workspace-error',
        err instanceof Error ? err.message : 'Could not create Space.',
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Space settings modal
// ---------------------------------------------------------------------------

export function openWorkspaceSettingsModal(load: (path?: string) => Promise<void>, render: () => void): void {
  if (!state?.workspace) return;
  const ws = state.workspace;

  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">SPACE SETTINGS</span>
      <h2>Settings for ${escapeHtml(ws.name)}</h2>
      <p class="modal-copy">Main folder: ${escapeHtml(ws.masterFolder)}</p>
      <label>Space name
        <input name="name" required value="${escapeHtml(ws.name)}" />
      </label>
      <label>Main folder
        <div class="path-input">
          <input name="folder" required value="${escapeHtml(ws.masterFolder)}" />
          <button type="button" id="browse-space-folder" class="ghost-button">Browse</button>
        </div>
      </label>
      <p class="form-error" id="workspace-settings-error"></p>
      <button class="primary-button" type="submit">Save Space settings <span>→</span></button>
      <button type="button" class="danger-button" id="delete-workspace">Delete this Space</button>
    </form>`);

  overlay.querySelector('#browse-space-folder')?.addEventListener('click', async () => {
    const folder = await window.senku.chooseMasterFolder();
    if (folder) (overlay.querySelector('[name="folder"]') as HTMLInputElement).value = folder;
  });

  overlay.querySelector('#delete-workspace')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${ws.name}? The Windows folder itself will not be deleted.`)) return;
    const result = await window.senku.deleteWorkspace(ws.id);
    if (!result.ok) {
      showFormError(overlay, '#workspace-settings-error', result.error ?? 'Could not delete Space.');
      return;
    }
    overlay.remove();
    await load();
  });

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget as HTMLFormElement).get('name')).trim();
    const folder = String(new FormData(e.currentTarget as HTMLFormElement).get('folder')).trim();
    if (!name) {
      showFormError(overlay, '#workspace-settings-error', 'Space name is required.');
      return;
    }
    if (!folder) {
      showFormError(overlay, '#workspace-settings-error', 'Choose a main folder.');
      return;
    }
    if (folder.toLowerCase() !== ws.masterFolder.toLowerCase() && !folderAllowed(overlay, '#workspace-settings-error', folder)) return;
    try {
      let snapshot = await window.senku.setMasterFolder(ws.id, folder);
      snapshot = await window.senku.renameWorkspace(ws.id, name);
      setState(snapshot);
      overlay.remove();
      render();
    } catch (err) {
      showFormError(overlay, '#workspace-settings-error', err instanceof Error ? err.message : 'Could not save Space settings.');
    }
  });
}

// ---------------------------------------------------------------------------
// Launchpad form modal (V3)
// ---------------------------------------------------------------------------

export function openLaunchpadFormModal(load: (path?: string) => Promise<void>): void {
  const currentPath = state.currentPath || state.workspace?.masterFolder || '';

  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">NEW LAUNCHPAD</span>
      <h2>Bundle and launch context in 1-click</h2>
      <p class="modal-copy">Add folder paths, file paths, or URLs. One click opens them all simultaneously.</p>

      <label>Launchpad Name
        <input name="name" required placeholder="e.g. DSA Grind, College Lab, WebDev Project" autocomplete="off" />
      </label>

      <label>Resources (Files, Folders, URLs — one per line)
        <div style="display:flex;gap:8px;margin-bottom:6px;">
          ${currentPath ? '<button type="button" id="lp-add-current" class="ghost-button">+ Add current folder</button>' : ''}
          <button type="button" id="lp-browse" class="ghost-button">+ Browse folder</button>
        </div>
        <textarea
          name="paths"
          id="lp-paths-input"
          rows="5"
          placeholder="https://neetcode.io&#10;C:\\Users\\you\\projects\\dsa&#10;https://github.com"
          style="font-family:monospace;font-size:12px;line-height:1.4;"
        ></textarea>
      </label>

      <p class="form-error" id="lp-error"></p>
      <button class="primary-button" type="submit">Create Launchpad <span>→</span></button>
    </form>`);

  const textarea = overlay.querySelector<HTMLTextAreaElement>('#lp-paths-input')!;

  overlay.querySelector('#lp-add-current')?.addEventListener('click', () => {
    if (!currentPath) return;
    const current = textarea.value.trim();
    textarea.value = current ? `${current}\n${currentPath}` : currentPath;
  });

  overlay.querySelector('#lp-browse')?.addEventListener('click', async () => {
    const folder = await window.senku.chooseMasterFolder();
    if (folder) {
      const current = textarea.value.trim();
      textarea.value = current ? `${current}\n${folder}` : folder;
    }
  });

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const name = String(data.get('name') ?? '').trim();
    if (!name) {
      showFormError(overlay, '#lp-error', 'Launchpad name is required.');
      return;
    }
    const paths = String(data.get('paths') ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const spaceId = state.workspace?.id ?? '';
      await window.senku.createLaunchpad(name, spaceId, paths);
      overlay.remove();
      await load(state.currentPath);
    } catch (err) {
      showFormError(overlay, '#lp-error', err instanceof Error ? err.message : 'Could not create launchpad.');
    }
  });
}
