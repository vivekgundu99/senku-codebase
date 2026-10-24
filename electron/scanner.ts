import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { FileEntry } from './types';

export function isInside(masterFolder: string, target: string): boolean {
  const master = path.resolve(masterFolder).toLowerCase();
  const resolved = path.resolve(target).toLowerCase();
  return resolved === master || resolved.startsWith(`${master}${path.sep}`);
}

export function isDriveOrSystemRoot(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  if (resolved.toLowerCase() === parsed.root.toLowerCase()) return true;
  const normalized = resolved.replace(/[\\/]+$/, '').toLowerCase();
  if (/^[a-z]:$/i.test(normalized)) return true;
  const sysRoots = ['c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\programdata', 'c:\\users'];
  if (sysRoots.some((s) => normalized === s)) return true;
  return false;
}

export function isIgnoredEntry(name: string): boolean {
  const lower = name.toLowerCase();

  // OS & system metadata
  if (
    lower === 'desktop.ini' ||
    lower === 'thumbs.db' ||
    lower === 'ehthumbs.db' ||
    lower === '$recycle.bin' ||
    lower === 'system volume information' ||
    lower === '.ds_store'
  ) {
    return true;
  }

  // Office lock/owner files: ~$Document.docx, ~$Book.xlsx
  if (lower.startsWith('~$')) return true;

  // Temp working files: ~WRL0001.tmp, any .tmp file
  if (lower.startsWith('~') && lower.endsWith('.tmp')) return true;
  if (lower.endsWith('.tmp')) return true;

  // Google Drive & Cloud sync temporary download/upload markers
  if (lower.includes('.tmp.drive') || lower.endsWith('.tmp.driveupload') || lower.endsWith('.tmp.drivedownload')) {
    return true;
  }

  // Incomplete browser downloads
  if (lower.endsWith('.crdownload') || lower.endsWith('.part')) {
    return true;
  }

  return false;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

const listCache = new Map<string, { mtimeMs: number; at: number; entries: FileEntry[] }>();

export async function readFolderEntries(dir: string): Promise<FileEntry[]> {
  const dirStat = await fs.stat(dir);
  const cached = listCache.get(dir);
  if (cached && cached.mtimeMs === dirStat.mtimeMs && Date.now() - cached.at < 15_000) return cached.entries;

  const items = (await fs.readdir(dir, { withFileTypes: true })).filter(
    (item) => !isIgnoredEntry(item.name),
  );

  const found = await mapLimit(items, 48, async (item): Promise<FileEntry | null> => {
    const itemPath = path.join(dir, item.name);
    try {
      const stats = await fs.stat(itemPath);
      const isFolder = stats.isDirectory();
      return {
        name: item.name,
        path: itemPath,
        kind: isFolder ? 'folder' : 'file',
        extension: isFolder ? '' : path.extname(item.name).slice(1).toUpperCase(),
        size: isFolder ? undefined : stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  });

  const entries = found.filter((entry): entry is FileEntry => entry !== null);
  listCache.set(dir, { mtimeMs: dirStat.mtimeMs, at: Date.now(), entries });
  if (listCache.size > 20) listCache.delete(listCache.keys().next().value as string);
  return entries;
}

export async function listFolder(
  masterFolder: string,
  currentPath: string,
  pinnedPaths: string[],
): Promise<FileEntry[]> {
  if (!masterFolder || !isInside(masterFolder, currentPath)) return [];

  try {
    const pinned = new Set(pinnedPaths);
    const entries = (await readFolderEntries(currentPath)).map((entry) => ({ ...entry, pinned: pinned.has(entry.path) }));

    return entries.sort((a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      Number(b.kind === 'folder') - Number(a.kind === 'folder') ||
      collator.compare(a.name, b.name),
    );
  } catch {
    return [];
  }
}

export async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

// Lazy cached check so network drives / unmounted drives don't lag Senku
const availabilityCache = new Map<string, { ok: boolean; at: number }>();
export async function isDirectoryCached(id: string, folder: string): Promise<boolean> {
  const cached = availabilityCache.get(id);
  if (cached && Date.now() - cached.at < 20_000) return cached.ok;
  const ok = await isDirectory(folder);
  availabilityCache.set(id, { ok, at: Date.now() });
  return ok;
}
