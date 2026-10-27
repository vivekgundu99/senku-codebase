import { state, isGlobalNotesMode } from './state';
import { isSamePath, parentOf } from './utils';
import { toast } from './toast';

type ShortcutContext = {
  load: (path?: string) => Promise<void>;
  render: () => void;
};

const shortcuts = [
  {
    key: 'p',
    run: ({ load, render }: ShortcutContext) => {
      void import('./palette').then((m) => m.openPalette(load, render));
    },
  },
  {
    key: 'r',
    run: ({ load }: ShortcutContext) => {
      void load(state.currentPath).then(() => toast('Refreshed'));
    },
  },
  {
    key: 'b',
    run: ({ load }: ShortcutContext) => {
      const root = isGlobalNotesMode
        ? document.querySelector<HTMLElement>('#go-root')?.dataset.rootTarget
        : state.workspace?.masterFolder;
      const current = state.currentPath;
      if (!root || !current || isSamePath(current, root)) return;
      const parent = parentOf(current);
      if (parent) void load(parent);
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
