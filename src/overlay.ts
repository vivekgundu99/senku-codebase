const inputEl = document.querySelector<HTMLInputElement>('#overlay-input')!;
const targetNameEl = document.querySelector<HTMLElement>('#overlay-target-name')!;
const closeBtn = document.querySelector<HTMLButtonElement>('#overlay-close-btn')!;

async function refreshActiveNote(): Promise<void> {
  try {
    const data = await window.senku.getActiveNote();
    if (targetNameEl) {
      targetNameEl.textContent = data.activeName || 'Notes';
      targetNameEl.title = `Target: ${data.activeName || 'Notes'}`;
    }
  } catch (err) {
    console.error('Error refreshing active note:', err);
  }
}

async function doSubmit(): Promise<void> {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.disabled = true;
  try {
    const res = await window.senku.appendToActiveNote(text);
    inputEl.disabled = false;
    if (res.ok) {
      inputEl.value = '';
      inputEl.classList.add('saved-flash');
      setTimeout(() => inputEl.classList.remove('saved-flash'), 300);
      inputEl.focus();
    } else {
      inputEl.focus();
    }
  } catch {
    inputEl.disabled = false;
    inputEl.focus();
  }
}

closeBtn?.addEventListener('click', () => {
  void window.senku.hideOverlay();
});

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

window.senku.onOverlayRefresh(() => {
  void refreshActiveNote();
  inputEl.value = '';
  inputEl.focus();
});

void refreshActiveNote();
setTimeout(() => inputEl.focus(), 50);
