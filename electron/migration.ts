import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { LogEntry, NoteFile, Settings, Workspace } from './types';
import { migrateLegacy } from './storage';

export async function migrateLegacyData(
  userData: string,
  workspaces: Workspace[],
  settings: Settings,
  activeId: string | null,
  readJson: <T>(file: string, fallback: T) => Promise<T>,
): Promise<void> {
  const markerFile = path.join(userData, 'storage-version.json');
  try {
    await fs.access(markerFile);
    return; // Already migrated
  } catch {
    // Proceed
  }

  if (workspaces.length === 0) {
    return; // Zero spaces -> do nothing, do not write marker
  }

  // Backup first: copy legacy data files into <userData>/backup-before-md/
  const backupDir = path.join(userData, 'backup-before-md');
  await fs.mkdir(backupDir, { recursive: true });

  const candidateDirs = [path.join(userData, 'data'), userData];
  const legacyFiles = [
    'notes.json',
    'log.json',
    'launchpads.json',
    'trash-workspaces.json',
    'workspaces.json',
    'settings.json',
  ];

  for (const dir of candidateDirs) {
    for (const file of legacyFiles) {
      const src = path.join(dir, file);
      const dest = path.join(backupDir, file);
      try {
        await fs.access(src);
        const alreadyBackedUp = await fs.access(dest).then(() => true).catch(() => false);
        if (!alreadyBackedUp) {
          await fs.copyFile(src, dest);
        }
      } catch {
        // File does not exist
      }
    }
  }

  // Read legacy data
  let legacyNotes: NoteFile[] = [];
  let legacyLogs: LogEntry[] = [];

  for (const dir of candidateDirs) {
    if (legacyNotes.length === 0) {
      legacyNotes = await readJson<NoteFile[]>(path.join(dir, 'notes.json'), []);
    }
    if (legacyLogs.length === 0) {
      legacyLogs = await readJson<LogEntry[]>(path.join(dir, 'log.json'), []);
    }
  }

  await migrateLegacy(
    userData,
    {
      notes: legacyNotes,
      logEntries: legacyLogs,
      legacyActiveNoteId: settings.activeNoteId,
    },
    workspaces,
    activeId,
  );
}
