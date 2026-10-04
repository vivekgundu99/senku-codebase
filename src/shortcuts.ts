import { currentPath, setView, state } from './state';

type ShortcutContext = {
  load: (path?: string) => Promise<void>;
  render: () => void;
};

type Shortcut = {
  key: string;
  run: (context: ShortcutContext) => void;
};

const shortcuts: Shortcut[] = [
  {
    key: 'h',
    run: ({ render }) => {
      setView('Home');
      render();
    },
  },
  {
    key: 'n',
    run: ({ render }) => {
      setView('Note');
      render();
    },
  },
  {
    key: 'r',
    run: ({ load }) => {
      const root = state.workspace?.masterFolder;
      if (!root || currentPath.toLowerCase() === root.toLowerCase()) return;

      const separator = Math.max(currentPath.lastIndexOf('\\'), currentPath.lastIndexOf('/'));
      if (separator < 0) return;
      const parent = separator === 2 && currentPath[1] === ':'
        ? currentPath.slice(0, 3)
        : separator === 0
          ? currentPath.slice(0, 1)
          : currentPath.slice(0, separator);
      void load(parent);
    },
  },
];

export function registerShortcuts(load: ShortcutContext['load'], render: ShortcutContext['render']): void {
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.repeat) return;
    if (document.querySelector('.modal-backdrop')) return;
    if (
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable || event.target.closest('input, textarea, select'))
    ) {
      return;
    }

    const shortcut = shortcuts.find((item) => item.key === event.key.toLowerCase());
    if (!shortcut) return;

    event.preventDefault();
    shortcut.run({ load, render });
  });
}
