import type { Launchpad } from '../../electron/types';
import { state, getCachedPathAvailability } from '../state';
import { escapeHtml, folderName } from '../utils';
import { uiIcon } from './icons';
import { iconSvg, pathKind } from './files';

export function launchpadCardMarkup(lp: Launchpad): string {
  const availability = getCachedPathAvailability();
  const pathChips = lp.paths.map(p => {
    const isUrl = /^https?:\/\//i.test(p);
    const label = isUrl
      ? (() => { try { return new URL(p).hostname; } catch { return p.slice(0, 30); } })()
      : folderName(p);
    const status = availability[p];
    const isMissing = !isUrl && status === 'missing';
    const isFolder = !isUrl && status === 'folder';

    let iconHtml = '';
    if (!isUrl) {
      const kind = isFolder ? 'folder' : pathKind(p);
      iconHtml = iconSvg(kind, 14);
    }

    const titleText = isMissing ? 'Missing' : (isUrl ? `Open website: ${p}` : `Open item: ${p}`);
    const chipClass = `lp-path-chip interactive${isMissing ? ' missing' : ''}`;
    return `<button type="button" class="${chipClass}" data-open-item="${escapeHtml(p)}" title="${escapeHtml(titleText)}">${iconHtml}<span>${escapeHtml(label)}</span><span class="chip-arrow">↗</span></button>`;
  }).join('');

  return `
    <div class="launchpad-card">
      <div class="lp-card-head">
        <h3 class="lp-name">${escapeHtml(lp.name)}</h3>
        <div class="lp-card-actions">
          <button class="lp-pin-btn ${lp.pinned ? 'active' : ''}" data-pin-lp="${lp.id}" data-pinned="${Boolean(lp.pinned)}" title="${lp.pinned ? 'Unpin' : 'Pin to Home'}">${uiIcon('star', 12)}</button>
          <button class="lp-launch-btn" data-launch-id="${lp.id}" title="Open all resources">${uiIcon('play', 11)} Launch</button>
          <button type="button" class="lp-menu-btn" data-lp-menu="${lp.id}" title="Launchpad options" aria-label="Launchpad options">${uiIcon('dots', 13)}</button>
        </div>
      </div>
      ${pathChips ? `<div class="lp-paths">${pathChips}</div>` : ''}
    </div>`;
}

export function launchpadsPanelMarkup(): string {
  if (!state.workspace) {
    return `
    <section class="launchpads-panel">
      <div class="panel-header-line">
        <h2 class="panel-header-title">Total 0</h2>
      </div>
      <div class="lp-empty-state">
        <p>Create or select a Space to manage launchpads.</p>
        <button class="primary-button mini" id="create-space-files" style="margin-top: 12px;">+ Create a Space</button>
      </div>
    </section>`;
  }

  const launchpads = state.launchpads ?? [];
  const content = launchpads.length
    ? launchpads.map(launchpadCardMarkup).join('')
    : `<div class="lp-empty-state">
         <p>No Launchpads yet.</p>
         <small>Create one to bundle files, folders, and URLs to open them all in one click.</small>
       </div>`;

  return `
    <section class="launchpads-panel">
      <div class="panel-header-line">
        <h2 class="panel-header-title">Total ${launchpads.length}</h2>
        <div class="panel-header-actions">
          <button type="button" class="lp-header-add-btn" id="add-launchpad" title="New Launchpad" aria-label="New Launchpad">${uiIcon('plus', 13)}</button>
        </div>
      </div>
      <div class="launchpads-list">${content}</div>
    </section>`;
}
