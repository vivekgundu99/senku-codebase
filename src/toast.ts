interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
}

let activeToastEl: HTMLDivElement | null = null;
let activeToastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string, opts?: ToastOptions): void {
  if (activeToastTimer) {
    clearTimeout(activeToastTimer);
    activeToastTimer = null;
  }
  if (activeToastEl) {
    activeToastEl.remove();
    activeToastEl = null;
  }

  const container = document.createElement('div');
  container.className = 'senku-toast';

  const msgSpan = document.createElement('span');
  msgSpan.className = 'senku-toast-message';
  msgSpan.textContent = message;
  container.appendChild(msgSpan);

  const dismissToast = () => {
    if (activeToastTimer) {
      clearTimeout(activeToastTimer);
      activeToastTimer = null;
    }
    if (activeToastEl === container) {
      container.classList.remove('visible');
      setTimeout(() => {
        if (container.parentElement) container.remove();
        if (activeToastEl === container) activeToastEl = null;
      }, 120);
    }
  };

  if (opts?.actionLabel && opts.onAction) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'senku-toast-action';
    actionBtn.textContent = opts.actionLabel;
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissToast();
      opts.onAction?.();
    });
    container.appendChild(actionBtn);
  }

  document.body.appendChild(container);
  activeToastEl = container;

  requestAnimationFrame(() => {
    container.classList.add('visible');
  });

  activeToastTimer = setTimeout(dismissToast, 4000);
}
