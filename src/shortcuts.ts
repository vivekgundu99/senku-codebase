import { currentPath, setView, state } from './state';
import { isSamePath, parentOf } from './utils';

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
    key: 't',
    run: ({ render }) => {
      setView('Today');
      render();
    },
  },
  {
    key: 'u',
    run: ({ render }) => {
      setView('Upcoming');
      render();
    },
  },
  {
    key: 'f',
    run: ({ render }) => {
      setView('Flexible');
      render();
    },
  },
  {
    key: 'm',
    run: ({ render }) => {
      setView('Overdue');
      render();
    },
  },
  {
    key: 'c',
    run: ({ render }) => {
      setView('Completed');
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
      if (!root || isSamePath(currentPath, root)) return;
      const parent = parentOf(currentPath);
      if (parent) void load(parent);
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
