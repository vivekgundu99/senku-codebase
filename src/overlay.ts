const inputEl = document.querySelector<HTMLTextAreaElement>('#overlay-input')!;
const targetNameEl = document.querySelector<HTMLElement>('#overlay-target-name')!;
const closeBtn = document.querySelector<HTMLButtonElement>('#overlay-close-btn')!;

let mode: 'Note' | 'Log' = 'Note';
let activeNoteName = 'Notes';
let activeWorkspaceId: string | undefined;

const MIN_BOX = 34; // one line
const MAX_BOX = 140; // about six lines, then the box scrolls
const WINDOW_CHROME = 14; // bar padding + border around the box
let lastWindowHeight = 0;

/** Grow the text box with its content and ask the window to follow. */
function fitToContent(): void {
  inputEl.style.height = 'auto';
  const natural = inputEl.scrollHeight;
  const box = Math.min(MAX_BOX, Math.max(MIN_BOX, natural));
  inputEl.style.height = `${box}px`;
  inputEl.style.overflowY = natural > MAX_BOX ? 'auto' : 'hidden';
  const windowHeight = box + WINDOW_CHROME;
  if (windowHeight !== lastWindowHeight) {
    lastWindowHeight = windowHeight;
    void window.senku.resizeOverlay(windowHeight);
  }
}

function clearInput(): void {
  inputEl.value = '';
  fitToContent();
}

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
        clearInput();
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
      clearInput();
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
  } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
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
  clearInput();
  inputEl.focus();
});

inputEl.addEventListener('input', fitToContent);

void refreshActiveNote();
setTimeout(() => inputEl.focus(), 50);
