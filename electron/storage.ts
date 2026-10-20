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

export async function listNotes(notesDir: string): Promise<NoteFile[]> {
  try {
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
          });
        } catch {
          // Skip unreadable files
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

export async function createNote(notesDir: string, name: string): Promise<NoteFile> {
  const existing = (await listNotes(notesDir)).map((n) => n.name);
  const sanitized = sanitizeFileName(name);
  const finalName = uniqueName(sanitized, existing);
  const filePath = path.join(notesDir, `${finalName}.md`);

  await writeFileAtomic(filePath, '');
  const stat = await fs.stat(filePath);

  return {
    id: finalName,
    name: finalName,
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

  return {
    id,
    name: id,
    content,
    createdAt: stat.birthtimeMs,
    updatedAt: stat.mtimeMs,
  };
}

export async function renameNote(notesDir: string, id: string, newName: string): Promise<string> {
  const oldPath = path.join(notesDir, `${id}.md`);
  try {
    await fs.access(oldPath);
  } catch {
    throw new Error('Note not found.');
  }

  const sanitized = sanitizeFileName(newName);
  if (sanitized === id) {
    return id;
  }

  const allNotes = await listNotes(notesDir);
  const existingNames = allNotes
    .filter((n) => n.name.toLowerCase() !== id.toLowerCase())
    .map((n) => n.name);

  const finalName = uniqueName(sanitized, existingNames);
  if (finalName === id) {
    return id;
  }

  const newPath = path.join(notesDir, `${finalName}.md`);
  await fs.rename(oldPath, newPath);
  return finalName;
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
  const existing = (await listNotes(notesDir)).map((n) => n.name);
  const finalName = uniqueName(note.name, existing);
  const filePath = path.join(notesDir, `${finalName}.md`);

  await writeFileAtomic(filePath, note.content);
  const mtime = new Date(note.updatedAt || Date.now());
  const atime = new Date();
  await fs.utimes(filePath, atime, mtime).catch(() => undefined);

  const stat = await fs.stat(filePath);
  return {
    id: finalName,
    name: finalName,
    content: note.content,
    createdAt: stat.birthtimeMs,
    updatedAt: stat.mtimeMs,
  };
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

const LOG_LINE_REGEX = /^- (\d{2}):(\d{2}) (.+)$/;

export function parseLogFile(dateStr: string, fileText: string): LogEntry[] {
  const [y, m, d] = dateStr.split('-').map(Number);
  const lines = fileText.split(/\r?\n/);
  const entries: LogEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(LOG_LINE_REGEX);
    if (match) {
      const hh = Number(match[1]);
      const mm = Number(match[2]);
      const text = match[3];
      const createdAt = new Date(y, m - 1, d, hh, mm).getTime();
      entries.push({
        id: `${dateStr}:${i}`,
        seq: i,
        createdAt,
        text,
      });
    }
  }

  return entries;
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

export async function addLog(logDir: string, text: string, now = new Date()): Promise<LogEntry> {
  const singleLine = text.replace(/[\r\n]+/g, ' ').trim();
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
  // If file ended with empty trailing line, remove it for index calculation
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const newLine = `- ${timeStr} ${singleLine}`;
  lines.push(newLine);
  const lineIndex = lines.length - 1;

  await writeFileAtomic(filePath, lines.join('\n') + '\n');

  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = [now.getHours(), now.getMinutes()];

  return {
    id: `${dateStr}:${lineIndex}`,
    seq: lineIndex,
    createdAt: new Date(y, m - 1, d, hh, mm).getTime(),
    text: singleLine,
  };
}

export async function deleteLog(logDir: string, id: string): Promise<void> {
  const colonIdx = id.lastIndexOf(':');
  if (colonIdx === -1) return;

  const dateStr = id.slice(0, colonIdx);
  const targetIndex = parseInt(id.slice(colonIdx + 1), 10);
  if (Number.isNaN(targetIndex)) return;

  const filePath = path.join(logDir, `${dateStr}.md`);
  let current: string;
  try {
    current = await fs.readFile(filePath, 'utf8');
  } catch {
    return;
  }

  const lines = current.split(/\r?\n/);
  // Normalize trailing empty line
  const hasTrailingEmpty = lines.length > 0 && lines[lines.length - 1] === '';
  if (hasTrailingEmpty) {
    lines.pop();
  }

  if (targetIndex < 0 || targetIndex >= lines.length) {
    return;
  }

  // If the line at targetIndex doesn't match an entry line, do nothing
  if (!LOG_LINE_REGEX.test(lines[targetIndex])) {
    return;
  }

  lines.splice(targetIndex, 1);

  // If the file becomes empty/whitespace-only, delete the file
  const remainingText = lines.join('\n').trim();
  if (!remainingText) {
    await fs.rm(filePath, { force: true }).catch(() => undefined);
    return;
  }

  await writeFileAtomic(filePath, lines.join('\n') + '\n');
}

export async function restoreLog(logDir: string, entry: LogEntry): Promise<void> {
  const d = new Date(entry.createdAt);
  const dateStr = formatLocalDate(d);
  const timeStr = formatLocalTime(d);
  const entryMinutes = d.getHours() * 60 + d.getMinutes();
  const cleanText = entry.text.replace(/[\r\n]+/g, ' ').trim();
  const lineToInsert = `- ${timeStr} ${cleanText}`;
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
    lines.splice(insertIdx, 0, lineToInsert);
  } else {
    lines.push(lineToInsert);
  }

  await writeFileAtomic(filePath, lines.join('\n') + '\n');
}

// ---------------------------------------------------------------------------
// Launchpads
// ---------------------------------------------------------------------------

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
