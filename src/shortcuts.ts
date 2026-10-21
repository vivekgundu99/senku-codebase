import { currentPath, setView, state } from './state';
import { isSamePath, parentOf } from './utils';

type ShortcutContext = {
  load: (path?: string) => Promise<void>;
  render: () => void;
};

const shortcuts = [
  { key: 'h', run: ({ render }: ShortcutContext) => { setView('Home'); render(); } },
  { key: 's', run: ({ render }: ShortcutContext) => { setView('Overview'); render(); } },
  { key: 'l', run: ({ render }: ShortcutContext) => { setView('Launchpads'); render(); } },
  { key: 'g', run: ({ render }: ShortcutContext) => { setView('Log'); render(); } },
  { key: 'n', run: ({ render }: ShortcutContext) => { setView('Notes'); render(); } },
  { key: 'o', run: () => { void window.senku.showOverlay(); } },
  {
    key: 'r',
    run: ({ load }: ShortcutContext) => {
      const root = state.workspace?.masterFolder;
      if (!root || isSamePath(currentPath, root)) return;
      const parent = parentOf(currentPath);
      if (parent) void load(parent);
    },
  },
  {
    key: '/',
    run: () => {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('#file-filter, #log-search, input[type="search"]'));
      const visible = inputs.find((el) => el.offsetParent !== null);
      if (visible) {
        visible.focus();
        visible.select();
      }
    },
  },
];

export function registerShortcuts(load: ShortcutContext['load'], render: ShortcutContext['render']): void {
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.repeat) return;
    if (document.querySelector('.modal-backdrop, .palette-backdrop')) return;
    if (
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable || event.target.closest('input, textarea, select'))
    ) return;

    const shortcut = shortcuts.find((item) => item.key === event.key.toLowerCase());
    if (!shortcut) return;

    event.preventDefault();
    shortcut.run({ load, render });
  });
}
