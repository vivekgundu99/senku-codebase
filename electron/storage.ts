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
  spaceName: string,
  notes: Array<{ name?: string; title?: string; content: string }>
): string {
  const sorted = [...notes].sort((a, b) => {
    const nameA = a.title ?? a.name ?? '';
    const nameB = b.title ?? b.name ?? '';
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });

  const blocks: string[] = [`<!-- senku-book: ${spaceName} -->`];

  for (const note of sorted) {
    const title = (note.title ?? note.name ?? 'Untitled').trim();
    const content = (note.content ?? '').replace(/^\n+|\n+$/g, '');
    if (content.length > 0) {
      blocks.push(`<!-- page: ${title} -->\n# ${title}\n\n${content}`);
    } else {
      blocks.push(`<!-- page: ${title} -->\n# ${title}`);
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

export const LOG_LINE_REGEX = /^- (\d{2}):(\d{2}) (?:#(\d+) )?(.+)$/;

export function parseLogFile(dateStr: string, fileText: string): LogEntry[] {
  const [y, m, d] = dateStr.split('-').map(Number);
  const lines = fileText.split(/\r?\n/);
  const entries: LogEntry[] = [];
  let currentEntry: LogEntry | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(LOG_LINE_REGEX);
    if (match) {
      const hh = Number(match[1]);
      const mm = Number(match[2]);
      const seq = match[3] ? Number(match[3]) : 0;
      const text = match[4];
      const createdAt = new Date(y, m - 1, d, hh, mm).getTime();
      const id = seq > 0 ? `${dateStr}:${seq}` : `${dateStr}:line${i}`;
      currentEntry = {
        id,
        seq,
        createdAt,
        text,
      };
      entries.push(currentEntry);
    } else if (currentEntry && (line.startsWith('  ') || line.startsWith('\t'))) {
      currentEntry.text += '\n' + line.trim();
    }
  }

  return entries;
}

export function resolveSpaceAndLogDir(dir: string): { spaceDir: string; logDir: string } {
  if (path.basename(dir).toLowerCase() === 'log') {
    return { spaceDir: path.dirname(dir), logDir: dir };
  }
  return { spaceDir: dir, logDir: path.join(dir, 'log') };
}

export async function nextLogNumber(spaceDir: string): Promise<number> {
  const { spaceDir: sDir, logDir } = resolveSpaceAndLogDir(spaceDir);
  const metaFile = path.join(sDir, 'meta.json');
  const meta = await readSpaceMeta(metaFile);

  let maxNum = meta.lastLogSeq ?? 0;
  try {
    const items = await fs.readdir(logDir, { withFileTypes: true });
    for (const item of items) {
      if (item.isFile() && /^\d{4}-\d{2}-\d{2}\.md$/.test(item.name) && !item.name.endsWith('.tmp')) {
        const content = await fs.readFile(path.join(logDir, item.name), 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const m = line.match(LOG_LINE_REGEX);
          if (m && m[3]) {
            const num = Number(m[3]);
            if (num > maxNum) maxNum = num;
          }
        }
      }
    }
  } catch {
    // logDir may not exist yet
  }

  const next = maxNum + 1;
  meta.lastLogSeq = next;
  await writeSpaceMeta(metaFile, meta);
  return next;
}

export async function listLog(logDir: string): Promise<LogEntry[]> {
  try {
    const items = await fs.readdir(logDir, { withFileTypes: true });
    const allEntries: LogEntry[] = [];

    for (const item of items) {
      if (item.isFile() && /^\d{4}-\d{2}-\d{2}\.md$/.test(item.name) && !item.name.endsWith('.tmp')) {
        const dateStr = item.name.slice(0, -3);
        const filePath = path.join(logDir, item.name);
        try {
          const text = await fs.readFile(filePath, 'utf8');
          allEntries.push(...parseLogFile(dateStr, text));
        } catch {
          // ignore unreadable files
        }
      }
    }

    return allEntries.sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function listLogRecent(logDir: string, limit: number): Promise<LogEntry[]> {
  try {
    const items = await fs.readdir(logDir, { withFileTypes: true });
    const dayFiles = items
      .filter((it) => it.isFile() && /^\d{4}-\d{2}-\d{2}\.md$/.test(it.name) && !it.name.endsWith('.tmp'))
      .map((it) => it.name)
      .sort()
      .reverse();

    const collected: LogEntry[] = [];

    for (const f of dayFiles) {
      const dateStr = f.slice(0, -3);
      const filePath = path.join(logDir, f);
      try {
        const text = await fs.readFile(filePath, 'utf8');
        const entries = parseLogFile(dateStr, text);
        entries.reverse();
        for (const entry of entries) {
          collected.push(entry);
          if (collected.length >= limit) {
            return collected;
          }
        }
      } catch {
        // ignore unreadable
      }
    }

    return collected;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function addLog(spaceOrLogDir: string, text: string, now = new Date()): Promise<LogEntry> {
  const { spaceDir, logDir } = resolveSpaceAndLogDir(spaceOrLogDir);
  const seq = await nextLogNumber(spaceDir);
  const dateStr = formatLocalDate(now);
  const timeStr = formatLocalTime(now);
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

  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l, idx) => idx === 0 || l.length > 0);
  const firstLine = rawLines[0] || '';
  const continuationLines = rawLines.slice(1).map((l) => `  ${l}`);

  const newLine = `- ${timeStr} #${seq} ${firstLine}`;
  lines.push(newLine, ...continuationLines);

  await writeFileAtomic(filePath, lines.join('\n') + '\n');

  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = [now.getHours(), now.getMinutes()];

  return {
    id: `${dateStr}:${seq}`,
    seq,
    createdAt: new Date(y, m - 1, d, hh, mm).getTime(),
    text: rawLines.join('\n'),
  };
}

export async function updateLog(logDir: string, id: string, text: string): Promise<void> {
  const colonIdx = id.lastIndexOf(':');
  if (colonIdx === -1) return;

  const dateStr = id.slice(0, colonIdx);
  const targetIdPart = id.slice(colonIdx + 1);
  const isLineIndex = targetIdPart.startsWith('line');
  const targetNum = isLineIndex ? parseInt(targetIdPart.slice(4), 10) : parseInt(targetIdPart, 10);
  if (Number.isNaN(targetNum)) return;

  const filePath = path.join(logDir, `${dateStr}.md`);
  let current: string;
  try {
    current = await fs.readFile(filePath, 'utf8');
  } catch {
    return;
  }

  const lines = current.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  let updateIdx = -1;
  let timePart = '';
  let seqPart = '';

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(LOG_LINE_REGEX);
    if (match) {
      const seq = match[3] ? Number(match[3]) : 0;
      const matches = isLineIndex ? i === targetNum : seq === targetNum;
      if (matches) {
        updateIdx = i;
        timePart = `${match[1]}:${match[2]}`;
        seqPart = match[3] ? ` #${match[3]}` : '';
        break;
      }
    }
  }

  if (updateIdx === -1) return;

  let countToRemove = 1;
  while (updateIdx + countToRemove < lines.length && (lines[updateIdx + countToRemove].startsWith('  ') || lines[updateIdx + countToRemove].startsWith('\t'))) {
    countToRemove++;
  }

  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l, idx) => idx === 0 || l.length > 0);
  const firstLine = rawLines[0] || '';
  const continuationLines = rawLines.slice(1).map((l) => `  ${l}`);
  const replacement = [`- ${timePart}${seqPart} ${firstLine}`, ...continuationLines];

  lines.splice(updateIdx, countToRemove, ...replacement);
  await writeFileAtomic(filePath, lines.join('\n') + '\n');
}

export async function deleteLog(logDir: string, id: string): Promise<void> {
  const colonIdx = id.lastIndexOf(':');
  if (colonIdx === -1) return;

  const dateStr = id.slice(0, colonIdx);
  const targetIdPart = id.slice(colonIdx + 1);
  const isLineIndex = targetIdPart.startsWith('line');
  const targetNum = isLineIndex ? parseInt(targetIdPart.slice(4), 10) : parseInt(targetIdPart, 10);
  if (Number.isNaN(targetNum)) return;

  const filePath = path.join(logDir, `${dateStr}.md`);
  let current: string;
  try {
    current = await fs.readFile(filePath, 'utf8');
  } catch {
    return;
  }

  const lines = current.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  let removeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(LOG_LINE_REGEX);
    if (match) {
      const seq = match[3] ? Number(match[3]) : 0;
      const matches = isLineIndex ? i === targetNum : seq === targetNum;
      if (matches) {
        removeIdx = i;
        break;
      }
    }
  }

  if (removeIdx === -1) return;

  let countToRemove = 1;
  while (removeIdx + countToRemove < lines.length && (lines[removeIdx + countToRemove].startsWith('  ') || lines[removeIdx + countToRemove].startsWith('\t'))) {
    countToRemove++;
  }

  lines.splice(removeIdx, countToRemove);

  const remainingText = lines.join('\n').trim();
  if (!remainingText) {
    await fs.rm(filePath, { force: true }).catch(() => undefined);
    return;
  }

  await writeFileAtomic(filePath, lines.join('\n') + '\n');
}

// ---------------------------------------------------------------------------
// Global Redundant Log
// ---------------------------------------------------------------------------

export async function addGlobalLog(
  baseDir: string,
  text: string,
  spaceId: string,
  spaceLogId: string,
  spaceName: string,
  now = new Date()
): Promise<LogEntry> {
  const logDir = path.join(baseDir, 'log');
  await fs.mkdir(logDir, { recursive: true });
  const seq = await nextLogNumber(baseDir);
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l, idx) => idx === 0 || l.length > 0);
  const firstLine = rawLines[0] || '';
  const continuationLines = rawLines.slice(1).map((l) => `  ${l}`);
  const dateStr = formatLocalDate(now);
  const timeStr = formatLocalTime(now);
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

  const marker = `<!--ref:${spaceId}:${spaceLogId}-->`;
  const spaceBadge = spaceName ? `[${spaceName}] ` : '';
  const newLine = `- ${timeStr} #${seq} ${marker}${spaceBadge}${firstLine}`;
  lines.push(newLine, ...continuationLines);

  await writeFileAtomic(filePath, lines.join('\n') + '\n');

  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = [now.getHours(), now.getMinutes()];

  return {
    id: `${dateStr}:${seq}`,
    seq,
    createdAt: new Date(y, m - 1, d, hh, mm).getTime(),
    text: `${spaceBadge}${rawLines.join('\n')}`,
    spaceId,
    spaceName,
    refId: spaceLogId,
  };
}

export async function listGlobalLogs(baseDir: string): Promise<LogEntry[]> {
  const logDir = path.join(baseDir, 'log');
  const raw = await listLog(logDir);
  return raw.map((entry) => {
    let cleanText = entry.text;
    let spaceId: string | undefined;
    let refId: string | undefined;
    let spaceName: string | undefined;

    const refMatch = cleanText.match(/<!--ref:([^:]+):([^>]+)-->/);
    if (refMatch) {
      spaceId = refMatch[1];
      refId = refMatch[2];
      cleanText = cleanText.replace(refMatch[0], '');
    }

    const spaceMatch = cleanText.match(/^\[([^\]]+)\]\s*/);
    if (spaceMatch) {
      spaceName = spaceMatch[1];
      cleanText = cleanText.slice(spaceMatch[0].length);
    }

    return {
      ...entry,
      text: cleanText,
      spaceId,
      spaceName,
      refId,
    };
  });
}

export async function deleteGlobalLogRef(baseDir: string, spaceId: string, spaceLogId: string): Promise<void> {
  const colonIdx = spaceLogId.lastIndexOf(':');
  if (colonIdx === -1) return;
  const dateStr = spaceLogId.slice(0, colonIdx);
  const logDir = path.join(baseDir, 'log');
  const filePath = path.join(logDir, `${dateStr}.md`);

  let current: string;
  try {
    current = await fs.readFile(filePath, 'utf8');
  } catch {
    return;
  }

  const lines = current.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const needle = `<!--ref:${spaceId}:${spaceLogId}-->`;
  let removeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) {
      removeIdx = i;
      break;
    }
  }

  if (removeIdx === -1) return;

  let countToRemove = 1;
  while (removeIdx + countToRemove < lines.length && (lines[removeIdx + countToRemove].startsWith('  ') || lines[removeIdx + countToRemove].startsWith('\t'))) {
    countToRemove++;
  }
  lines.splice(removeIdx, countToRemove);

  const remainingText = lines.join('\n').trim();
  if (!remainingText) {
    await fs.rm(filePath, { force: true }).catch(() => undefined);
    return;
  }
  await writeFileAtomic(filePath, lines.join('\n') + '\n');
}

export async function deleteFromGlobalAndSpace(
  baseDir: string,
  globalId: string,
  spacesDirFn: (id: string) => string
): Promise<{ spaceId?: string; spaceLogId?: string }> {
  const colonIdx = globalId.lastIndexOf(':');
  if (colonIdx === -1) return {};
  const dateStr = globalId.slice(0, colonIdx);
  const logDir = path.join(baseDir, 'log');
  const filePath = path.join(logDir, `${dateStr}.md`);

  let current: string;
  try {
    current = await fs.readFile(filePath, 'utf8');
  } catch {
    return {};
  }

  let spaceId: string | undefined;
  let spaceLogId: string | undefined;

  const targetIdPart = globalId.slice(colonIdx + 1);
  const isLineIndex = targetIdPart.startsWith('line');
  const targetNum = isLineIndex ? parseInt(targetIdPart.slice(4), 10) : parseInt(targetIdPart, 10);

  const lines = current.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  let removeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(LOG_LINE_REGEX);
    if (match) {
      const seq = match[3] ? Number(match[3]) : 0;
      const matches = isLineIndex ? i === targetNum : seq === targetNum;
      if (matches) {
        removeIdx = i;
        const refMatch = lines[i].match(/<!--ref:([^:]+):([^>]+)-->/);
        if (refMatch) {
          spaceId = refMatch[1];
          spaceLogId = refMatch[2];
        }
        break;
      }
    }
  }

  if (removeIdx !== -1) {
    let countToRemove = 1;
    while (removeIdx + countToRemove < lines.length && (lines[removeIdx + countToRemove].startsWith('  ') || lines[removeIdx + countToRemove].startsWith('\t'))) {
      countToRemove++;
    }
    lines.splice(removeIdx, countToRemove);

    const remainingText = lines.join('\n').trim();
    if (!remainingText) {
      await fs.rm(filePath, { force: true }).catch(() => undefined);
    } else {
      await writeFileAtomic(filePath, lines.join('\n') + '\n');
    }
  }

  // If this entry belonged to a space, delete it from the space too!
  if (spaceId && spaceLogId) {
    const sLogDir = path.join(spacesDirFn(spaceId), 'log');
    await deleteLog(sLogDir, spaceLogId).catch(() => undefined);
  }

  return { spaceId, spaceLogId };
}

export async function restoreLog(logDir: string, entry: LogEntry): Promise<void> {
  const d = new Date(entry.createdAt);
  const dateStr = formatLocalDate(d);
  const timeStr = formatLocalTime(d);
  const entryMinutes = d.getHours() * 60 + d.getMinutes();
  const textLines = entry.text.split(/\r?\n/).map((l) => l.trim()).filter((l, idx) => idx === 0 || l.length > 0);
  const seqPart = entry.seq > 0 ? ` #${entry.seq}` : '';
  const linesToInsert = [
    `- ${timeStr}${seqPart} ${textLines[0] || ''}`,
    ...textLines.slice(1).map((l) => `  ${l}`),
  ];
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

  let insertIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(LOG_LINE_REGEX);
    if (match) {
      const lineMinutes = Number(match[1]) * 60 + Number(match[2]);
      if (lineMinutes > entryMinutes) {
        insertIdx = i;
        break;
      }
    }
  }

  if (insertIdx !== -1) {
    lines.splice(insertIdx, 0, ...linesToInsert);
  } else {
    lines.push(...linesToInsert);
  }

  await writeFileAtomic(filePath, lines.join('\n') + '\n');
}

export async function renumberLog(spaceDir: string): Promise<number> {
  const { spaceDir: sDir, logDir } = resolveSpaceAndLogDir(spaceDir);
  const metaFile = path.join(sDir, 'meta.json');
  const meta = await readSpaceMeta(metaFile);

  let dayFiles: string[] = [];
  try {
    const items = await fs.readdir(logDir, { withFileTypes: true });
    dayFiles = items
      .filter((it) => it.isFile() && /^\d{4}-\d{2}-\d{2}\.md$/.test(it.name) && !it.name.endsWith('.tmp'))
      .map((it) => it.name)
      .sort();
  } catch {
    return meta.lastLogSeq ?? 0;
  }

  let maxSeq = meta.lastLogSeq ?? 0;
  const fileData: Array<{ fileName: string; filePath: string; lines: string[] }> = [];

  for (const f of dayFiles) {
    const filePath = path.join(logDir, f);
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(LOG_LINE_REGEX);
      if (m && m[3]) {
        const num = Number(m[3]);
        if (num > maxSeq) maxSeq = num;
      }
    }
    fileData.push({ fileName: f, filePath, lines });
  }

  for (const file of fileData) {
    let modified = false;
    for (let i = 0; i < file.lines.length; i++) {
      const m = file.lines[i].match(LOG_LINE_REGEX);
      if (m && !m[3]) {
        maxSeq++;
        const timePart = `${m[1]}:${m[2]}`;
        const text = m[4];
        file.lines[i] = `- ${timePart} #${maxSeq} ${text}`;
        modified = true;
      }
    }
    if (modified) {
      await writeFileAtomic(file.filePath, file.lines.join('\n'));
    }
  }

  meta.lastLogSeq = maxSeq;
  await writeSpaceMeta(metaFile, meta);
  return maxSeq;
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
