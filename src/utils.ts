// ---------------------------------------------------------------------------
// Shared utility helpers used across the renderer
// ---------------------------------------------------------------------------

/** Format an ISO date string to a short human-readable string. */
export const formatDate = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

/** Escape a string for safe insertion into innerHTML. */
export const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] ?? char),
  );

/**
 * Convert a Date to the value expected by <input type="datetime-local">.
 * Adjusts for the local timezone offset so the displayed time matches local time.
 */
export const toLocalDatetimeInput = (date: Date): string => {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 16);
};

/** Default greeting template. */
export const DEFAULT_GREETING = 'Good morning, {name}.';

/**
 * Render the greeting string for the Today header.
 * Replaces {name} with the user's display name.
 */
export const renderGreeting = (greeting: string, userName: string): string =>
  escapeHtml((greeting || DEFAULT_GREETING).replaceAll('{name}', userName));

// ---------------------------------------------------------------------------
// Path helpers (Windows-first, but tolerant of "/")
// ---------------------------------------------------------------------------

const trimSep = (p: string): string => p.replace(/[\\/]+$/, '');

/** Parent folder of a path ("C:\\a\\b" -> "C:\\a", "C:\\a" -> "C:\\"). Empty string if none. */
export function parentOf(path: string): string {
  const t = trimSep(path);
  const i = Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/'));
  if (i < 0) return '';
  if (i === 2 && t[1] === ':') return t.slice(0, 3);
  if (i === 0) return t.slice(0, 1);
  return t.slice(0, i);
}

/** Crumbs from the Space's main folder down to the current folder. */
export function pathCrumbs(root: string, current: string): { name: string; path: string }[] {
  const r = trimSep(root);
  const c = trimSep(current);
  if (!c.toLowerCase().startsWith(r.toLowerCase())) return [];
  const sep = root.includes('/') && !root.includes('\\') ? '/' : '\\';
  let acc = r;
  return c.slice(r.length).split(/[\\/]/).filter(Boolean).map((name) => {
    acc = acc + sep + name;
    return { name, path: acc };
  });
}

export const isSamePath = (a: string, b: string): boolean =>
  trimSep(a).toLowerCase() === trimSep(b).toLowerCase();

/** Last segment of a path, or the path itself for a drive root. */
export const folderName = (path: string): string =>
  trimSep(path).split(/[\\/]/).pop() || path;

// ---------------------------------------------------------------------------
// Guard rails for "Main folder" — Senku is for one subject/project at a time
// ---------------------------------------------------------------------------

export type FolderCheck = { level: 'ok' } | { level: 'warn' | 'block'; message: string };

export function checkMainFolder(path: string): FolderCheck {
  const t = trimSep(path.trim()).toLowerCase();
  if (!t) return { level: 'ok' };

  const blocked = ['c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\programdata', 'c:\\$recycle.bin', 'c:\\system volume information'];
  if (blocked.some((b) => t === b || t.startsWith(b + '\\'))) {
    return { level: 'block', message: 'This is a Windows system folder. Please pick a folder that holds your own work, like "College" or "Projects".' };
  }
  if (/^[a-z]:$/.test(t) || t === '/') {
    return { level: 'warn', message: 'This is a whole drive. Senku works best with one folder per subject or project, so everything stays quick and easy to find.\n\nUse the whole drive anyway?' };
  }
  if (/^[a-z]:\\users(\\[^\\]+)?$/.test(t)) {
    return { level: 'warn', message: 'This is your whole user folder (Desktop, Downloads, AppData and more). A smaller folder like "College" works much better.\n\nUse it anyway?' };
  }
  return { level: 'ok' };
}
