import { escapeHtml } from './utils';

const inputEl = document.querySelector<HTMLInputElement>('#overlay-input')!;
const sendBtn = document.querySelector<HTMLButtonElement>('#overlay-send-btn')!;
const targetNameEl = document.querySelector<HTMLElement>('#overlay-target-name')!;
const targetSelectEl = document.querySelector<HTMLSelectElement>('#overlay-target-select')!;
const statusEl = document.querySelector<HTMLElement>('#overlay-status')!;
const minBtn = document.querySelector<HTMLButtonElement>('#overlay-min-btn')!;
const closeBtn = document.querySelector<HTMLButtonElement>('#overlay-close-btn')!;

let currentNoteId = '';
let statusTimer: ReturnType<typeof setTimeout> | undefined;

function showStatus(text: string, isError = false) {
  if (!statusEl) return;
  clearTimeout(statusTimer);
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
  statusEl.classList.add('visible');
  statusTimer = setTimeout(() => {
    statusEl.classList.remove('visible');
    setTimeout(() => {
      if (!statusEl.classList.contains('visible')) statusEl.textContent = '';
    }, 300);
  }, 2500);
}

async function refreshActiveNote(): Promise<void> {
  try {
    const data = await window.senku.getActiveNote();
    currentNoteId = data.activeId;
    if (targetNameEl) {
      targetNameEl.textContent = data.activeName || 'Quick Notes';
      targetNameEl.title = `Target: ${data.activeName}`;
    }

    if (targetSelectEl && data.notes) {
      targetSelectEl.innerHTML = data.notes
        .map(
          (n) =>
            `<option value="${escapeHtml(n.id)}"${n.id === currentNoteId ? ' selected' : ''}>${escapeHtml(n.name)}</option>`,
        )
        .join('');
    }
  } catch (err) {
    console.error('Error refreshing active note in overlay:', err);
  }
}

async function doSubmit(): Promise<void> {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.disabled = true;
  sendBtn.disabled = true;
  try {
    const res = await window.senku.appendToActiveNote(text, currentNoteId);
    inputEl.disabled = false;
    sendBtn.disabled = false;
    if (res.ok) {
      inputEl.value = '';
      const now = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      showStatus(`✓ Appended to ${res.noteName || 'note'} [${now}]`);
      inputEl.focus();
    } else {
      showStatus(res.error || 'Could not append note.', true);
      inputEl.focus();
    }
  } catch (err) {
    inputEl.disabled = false;
    sendBtn.disabled = false;
    showStatus(err instanceof Error ? err.message : String(err), true);
    inputEl.focus();
  }
}

// Window controls
minBtn?.addEventListener('click', () => {
  void window.senku.minimizeOverlay();
});

closeBtn?.addEventListener('click', () => {
  void window.senku.hideOverlay();
});

// Target select dropdown change
targetSelectEl?.addEventListener('change', async () => {
  const newId = targetSelectEl.value;
  if (!newId) return;
  currentNoteId = newId;
  const opt = targetSelectEl.options[targetSelectEl.selectedIndex];
  if (targetNameEl && opt) {
    targetNameEl.textContent = opt.text;
  }
  await window.senku.setActiveNote(newId);
  inputEl.focus();
});

// Keyboard handling
inputEl.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    await doSubmit();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    await window.senku.hideOverlay();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    void window.senku.hideOverlay();
  }
});

sendBtn?.addEventListener('click', () => {
  void doSubmit();
});

// Live refresh when window is summoned or focused
window.senku.onOverlayRefresh(() => {
  void refreshActiveNote();
  inputEl.value = '';
  inputEl.focus();
});

// Initial boot
void refreshActiveNote();
setTimeout(() => inputEl.focus(), 80);
