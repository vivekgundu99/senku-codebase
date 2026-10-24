import { state, homeLogDraft, setHomeLogDraft } from '../state';
import { toast } from '../toast';
import { openLaunchpadFormModal } from '../modals';
import type { LoadFn, RenderFn } from './types';

/** Chat-style send key: Enter sends, Shift+Enter inserts a new line. */
export function isSendKey(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing;
}

/** Grow a textarea with its content (like a chat box), up to a maximum height. */
export function growTextarea(el: HTMLTextAreaElement, minPx: number, maxPx = 200): void {
  el.style.height = 'auto';
  el.style.height = `${Math.min(maxPx, Math.max(minPx, el.scrollHeight))}px`;
  el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
}

export function bindHomeActions(load: LoadFn, render: RenderFn): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('#home-capture-textarea');
  const btn = document.querySelector<HTMLButtonElement>('#home-capture-submit');

  const adjustHomeHeight = () => {
    if (!textarea) return;
    textarea.style.height = '22px';
    const scrollH = textarea.scrollHeight;
    if (scrollH > 26) {
      const targetH = Math.min(180, scrollH);
      textarea.style.height = `${targetH}px`;
      textarea.style.overflowY = scrollH > 180 ? 'auto' : 'hidden';
    } else {
      textarea.style.height = '22px';
      textarea.style.overflowY = 'hidden';
    }
  };

  if (textarea) {
    textarea.addEventListener('input', () => {
      setHomeLogDraft(textarea.value);
      adjustHomeHeight();
    });
    adjustHomeHeight();
    textarea.addEventListener('keydown', (e) => {
      if (isSendKey(e)) {
        e.preventDefault();
        void submit();
      }
    });
  }

  const submit = async () => {
    const rawVal = textarea ? textarea.value : homeLogDraft;
    const text = rawVal.trim();
    if (!text) return;
    setHomeLogDraft('');
    if (textarea) {
      textarea.value = '';
      textarea.style.height = '22px';
      textarea.style.overflowY = 'hidden';
    }
    const spaceId = state.workspace?.id;
    await window.senku.addLogEntry(text, spaceId);
    await load(state.currentPath);
    render();
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLTextAreaElement>('#home-capture-textarea');
      if (el) {
        el.focus();
        el.style.height = '22px';
        el.style.overflowY = 'hidden';
      }
    });
  };

  btn?.addEventListener('click', () => void submit());

  document.querySelector('#home-add-launchpad')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openLaunchpadFormModal(load);
  });

  document.querySelectorAll<HTMLElement>('[data-launch-home-id]').forEach((launchBtn) => {
    launchBtn.addEventListener('click', async () => {
      const id = launchBtn.dataset.launchHomeId!;
      const spaceId = launchBtn.dataset.spaceId;
      const pad = state.home?.launchpads?.find((p) => p.id === id);
      const name = pad?.name ?? 'Launchpad';
      launchBtn.textContent = 'Launching…';
      const res = await window.senku.launchLaunchpad(id, spaceId);
      if (res.ok) {
        toast(`Launched ${name}`);
      } else {
        const count = res.errors.length;
        toast(`Launched ${name} · ${count} failed`);
      }
      await load();
    });
  });
}
