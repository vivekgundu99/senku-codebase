import {
  state,
  setState,
  setView,
  setAllLog,
  allLog,
  logFilter,
  setLogFilter,
  logFromDate,
  logToDate,
  setLogFromDate,
  setLogToDate,
  resetLogDates,
  showMoreLogs,
  visibleLogEntries,
  logPageDraft,
  setLogPageDraft,
} from '../state';
import { logListMarkup } from '../markup';
import { toast } from '../toast';
import { isSendKey } from './home';
import type { LoadFn, RenderFn } from './types';

export function bindLogPanel(load: LoadFn, render: RenderFn): void {
  const panel = document.querySelector<HTMLElement>('.log-panel');
  if (!panel) return;

  const scope = (panel.dataset.scope as 'space' | 'all') || 'space';

  const refreshList = () => {
    const list = panel.querySelector('.log-entries');
    if (list) list.innerHTML = logListMarkup(scope);
    const count = panel.querySelector('.log-count-badge');
    const { matched, total } = visibleLogEntries(scope);
    if (count) count.textContent = logFilter.trim() || logFromDate || logToDate ? `${matched} of ${total}` : '';
  };

  // Scope switcher
  panel.querySelectorAll<HTMLElement>('[data-log-scope]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetScope = btn.dataset.logScope;
      if (targetScope === 'all') {
        setView('AllLog');
        const all = await window.senku.listAllLogs();
        setAllLog(all);
        render();
      } else {
        setView('Log');
        await load(state.currentPath);
        render();
      }
    });
  });

  const textarea = panel.querySelector<HTMLTextAreaElement>('#log-compose-textarea');

  const adjustLogHeight = () => {
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
      setLogPageDraft(textarea.value);
      adjustLogHeight();
    });
    adjustLogHeight();
    textarea.addEventListener('keydown', (e) => {
      if (isSendKey(e)) {
        e.preventDefault();
        void submit();
      }
    });
  }

  const submit = async () => {
    const rawVal = textarea ? textarea.value : logPageDraft;
    const text = rawVal.trim();
    if (!text) return;
    setLogPageDraft('');
    if (textarea) {
      textarea.value = '';
      textarea.style.height = '22px';
      textarea.style.overflowY = 'hidden';
    }
    const targetSpaceId = scope === 'all' ? 'global' : state.workspace?.id;
    await window.senku.addLogEntry(text, targetSpaceId);
    if (scope === 'all') {
      const all = await window.senku.listAllLogs();
      setAllLog(all);
    } else {
      await load(state.currentPath);
    }
    render();
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('#log-compose-textarea')?.focus();
    });
  };

  // Expandable Search & input handling
  const logSearchWrap = panel.querySelector<HTMLElement>('#log-search-expandable');
  const searchInput = panel.querySelector<HTMLInputElement>('#log-search');
  const searchTrigger = panel.querySelector<HTMLElement>('#log-search-trigger');
  const searchClear = panel.querySelector<HTMLElement>('#log-search-clear');

  const triggerSearch = () => {
    const val = searchInput ? searchInput.value : '';
    setLogFilter(val);
    refreshList();
  };

  searchTrigger?.addEventListener('click', () => {
    logSearchWrap?.classList.add('open');
    searchInput?.focus();
    searchInput?.select();
  });

  searchClear?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    setLogFilter('');
    refreshList();
    logSearchWrap?.classList.remove('open');
  });

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerSearch();
    } else if (e.key === 'Escape') {
      if (searchInput) searchInput.value = '';
      setLogFilter('');
      refreshList();
      logSearchWrap?.classList.remove('open');
      searchInput?.blur();
    }
  });

  // Export filtered logs to markdown
  panel.querySelector('#log-export-btn')?.addEventListener('click', async () => {
    const { items } = visibleLogEntries(scope);
    if (items.length === 0) {
      toast('No logs to export.');
      return;
    }
    const lines: string[] = [];
    const title = scope === 'all' ? 'Senku All Logs' : `${state.workspace?.name || 'Senku'} Logs`;
    lines.push(`# ${title}\n`);
    if (logFromDate || logToDate || logFilter) {
      const filters: string[] = [];
      if (logFromDate) filters.push(`From: ${logFromDate}`);
      if (logToDate) filters.push(`To: ${logToDate}`);
      if (logFilter) filters.push(`Search: "${logFilter}"`);
      lines.push(`> Filters: ${filters.join(' · ')}\n`);
    }

    const groups = new Map<string, typeof items>();
    for (const item of items) {
      const d = new Date(item.createdAt);
      const dateStr = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
      if (!groups.has(dateStr)) groups.set(dateStr, []);
      groups.get(dateStr)!.push(item);
    }

    for (const [dateStr, dayItems] of groups.entries()) {
      lines.push(`## ${dateStr}`);
      for (const item of dayItems) {
        const d = new Date(item.createdAt);
        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const spaceTag = item.spaceName ? `[${item.spaceName}] ` : (scope === 'all' && (!item.spaceId || item.spaceId === 'senku') ? '[#senku] ' : '');
        lines.push(`- **${timeStr}** ${spaceTag}${item.text}`);
      }
      lines.push('');
    }

    const defaultName = scope === 'all' ? 'senku-all-logs.md' : `${(state.workspace?.name || 'senku').toLowerCase().replace(/\s+/g, '-')}-logs.md`;
    const res = await window.senku.exportLogs(lines.join('\n'), defaultName);
    if (res.ok) {
      toast(`Exported ${items.length} log entries to Downloads.`);
    } else if (res.error && res.error !== 'Cancelled.') {
      toast(`Export failed: ${res.error}`);
    }
  });

  // Date range filter
  const fromInput = panel.querySelector<HTMLInputElement>('#log-from-date');
  fromInput?.addEventListener('change', (e) => {
    setLogFromDate((e.target as HTMLInputElement).value);
    refreshList();
  });

  const toInput = panel.querySelector<HTMLInputElement>('#log-to-date');
  toInput?.addEventListener('change', (e) => {
    setLogToDate((e.target as HTMLInputElement).value);
    refreshList();
  });

  panel.querySelector('#reset-log-dates')?.addEventListener('click', () => {
    resetLogDates();
    if (fromInput) fromInput.value = logFromDate;
    if (toInput) toInput.value = logToDate;
    refreshList();
  });

  // Lazy loading on scroll
  const entriesEl = panel.querySelector<HTMLElement>('.log-entries');
  entriesEl?.addEventListener('scroll', () => {
    if (entriesEl.scrollTop + entriesEl.clientHeight >= entriesEl.scrollHeight - 60) {
      const { matched, items } = visibleLogEntries(scope);
      if (items.length < matched) {
        showMoreLogs();
        refreshList();
      }
    }
  });

  panel.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#show-more-logs')) {
      showMoreLogs();
      refreshList();
      return;
    }
    const spaceBadge = target.closest<HTMLElement>('[data-space-filter]');
    if (spaceBadge) {
      const spaceName = spaceBadge.dataset.spaceFilter;
      if (spaceName) {
        setLogFilter(spaceName);
        const searchWrap = panel.querySelector<HTMLElement>('#log-search-expandable');
        searchWrap?.classList.add('open');
        const searchInput = panel.querySelector<HTMLInputElement>('#log-search');
        if (searchInput) {
          searchInput.value = spaceName;
          searchInput.focus();
          searchInput.select();
        }
        refreshList();
      }
      return;
    }
    const delBtn = target.closest<HTMLElement>('[data-delete-log]');
    if (delBtn) {
      const id = delBtn.dataset.deleteLog;
      const spaceId = delBtn.dataset.spaceId;
      if (!id) return;
      const allEntries = scope === 'all' ? allLog : (state.logEntries ?? []);
      const entryToDelete = allEntries.find((item) => item.id === id);
      delBtn.style.pointerEvents = 'none';
      delBtn.style.opacity = '0.3';
      try {
        const snap = await window.senku.deleteLogEntry(id, spaceId);
        setState(snap);
        if (scope === 'all') {
          const all = await window.senku.listAllLogs();
          setAllLog(all);
        }
        refreshList();
        if (entryToDelete) {
          toast('Deleted', {
            actionLabel: 'Undo',
            onAction: async () => {
              const restoredSnap = await window.senku.restoreLogEntry(entryToDelete);
              setState(restoredSnap);
              if (scope === 'all') {
                const all = await window.senku.listAllLogs();
                setAllLog(all);
              }
              refreshList();
            },
          });
        }
      } catch (err) {
        delBtn.style.pointerEvents = '';
        delBtn.style.opacity = '';
        toast(`Could not delete log: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });
}
