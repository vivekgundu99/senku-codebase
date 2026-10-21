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

/** Get dynamic time-of-day greeting (morning, afternoon, evening) */
export function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Default greeting template. */
export const DEFAULT_GREETING = 'Good morning, {name}.';

export const renderGreeting = (greeting: string, userName: string): string => {
  let template = (greeting || '').trim();
  const timeGreeting = getTimeGreeting();
  const trimmedName = userName.trim();

  // If no custom greeting set, or using the standard time greeting:
  if (!template || /^Good (morning|afternoon|evening)/i.test(template)) {
    if (trimmedName) {
      return `${timeGreeting}, ${escapeHtml(trimmedName)}.`;
    }
    return `${timeGreeting}.`;
  }

  // If template has {name} placeholder:
  if (template.includes('{name}')) {
    if (trimmedName) {
      return escapeHtml(template.replaceAll('{name}', trimmedName));
    }
    let res = template
      .replace(/,\s*\{name\}/g, '')
      .replace(/\s*\{name\}/g, '')
      .replace(/\{name\}\s*,?/g, '')
      .replace(/\s+,/g, ',')
      .replace(/,\s*([.!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (/[.!?]$/.test(template) && !/[.!?]$/.test(res)) {
      res += template.match(/[.!?]$/)?.[0] ?? '.';
    }
    return escapeHtml(res);
  }

  // If custom tagline without {name} (e.g. "Deep focus"):
  if (trimmedName) {
    const clean = template.replace(/[.!?]+$/, '');
    return `${escapeHtml(clean)}, ${escapeHtml(trimmedName)}.`;
  }

  return escapeHtml(/[.!?]$/.test(template) ? template : `${template}.`);
};

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

// ---------------------------------------------------------------------------
// Fuzzy search / matching
// ---------------------------------------------------------------------------

export function fuzzyMatch(query: string, text: string): { score: number; indices: number[] } | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return { score: 0, indices: [] };
  if (q.length > t.length) return null;

  const indices: number[] = [];
  let tIdx = 0;
  let score = 0;
  let consecutive = 0;
  let prevIdx = -1;

  for (let qIdx = 0; qIdx < q.length; qIdx++) {
    const qChar = q[qIdx];
    let found = false;
    while (tIdx < t.length) {
      if (t[tIdx] === qChar) {
        indices.push(tIdx);
        const isStartOfWord = tIdx === 0 || /[\s_\-/.\\]/.test(text[tIdx - 1]) ||
          (text[tIdx] >= 'A' && text[tIdx] <= 'Z' && text[tIdx - 1] >= 'a' && text[tIdx - 1] <= 'z');
        if (isStartOfWord) {
          score += 5;
        }

        if (prevIdx !== -1 && tIdx === prevIdx + 1) {
          consecutive++;
          score += consecutive * 3;
        } else {
          consecutive = 0;
          if (prevIdx !== -1) {
            score -= (tIdx - prevIdx - 1);
          }
        }

        prevIdx = tIdx;
        tIdx++;
        found = true;
        break;
      }
      tIdx++;
    }
    if (!found) return null;
  }

  return { score, indices };
}

export function fuzzyScore(query: string, text: string): number | null {
  const match = fuzzyMatch(query, text);
  return match ? match.score : null;
}
