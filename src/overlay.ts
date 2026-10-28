const inputEl = document.querySelector<HTMLTextAreaElement>('#overlay-input')!;
const closeBtn = document.querySelector<HTMLButtonElement>('#overlay-close-btn')!;

const MIN_BOX = 24; // one line of text
const MAX_BOX = 140; // about six lines before scrolling
const WINDOW_CHROME = 14; // bar padding + border + breathing room
let lastWindowHeight = 0;

/** Grow the text box with its content and ask the window to follow downwards. */
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

async function doSubmit(): Promise<void> {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.disabled = true;
  try {
    const res = await window.senku.appendToActiveNote(text);
    inputEl.disabled = false;
    if (res.ok) {
      clearInput();
      document.body.classList.add('saved-flash');
      const defaultPlaceholder = inputEl.placeholder;
      inputEl.placeholder = '✓ Saved to Notes (senku.md)';
      inputEl.classList.add('saved-text');
      setTimeout(() => {
        document.body.classList.remove('saved-flash');
        inputEl.placeholder = defaultPlaceholder;
        inputEl.classList.remove('saved-text');
      }, 1400);
      inputEl.focus();
    } else {
      inputEl.focus();
    }
  } catch (err) {
    console.error('Failed to append note snippet:', err);
    inputEl.disabled = false;
    inputEl.focus();
  }
}

closeBtn?.addEventListener('click', () => {
  void window.senku.hideOverlay();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    void window.senku.hideOverlay();
  }
}, true);

inputEl.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    await doSubmit();
  }
});

inputEl.addEventListener('input', fitToContent);

window.senku.onOverlayRefresh(() => {
  clearInput();
  inputEl.focus();
});

setTimeout(() => inputEl.focus(), 50);
