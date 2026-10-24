import { state, setState } from '../state';
import { uiIcon } from '../markup';
import { toast } from '../toast';
import { openLaunchpadFormModal } from '../modals';
import type { LoadFn } from './types';

export function bindLaunchpadActions(load: LoadFn): void {
  document.querySelector('#add-launchpad')?.addEventListener('click', () => openLaunchpadFormModal(load));

  document.querySelectorAll<HTMLElement>('[data-open-item]').forEach((chip) =>
    chip.addEventListener('click', async (e) => {
      e.stopPropagation();
      const target = chip.dataset.openItem;
      if (!target) return;
      chip.classList.add('opening');
      try {
        const res = await window.senku.openItem(target);
        if (!res.ok && res.error) {
          toast(`Could not open item: ${res.error}`);
        }
      } catch (err) {
        toast(`Error opening item: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        chip.classList.remove('opening');
      }
    }),
  );

  document.querySelectorAll<HTMLElement>('[data-pin-lp]').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.pinLp!;
      const isPinned = btn.dataset.pinned === 'true';
      await window.senku.setLaunchpadPinned(id, !isPinned);
      await load(state.currentPath);
    }),
  );

  document.querySelectorAll<HTMLElement>('[data-launch-id]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.launchId!;
      const lp = state.launchpads?.find((p) => p.id === id);
      const name = lp?.name ?? 'Launchpad';
      const origHtml = btn.innerHTML;
      btn.textContent = 'Opening…';
      const res = await window.senku.launchLaunchpad(id);
      if (res.ok) {
        toast(`Launched ${name}`);
      } else {
        const count = res.errors.length;
        toast(`Launched ${name} · ${count} failed`);
      }
      btn.innerHTML = origHtml;
      await load(state.currentPath);
    }),
  );

  document.querySelectorAll<HTMLElement>('[data-lp-menu]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = btn.dataset.lpMenu;
      if (!id) return;
      const lp = state.launchpads?.find((p) => p.id === id);
      if (!lp) return;

      document.querySelectorAll('.lp-menu-popover').forEach((p) => p.remove());

      const popover = document.createElement('div');
      popover.className = 'lp-menu-popover';
      popover.innerHTML = `
        <button class="lp-menu-item" id="lp-menu-edit">
          ${uiIcon('pen', 12)}
          <span>Edit</span>
        </button>
        <button class="lp-menu-item danger" id="lp-menu-delete">
          ${uiIcon('x', 12)}
          <span>Delete</span>
        </button>
      `;

      document.body.appendChild(popover);

      const rect = btn.getBoundingClientRect();
      popover.style.top = `${rect.bottom + 4}px`;
      popover.style.left = `${Math.max(10, rect.right - 140)}px`;

      const closePopover = () => {
        popover.remove();
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onDocKey);
      };

      const onDocClick = (evt: MouseEvent) => {
        if (!popover.contains(evt.target as Node) && evt.target !== btn) {
          closePopover();
        }
      };

      const onDocKey = (evt: KeyboardEvent) => {
        if (evt.key === 'Escape') closePopover();
      };

      setTimeout(() => {
        document.addEventListener('click', onDocClick);
        document.addEventListener('keydown', onDocKey);
      }, 0);

      popover.querySelector('#lp-menu-edit')?.addEventListener('click', () => {
        closePopover();
        openLaunchpadFormModal(load, lp);
      });

      popover.querySelector('#lp-menu-delete')?.addEventListener('click', async () => {
        closePopover();
        await window.senku.deleteLaunchpad(lp.id);
        await load(state.currentPath);
        toast(`Deleted ${lp.name}`, {
          actionLabel: 'Undo',
          onAction: async () => {
            const snap = await window.senku.restoreLaunchpad(lp);
            setState(snap);
            await load(state.currentPath);
          },
        });
      });
    }),
  );
}
