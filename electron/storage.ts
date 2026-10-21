import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Launchpad, LogEntry, NoteFile, Workspace } from './types';

// ---------------------------------------------------------------------------
// Atomic file writes
// ---------------------------------------------------------------------------

export async function writeFileAtomic(file: string, content: string): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');

  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      const retryable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!retryable || attempt >= 5) {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
    }
  }
}

// ---------------------------------------------------------------------------
// File name sanitization & uniqueness
// ---------------------------------------------------------------------------

const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function sanitizeFileName(name: string): string {
  // 1. Remove characters < > : " / \ | ? * and control characters (ASCII 0-31)
  let cleaned = (name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '');

  // 2. Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');

  // 3. Trim spaces and trailing dots
  cleaned = cleaned.trim().replace(/\.+$/, '').trim();

  // 4. Truncate to 80 chars
  if (cleaned.length > 80) {
    cleaned = cleaned.slice(0, 80).trim().replace(/\.+$/, '').trim();
  }

  // 5. If empty → Untitled
  if (!cleaned) {
    cleaned = 'Untitled';
  }

  // 6. Windows reserved names (case-insensitive) → append _
  if (WINDOWS_RESERVED.test(cleaned)) {
    cleaned = `${cleaned}_`;
  }

  return cleaned;
}

export function uniqueName(wanted: string, existingNames: string[]): string {
  const existingSet = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!existingSet.has(wanted.toLowerCase())) {
    return wanted;
  }

  let counter = 2;
  while (existingSet.has(`${wanted} (${counter})`.toLowerCase())) {
    counter++;
  }
  return `${wanted} (${counter})`;
}

// ---------------------------------------------------------------------------
// Notes (notesDir = <spaceDir>/notes)
// ---------------------------------------------------------------------------
// Notes (notesDir = <userData>/notes)
// ---------------------------------------------------------------------------

export async function listBundles(notesDir: string): Promise<string[]> {
  try {
    await fs.mkdir(notesDir, { recursive: true });
    const items = await fs.readdir(notesDir, { withFileTypes: true });
    return items.filter((i) => i.isDirectory()).map((i) => i.name).sort();
  } catch {
    return [];
  }
}

export async function createBundle(notesDir: string, name: string): Promise<string> {
  const existing = await listBundles(notesDir);
  const sanitized = sanitizeFileName(name);
  const finalName = uniqueName(sanitized, existing);
  await fs.mkdir(path.join(notesDir, finalName), { recursive: true });
  return finalName;
}

export async function renameBundle(notesDir: string, oldName: string, newName: string): Promise<string> {
  const oldPath = path.join(notesDir, oldName);
  try {
    await fs.access(oldPath);
  } catch {
    throw new Error('Bundle not found.');
  }
  const existing = (await listBundles(notesDir)).filter((b) => b.toLowerCase() !== oldName.toLowerCase());
  const sanitized = sanitizeFileName(newName);
  const finalName = uniqueName(sanitized, existing);
  if (finalName === oldName) return oldName;
  const newPath = path.join(notesDir, finalName);
  await fs.rename(oldPath, newPath);
  return finalName;
}

export async function deleteBundle(notesDir: string, bundleName: string): Promise<void> {
  const dirPath = path.join(notesDir, bundleName);
  await fs.rm(dirPath, { recursive: true, force: true }).catch(() => undefined);
}

export async function listNotes(notesDir: string): Promise<NoteFile[]> {
  try {
    await fs.mkdir(notesDir, { recursive: true });
    const items = await fs.readdir(notesDir, { withFileTypes: true });
    const notes: NoteFile[] = [];

    for (const item of items) {
      if (item.isFile() && item.name.endsWith('.md') && !item.name.endsWith('.tmp')) {
        const filePath = path.join(notesDir, item.name);
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const stat = await fs.stat(filePath);
          const baseName = item.name.slice(0, -3); // remove .md
          notes.push({
            id: baseName,
            name: baseName,
            content,
            createdAt: stat.birthtimeMs,
            updatedAt: stat.mtimeMs,
            filePath,
          });
        } catch {
          // Skip unreadable files
        }
      } else if (item.isDirectory()) {
        const bundleName = item.name;
        const bundleDir = path.join(notesDir, bundleName);
        try {
          const subItems = await fs.readdir(bundleDir, { withFileTypes: true });
          for (const sub of subItems) {
            if (sub.isFile() && sub.name.endsWith('.md') && !sub.name.endsWith('.tmp')) {
              const filePath = path.join(bundleDir, sub.name);
              try {
                const content = await fs.readFile(filePath, 'utf8');
                const stat = await fs.stat(filePath);
                const baseName = sub.name.slice(0, -3);
                notes.push({
                  id: `${bundleName}/${baseName}`,
                  name: baseName,
                  bundle: bundleName,
                  content,
                  createdAt: stat.birthtimeMs,
                  updatedAt: stat.mtimeMs,
                  filePath,
                });
              } catch {
                // Skip unreadable files
              }
            }
          }
        } catch {
          // Skip unreadable subdirectories
        }
      }
    }

    return notes.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function createNote(notesDir: string, name: string, bundle?: string): Promise<NoteFile> {
  const cleanBundle = bundle ? sanitizeFileName(bundle) : undefined;
  const targetDir = cleanBundle ? path.join(notesDir, cleanBundle) : notesDir;
  await fs.mkdir(targetDir, { recursive: true });

  const existingNotes = await listNotes(notesDir);
  const existingInScope = existingNotes
    .filter((n) => (cleanBundle ? n.bundle === cleanBundle : !n.bundle))
    .map((n) => n.name);

  const sanitized = sanitizeFileName(name);
  const finalName = uniqueName(sanitized, existingInScope);
  const filePath = path.join(targetDir, `${finalName}.md`);

  await writeFileAtomic(filePath, '');
  const stat = await fs.stat(filePath);
  const id = cleanBundle ? `${cleanBundle}/${finalName}` : finalName;

  return {
    id,
    name: finalName,
    bundle: cleanBundle,
    content: '',
    createdAt: stat.birthtimeMs,
    updatedAt: stat.mtimeMs,
  };
}

export async function updateNote(notesDir: string, id: string, content: string): Promise<NoteFile> {
  const filePath = path.join(notesDir, `${id}.md`);
  try {
    await fs.access(filePath);
  } catch {
    throw new Error('Note not found.');
  }

  await writeFileAtomic(filePath, content);
  const stat = await fs.stat(filePath);
  const parts = id.split('/');
  const name = parts[parts.length - 1];
  const bundle = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined;

  return {
    id,
    name,
    bundle,
    content,
    createdAt: stat.birthtimeMs,
    updatedAt: stat.mtimeMs,
  };
}

export async function renameNote(
  notesDir: string,
  id: string,
  newName: string
): Promise<{ id: string; name: string }> {
  const oldPath = path.join(notesDir, `${id}.md`);
  try {
    await fs.access(oldPath);
  } catch {
    throw new Error('Note not found.');
  }

  const parts = id.split('/');
  const bundle = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined;
  const targetDir = bundle ? path.join(notesDir, bundle) : notesDir;

  const sanitized = sanitizeFileName(newName);
  const existingNotes = await listNotes(notesDir);
  const existingInScope = existingNotes
    .filter((n) => (bundle ? n.bundle === bundle : !n.bundle) && n.id !== id)
    .map((n) => n.name);

  const finalName = uniqueName(sanitized, existingInScope);
  const newId = bundle ? `${bundle}/${finalName}` : finalName;
  if (newId === id) return { id, name: finalName };

  const newPath = path.join(targetDir, `${finalName}.md`);
  await fs.rename(oldPath, newPath);
  return { id: newId, name: finalName };
}

export async function appendToNote(notesDir: string, id: string, snippet: string): Promise<void> {
  const filePath = path.join(notesDir, `${id}.md`);
  let current: string;
  try {
    current = await fs.readFile(filePath, 'utf8');
  } catch {
    throw new Error('Note not found.');
  }

  const sep = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
  await writeFileAtomic(filePath, current + sep + snippet);
}

export async function deleteNote(notesDir: string, id: string): Promise<void> {
  const filePath = path.join(notesDir, `${id}.md`);
  await fs.rm(filePath, { force: true }).catch(() => undefined);
}

export async function restoreNote(notesDir: string, note: NoteFile): Promise<NoteFile> {
  const cleanBundle = note.bundle ? sanitizeFileName(note.bundle) : undefined;
  const targetDir = cleanBundle ? path.join(notesDir, cleanBundle) : notesDir;
  await fs.mkdir(targetDir, { recursive: true });

  const existingNotes = await listNotes(notesDir);
  const existingInScope = existingNotes
    .filter((n) => (cleanBundle ? n.bundle === cleanBundle : !n.bundle))
    .map((n) => n.name);

  const finalName = uniqueName(note.name, existingInScope);
  const filePath = path.join(targetDir, `${finalName}.md`);
  const id = cleanBundle ? `${cleanBundle}/${finalName}` : finalName;

  await writeFileAtomic(filePath, note.content);
  const mtime = new Date(note.updatedAt || Date.now());
  const atime = new Date();
  await fs.utimes(filePath, atime, mtime).catch(() => undefined);

  const stat = await fs.stat(filePath);
  return {
    id,
    name: finalName,
    bundle: cleanBundle,
    content: note.content,
    createdAt: stat.birthtimeMs,
    updatedAt: stat.mtimeMs,
  };
}

// ---------------------------------------------------------------------------
// Notes Book Markdown Import / Export
// ---------------------------------------------------------------------------

export function buildBookMarkdown(
  title: string,
  notes: Array<{ name?: string; title?: string; content: string; bundle?: string; spaceName?: string }>,
  defaultSpaceName?: string
): string {
  const blocks: string[] = [`<!-- senku-book: ${title} -->\n# ${title}`];

  // Group by spaceName (if any, fallback to defaultSpaceName or 'General')
  const spaceMap = new Map<string, typeof notes>();
  for (const n of notes) {
    const sp = n.spaceName || defaultSpaceName || 'General';
    if (!spaceMap.has(sp)) spaceMap.set(sp, []);
    spaceMap.get(sp)!.push(n);
  }

  for (const [spaceName, spNotes] of spaceMap.entries()) {
    blocks.push(`<!-- space: ${spaceName} -->\n## ${spaceName}`);

    const bundleMap = new Map<string, typeof notes>();
    const loose: typeof notes = [];

    for (const n of spNotes) {
      if (n.bundle) {
        if (!bundleMap.has(n.bundle)) bundleMap.set(n.bundle, []);
        bundleMap.get(n.bundle)!.push(n);
      } else {
        loose.push(n);
      }
    }

    for (const [bundleName, bNotes] of bundleMap.entries()) {
      blocks.push(`<!-- folder: ${bundleName} -->\n### ${bundleName}`);
      const sorted = [...bNotes].sort((a, b) => {
        const nameA = a.title ?? a.name ?? '';
        const nameB = b.title ?? b.name ?? '';
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      });
      for (const note of sorted) {
        const noteTitle = (note.title ?? note.name ?? 'Untitled').trim();
        const content = (note.content ?? '').replace(/^\n+|\n+$/g, '');
        if (content.length > 0) {
          blocks.push(`<!-- page: ${noteTitle} -->\n#### ${noteTitle}\n\n${content}`);
        } else {
          blocks.push(`<!-- page: ${noteTitle} -->\n#### ${noteTitle}`);
        }
      }
    }

    if (loose.length > 0) {
      if (bundleMap.size > 0) {
        blocks.push(`<!-- folder: Loose Notes -->\n### Loose Notes`);
      }
      const sorted = [...loose].sort((a, b) => {
        const nameA = a.title ?? a.name ?? '';
        const nameB = b.title ?? b.name ?? '';
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      });
      for (const note of sorted) {
        const noteTitle = (note.title ?? note.name ?? 'Untitled').trim();
        const content = (note.content ?? '').replace(/^\n+|\n+$/g, '');
        const headerLevel = bundleMap.size > 0 ? '####' : '###';
        if (content.length > 0) {
          blocks.push(`<!-- page: ${noteTitle} -->\n${headerLevel} ${noteTitle}\n\n${content}`);
        } else {
          blocks.push(`<!-- page: ${noteTitle} -->\n${headerLevel} ${noteTitle}`);
        }
      }
    }
  }

  return blocks.join('\n\n') + '\n';
}

export function buildFolderMarkdown(
  folderName: string,
  notes: Array<{ name?: string; title?: string; content: string }>
): string {
  const blocks: string[] = [`<!-- senku-folder: ${folderName} -->\n# ${folderName}`];
  const sorted = [...notes].sort((a, b) => {
    const nameA = a.title ?? a.name ?? '';
    const nameB = b.title ?? b.name ?? '';
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });

  for (const note of sorted) {
    const noteTitle = (note.title ?? note.name ?? 'Untitled').trim();
    const content = (note.content ?? '').replace(/^\n+|\n+$/g, '');
    if (content.length > 0) {
      blocks.push(`<!-- page: ${noteTitle} -->\n## ${noteTitle}\n\n${content}`);
    } else {
      blocks.push(`<!-- page: ${noteTitle} -->\n## ${noteTitle}`);
    }
  }

  return blocks.join('\n\n') + '\n';
}

export function splitBookMarkdown(text: string): { title: string; content: string }[] | null {
  const lines = text.split(/\r?\n/);
  const firstNonEmpty = lines.find((l) => l.trim().length > 0);
  if (!firstNonEmpty || !firstNonEmpty.startsWith('<!-- senku-book')) {
    return null;
  }

  const pageMarkerRegex = /^<!-- page: (.+) -->$/;
  const pages: { title: string; content: string }[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const flushPage = () => {
    if (currentTitle !== null) {
      const pageLines = [...currentLines];
      if (pageLines.length > 0 && pageLines[0].trim() === `# ${currentTitle}`) {
        pageLines.shift();
        if (pageLines.length > 0 && pageLines[0].trim() === '') {
          pageLines.shift();
        }
      }
      const content = pageLines.join('\n').replace(/^\n+|\n+$/g, '');
      pages.push({ title: currentTitle, content });
    }
  };

  for (const line of lines) {
    const match = line.match(pageMarkerRegex);
    if (match) {
      flushPage();
      currentTitle = match[1].trim();
      currentLines = [];
    } else if (currentTitle !== null) {
      currentLines.push(line);
    }
  }
  flushPage();

  return pages;
}

export function importTitleFromFile(fileName: string): string {
  const base = path.basename(fileName, path.extname(fileName));
  return sanitizeFileName(base);
}

// ---------------------------------------------------------------------------
// Log (logDir = <spaceDir>/log)
// ---------------------------------------------------------------------------

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatLocalTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ---------------------------------------------------------------------------
// Single-File Log Storage (<spaceDir>/log.md & <baseDir>/global-log.md)
// ---------------------------------------------------------------------------

export const LOG_DATE_HEADER_REGEX = /^##\s+(\d{4}-\d{2}-\d{2})$/;
export const LOG_ENTRY_LINE_REGEX = /^-\s+(\d{2}:\d{2}(?::\d{2})?)\s+(?:#(\d+)\s+)?(.*)$/;

export function parseLogMarkdown(content: string): LogEntry[] {
  const lines = content.split(/\r?\n/);
  const entries: LogEntry[] = [];
  let currentDate = '';
  let currentEntry: LogEntry | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateMatch = line.match(LOG_DATE_HEADER_REGEX);
    if (dateMatch) {
      currentDate = dateMatch[1];
      currentEntry = null;
      continue;
    }

    const entryMatch = line.match(LOG_ENTRY_LINE_REGEX);
    if (entryMatch && currentDate) {
      const timeStr = entryMatch[1];
      const seq = entryMatch[2] ? parseInt(entryMatch[2], 10) : 0;
      let rawText = entryMatch[3] || '';

      const [y, m, d] = currentDate.split('-').map(Number);
      const timeParts = timeStr.split(':').map(Number);
      const hh = timeParts[0] || 0;
      const mm = timeParts[1] || 0;
      const ss = timeParts[2] || 0;
      const createdAt = new Date(y, m - 1, d, hh, mm, ss).getTime();

      let spaceId: string | undefined;
      let refId: string | undefined;
      let spaceName: string | undefined;

      const refMatch = rawText.match(/<!--ref:([^:>]+)(?::([^>]+))?-->/);
      if (refMatch) {
        spaceId = refMatch[1];
        refId = refMatch[2];
        rawText = rawText.replace(refMatch[0], '').trim();
      }

      const spaceMatch = rawText.match(/^\[([^\]]+)\]\s*/);
      if (spaceMatch) {
        spaceName = spaceMatch[1];
        rawText = rawText.slice(spaceMatch[0].length);
      }

      const id = seq > 0 ? `${currentDate}:${seq}` : `${currentDate}:${timeStr}`;

      currentEntry = {
        id,
        seq,
        createdAt,
        text: rawText,
        spaceId,
        spaceName,
        refId,
      };
      entries.push(currentEntry);
    } else if (currentEntry && (line.startsWith('  ') || line.startsWith('\t'))) {
      currentEntry.text += '\n' + line.trim();
    }
  }

  return entries.sort((a, b) => b.createdAt - a.createdAt || (b.seq || 0) - (a.seq || 0));
}

export function serializeLogEntries(entries: LogEntry[]): string {
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt || (b.seq || 0) - (a.seq || 0));
  const groups = new Map<string, LogEntry[]>();

  for (const entry of sorted) {
    const d = new Date(entry.createdAt);
    const dateStr = formatLocalDate(d);
    if (!groups.has(dateStr)) {
      groups.set(dateStr, []);
    }
    groups.get(dateStr)!.push(entry);
  }

  const chunks: string[] = [];
  for (const [dateStr, dayEntries] of groups.entries()) {
    chunks.push(`## ${dateStr}`);
    for (const e of dayEntries) {
      const d = new Date(e.createdAt);
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      const refTag = e.spaceId ? `<!--ref:${e.spaceId}-->` : '';
      const spaceTag = e.spaceName ? `[${e.spaceName}] ` : '';

      const rawLines = e.text.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string, idx: number) => idx === 0 || l.length > 0);
      const firstLine = rawLines[0] || '';
      const continuationLines = rawLines.slice(1).map((l: string) => `  ${l}`);

      chunks.push(`- ${timeStr} ${refTag}${spaceTag}${firstLine}`);
      if (continuationLines.length > 0) {
        chunks.push(...continuationLines);
      }
    }
    chunks.push('');
  }

  return chunks.join('\n').trim() + '\n';
}

export async function ensureMigratedFromLegacyLogDir(logFilePath: string): Promise<void> {
  const dir = path.dirname(logFilePath);
  const legacyDir = path.join(dir, 'log');
  try {
    const stat = await fs.stat(legacyDir);
    if (!stat.isDirectory()) return;

    const files = await fs.readdir(legacyDir);
    const mdFiles = files.filter((f) => f.endsWith('.md')).sort();
    if (mdFiles.length === 0) {
      await fs.rm(legacyDir, { recursive: true, force: true }).catch(() => undefined);
      return;
    }

    const legacyEntries: LogEntry[] = [];
    for (const file of mdFiles) {
      const dateStr = file.replace(/\.md$/, '');
      const content = await fs.readFile(path.join(legacyDir, file), 'utf8');
      const lines = content.split(/\r?\n/);
      let currentEntry: LogEntry | null = null;

      for (const line of lines) {
        const match = line.match(/^-\s+(\d{2}:\d{2}(?::\d{2})?)\s+(?:#(\d+)\s+)?(.*)$/);
        if (match) {
          const timeStr = match[1];
          const seq = match[2] ? parseInt(match[2], 10) : 0;
          let rawText = match[3] || '';
          const [y, m, d] = dateStr.split('-').map(Number);
          const timeParts = timeStr.split(':').map(Number);
          const hh = timeParts[0] || 0;
          const mm = timeParts[1] || 0;
          const ss = timeParts[2] || 0;
          const createdAt = new Date(y, m - 1, d, hh, mm, ss).getTime();

          let spaceId: string | undefined;
          let refId: string | undefined;
          let spaceName: string | undefined;

          const refMatch = rawText.match(/<!--ref:([^:]+):([^>]+)-->/);
          if (refMatch) {
            spaceId = refMatch[1];
            refId = refMatch[2];
            rawText = rawText.replace(refMatch[0], '');
          }

          const spaceMatch = rawText.match(/^\[([^\]]+)\]\s*/);
          if (spaceMatch) {
            spaceName = spaceMatch[1];
            rawText = rawText.slice(spaceMatch[0].length);
          }

          currentEntry = {
            id: seq > 0 ? `${dateStr}:${seq}` : `${dateStr}:${timeStr}`,
            seq,
            createdAt,
            text: rawText,
            spaceId,
            spaceName,
            refId,
          };
          legacyEntries.push(currentEntry);
        } else if (currentEntry && (line.startsWith('  ') || line.startsWith('\t'))) {
          currentEntry.text += '\n' + line.trim();
        }
      }
    }

    let existingEntries: LogEntry[] = [];
    try {
      const existingText = await fs.readFile(logFilePath, 'utf8');
      existingEntries = parseLogMarkdown(existingText);
    } catch {
      existingEntries = [];
    }

    const mergedMap = new Map<string, LogEntry>();
    for (const e of legacyEntries) {
      mergedMap.set(e.id, e);
    }
    for (const e of existingEntries) {
      if (mergedMap.has(e.id)) {
        const maxSeq = Math.max(...Array.from(mergedMap.values()).map((m) => m.seq || 0), 0);
        e.seq = maxSeq + 1;
        const d = new Date(e.createdAt);
        const dateStr = formatLocalDate(d);
        e.id = `${dateStr}:${e.seq}`;
      }
      mergedMap.set(e.id, e);
    }

    const allMerged = Array.from(mergedMap.values());
    await fs.writeFile(logFilePath, serializeLogEntries(allMerged), 'utf8');
    await fs.rm(legacyDir, { recursive: true, force: true }).catch(() => undefined);
  } catch {
    // Ignore if legacy directory doesn't exist
  }
}

export async function listLog(logFilePath: string): Promise<LogEntry[]> {
  await ensureMigratedFromLegacyLogDir(logFilePath);
  try {
    const text = await fs.readFile(logFilePath, 'utf8');
    return parseLogMarkdown(text);
  } catch {
    return [];
  }
}

export async function listLogRecent(logFilePath: string, limit: number): Promise<LogEntry[]> {
  const all = await listLog(logFilePath);
  return all.slice(0, limit);
}

export async function addLog(
  logFilePath: string,
  text: string,
  spaceId?: string,
  spaceName?: string,
  now = new Date(),
): Promise<LogEntry> {
  await fs.mkdir(path.dirname(logFilePath), { recursive: true });
  const entries = await listLog(logFilePath);
  const dateStr = formatLocalDate(now);

  const rawLines = text.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string, idx: number) => idx === 0 || l.length > 0);
  const cleanText = rawLines.join('\n');
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const newEntry: LogEntry = {
    id: `${dateStr}:${timeStr}-${now.getTime().toString(36)}`,
    seq: 0,
    createdAt: now.getTime(),
    text: cleanText,
    spaceId,
    spaceName,
  };

  entries.unshift(newEntry);
  await writeFileAtomic(logFilePath, serializeLogEntries(entries));
  return newEntry;
}

export async function updateLog(logFilePath: string, id: string, text: string): Promise<void> {
  const entries = await listLog(logFilePath);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const rawLines = text.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string, idx: number) => idx === 0 || l.length > 0);
  entry.text = rawLines.join('\n');

  await writeFileAtomic(logFilePath, serializeLogEntries(entries));
}

export async function deleteLog(logFilePath: string, id: string): Promise<void> {
  const entries = await listLog(logFilePath);
  const filtered = entries.filter((e) => e.id !== id);
  if (filtered.length === entries.length) return;

  if (filtered.length === 0) {
    await fs.rm(logFilePath, { force: true }).catch(() => undefined);
    return;
  }

  await writeFileAtomic(logFilePath, serializeLogEntries(filtered));
}

export async function restoreLog(logFilePath: string, entry: LogEntry): Promise<void> {
  const entries = await listLog(logFilePath);
  if (entries.some((e) => e.id === entry.id)) return;
  entries.push(entry);
  await writeFileAtomic(logFilePath, serializeLogEntries(entries));
}

export async function renumberLog(_spaceDir: string): Promise<number> {
  return 0;
}

export async function addGlobalLog(
  globalLogFile: string,
  text: string,
  spaceId: string,
  spaceLogId: string,
  spaceName: string,
  now = new Date()
): Promise<LogEntry> {
  await fs.mkdir(path.dirname(globalLogFile), { recursive: true });
  const entries = await listLog(globalLogFile);
  const dateStr = formatLocalDate(now);

  const todays = entries.filter((e) => e.id.startsWith(dateStr));
  let maxSeq = 0;
  for (const e of todays) {
    if (e.seq && e.seq > maxSeq) maxSeq = e.seq;
  }
  const nextSeq = maxSeq + 1;

  const rawLines = text.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string, idx: number) => idx === 0 || l.length > 0);
  const cleanText = rawLines.join('\n');

  const newEntry: LogEntry = {
    id: `${dateStr}:${nextSeq}`,
    seq: nextSeq,
    createdAt: now.getTime(),
    text: cleanText,
    spaceId,
    spaceName,
    refId: spaceLogId,
  };

  entries.unshift(newEntry);
  await writeFileAtomic(globalLogFile, serializeLogEntries(entries));
  return newEntry;
}

export async function listGlobalLogs(globalLogFile: string): Promise<LogEntry[]> {
  return listLog(globalLogFile);
}

export async function deleteGlobalLogRef(globalLogFile: string, spaceId: string, spaceLogId: string): Promise<void> {
  const entries = await listLog(globalLogFile);
  const filtered = entries.filter((e) => !(e.spaceId === spaceId && e.refId === spaceLogId));
  if (filtered.length === entries.length) return;

  if (filtered.length === 0) {
    await fs.rm(globalLogFile, { force: true }).catch(() => undefined);
    return;
  }

  await writeFileAtomic(globalLogFile, serializeLogEntries(filtered));
}

export async function deleteFromGlobalAndSpace(
  globalLogFile: string,
  globalId: string,
  spaceLogFileFn: (spaceId: string) => string
): Promise<{ spaceId?: string; spaceLogId?: string }> {
  const entries = await listLog(globalLogFile);
  const target = entries.find((e) => e.id === globalId);
  if (!target) return {};

  const filtered = entries.filter((e) => e.id !== globalId);
  await writeFileAtomic(globalLogFile, serializeLogEntries(filtered));

  if (target.spaceId && target.refId) {
    const sLogFile = spaceLogFileFn(target.spaceId);
    await deleteLog(sLogFile, target.refId).catch(() => undefined);
    return { spaceId: target.spaceId, spaceLogId: target.refId };
  }

  return {};
}

// ---------------------------------------------------------------------------
// Launchpads
// ---------------------------------------------------------------------------

export function orderLaunchpads(pads: Launchpad[]): Launchpad[] {
  const pinned = pads.filter((p) => p.pinned);
  const unpinned = pads.filter((p) => !p.pinned);
  pinned.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  unpinned.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return [...pinned, ...unpinned];
}

export async function readLaunchpads(file: string): Promise<Launchpad[]> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeLaunchpads(file: string, pads: Launchpad[]): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(pads, null, 2));
}

// ---------------------------------------------------------------------------
// Space Metadata (meta.json)
// ---------------------------------------------------------------------------

export interface SpaceMeta {
  activeNoteId?: string;
  lastLogSeq?: number;
}

export async function readSpaceMeta(file: string): Promise<SpaceMeta> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as SpaceMeta;
  } catch {
    return {};
  }
}

export async function writeSpaceMeta(file: string, meta: SpaceMeta): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(meta, null, 2));
}

// ---------------------------------------------------------------------------
// Pure migration logic (testable outside Electron)
// ---------------------------------------------------------------------------

export interface LegacyData {
  notes?: NoteFile[];
  logEntries?: LogEntry[];
  launchpads?: Launchpad[];
  legacyActiveNoteId?: string;
}

export async function migrateLegacy(
  userDataDir: string,
  legacy: LegacyData,
  spaces: Workspace[],
  activeSpaceId: string | null,
): Promise<void> {
  const markerFile = path.join(userDataDir, 'storage-version.json');

  // 1. Check marker
  try {
    await fs.access(markerFile);
    return; // Already migrated
  } catch {
    // Proceed
  }

  // 2. Zero spaces -> do nothing, do not write marker
  if (!spaces || spaces.length === 0 || !activeSpaceId) {
    return;
  }

  const spaceIds = new Set(spaces.map((s) => s.id));
  const targetActiveSpaceId = spaceIds.has(activeSpaceId) ? activeSpaceId : spaces[0].id;

  // 3. Migrate Notes into active Space
  const notesDir = path.join(userDataDir, 'spaces', targetActiveSpaceId, 'notes');
  const existingNotes = await listNotes(notesDir);
  const existingNoteNames = new Set(existingNotes.map((n) => n.name.toLowerCase()));
  let activeMigratedNoteId: string | undefined;

  for (const note of legacy.notes || []) {
    const sanitized = sanitizeFileName(note.name);
    const noteContent = note.content || '';

    // Idempotency: skip if a note with same name and content already exists
    const matchingExisting = existingNotes.find(
      (n) => n.name.toLowerCase() === sanitized.toLowerCase() && n.content === noteContent,
    );

    if (matchingExisting) {
      if (legacy.legacyActiveNoteId && (note.id === legacy.legacyActiveNoteId || note.name === legacy.legacyActiveNoteId)) {
        activeMigratedNoteId = matchingExisting.name;
      }
      continue;
    }

    const finalName = uniqueName(sanitized, Array.from(existingNoteNames));
    existingNoteNames.add(finalName.toLowerCase());
    const filePath = path.join(notesDir, `${finalName}.md`);
    await writeFileAtomic(filePath, noteContent);
    const mtime = new Date(note.updatedAt || Date.now());
    await fs.utimes(filePath, new Date(), mtime).catch(() => undefined);

    existingNotes.push({
      id: finalName,
      name: finalName,
      content: noteContent,
      createdAt: note.createdAt || Date.now(),
      updatedAt: note.updatedAt || Date.now(),
    });

    if (legacy.legacyActiveNoteId && (note.id === legacy.legacyActiveNoteId || note.name === legacy.legacyActiveNoteId)) {
      activeMigratedNoteId = finalName;
    }
  }

  // Set meta.json activeNoteId if note was migrated
  const metaFile = path.join(userDataDir, 'spaces', targetActiveSpaceId, 'meta.json');
  const existingMeta = await readSpaceMeta(metaFile);
  if (activeMigratedNoteId && !existingMeta.activeNoteId) {
    await writeSpaceMeta(metaFile, { ...existingMeta, activeNoteId: activeMigratedNoteId });
  }

  // 4. Migrate Log entries into appropriate Space
  // Sort by createdAt then seq
  const sortedLogs = [...(legacy.logEntries || [])].sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq);
  for (const entry of sortedLogs) {
    const targetSpace = entry.spaceId && spaceIds.has(entry.spaceId) ? entry.spaceId : targetActiveSpaceId;
    const logDir = path.join(userDataDir, 'spaces', targetSpace, 'log');

    const d = new Date(entry.createdAt);
    const dateStr = formatLocalDate(d);
    const timeStr = formatLocalTime(d);
    const singleLine = entry.text.replace(/[\r\n]+/g, ' ').trim();
    const lineFormatted = `- ${timeStr} ${singleLine}`;
    const filePath = path.join(logDir, `${dateStr}.md`);

    let current = '';
    try {
      current = await fs.readFile(filePath, 'utf8');
    } catch {
      current = '';
    }

    const lines = current.length > 0 ? current.split(/\r?\n/) : [];
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    // Idempotency check: does this exact line already exist in the day file?
    if (!lines.includes(lineFormatted)) {
      lines.push(lineFormatted);
      await writeFileAtomic(filePath, lines.join('\n') + '\n');
    }
  }

  // 5. Migrate Launchpads into appropriate Space
  for (const pad of legacy.launchpads || []) {
    const targetSpace = pad.spaceId && spaceIds.has(pad.spaceId) ? pad.spaceId : targetActiveSpaceId;
    const launchpadsFile = path.join(userDataDir, 'spaces', targetSpace, 'launchpads.json');
    const existingPads = await readLaunchpads(launchpadsFile);

    // Idempotency: skip if pad with same id or name+paths already exists
    const alreadyExists = existingPads.some(
      (p) => p.id === pad.id || (p.name === pad.name && JSON.stringify(p.paths) === JSON.stringify(pad.paths)),
    );

    if (!alreadyExists) {
      existingPads.push({ ...pad, spaceId: targetSpace });
      await writeLaunchpads(launchpadsFile, existingPads);
    }
  }

  // 6. Write storage-version.json marker only after all steps succeed
  await writeFileAtomic(markerFile, JSON.stringify({ version: 2 }, null, 2));
}
