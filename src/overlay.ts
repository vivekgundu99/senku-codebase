const inputEl = document.querySelector<HTMLInputElement>('#overlay-input')!;
const targetNameEl = document.querySelector<HTMLElement>('#overlay-target-name')!;
const closeBtn = document.querySelector<HTMLButtonElement>('#overlay-close-btn')!;

let mode: 'Note' | 'Log' = 'Note';
let activeNoteName = 'Notes';
let activeWorkspaceId: string | undefined;

function updateTargetLabel(): void {
  if (targetNameEl) {
    const label = mode === 'Note' ? activeNoteName : 'Log';
    targetNameEl.textContent = label;
    targetNameEl.title = `Target: ${label} (Tab to toggle)`;
  }
}

async function refreshActiveNote(): Promise<void> {
  try {
    const data = await window.senku.getActiveNote();
    activeNoteName = data.activeName || 'Notes';
    activeWorkspaceId = data.workspaceId;
    updateTargetLabel();
  } catch (err) {
    console.error('Error refreshing active note:', err);
  }
}

function showTargetError(msg: string): void {
  if (targetNameEl) {
    targetNameEl.textContent = msg;
    setTimeout(() => {
      updateTargetLabel();
    }, 2000);
  }
}

async function doSubmit(): Promise<void> {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.disabled = true;
  try {
    if (mode === 'Note') {
      const res = await window.senku.appendToActiveNote(text);
      inputEl.disabled = false;
      if (res.ok) {
        inputEl.value = '';
        inputEl.classList.add('saved-flash');
        setTimeout(() => inputEl.classList.remove('saved-flash'), 300);
        inputEl.focus();
      } else {
        if (res.error === 'Create a Space first.') {
          showTargetError(res.error);
        }
        inputEl.focus();
      }
    } else {
      await window.senku.addLogEntry(text, activeWorkspaceId);
      inputEl.disabled = false;
      inputEl.value = '';
      inputEl.classList.add('saved-flash');
      setTimeout(() => inputEl.classList.remove('saved-flash'), 300);
      inputEl.focus();
    }
  } catch (err: any) {
    inputEl.disabled = false;
    const msg = err?.message || String(err);
    if (msg.includes('Create a Space first.')) {
      showTargetError('Create a Space first.');
    }
    inputEl.focus();
  }
}

closeBtn?.addEventListener('click', () => {
  void window.senku.hideOverlay();
});

inputEl.addEventListener('keydown', async (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    mode = mode === 'Note' ? 'Log' : 'Note';
    updateTargetLabel();
  } else if (e.key === 'Enter') {
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
  } else if (e.key === 'Tab') {
    e.preventDefault();
    mode = mode === 'Note' ? 'Log' : 'Note';
    updateTargetLabel();
  }
});

window.senku.onOverlayRefresh(() => {
  mode = 'Note';
  void refreshActiveNote();
  inputEl.value = '';
  inputEl.focus();
});

void refreshActiveNote();
setTimeout(() => inputEl.focus(), 50);
