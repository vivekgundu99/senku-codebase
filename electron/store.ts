import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SenkuState, Workspace } from './types';

let stateCache: SenkuState | null = null;

function getDataDir(): string {
  return app.getPath('userData');
}

function getStatePath(): string {
  return path.join(getDataDir(), 'senku.json');
}

function createDefaultState(): SenkuState {
  const homePath = app.getPath('home');
  const defaultSpace: Workspace = {
    id: randomUUID(),
    name: 'Home',
    path: homePath,
    objective: 'Welcome to Senku Reborn',
    links: [],
    createdAt: Date.now(),
  };

  return {
    version: 4,
    activeSpaceId: defaultSpace.id,
    spaces: [defaultSpace],
    inbox: [],
    focus: {
      active: false,
      spaceId: defaultSpace.id,
      goal: '',
      startedAt: null,
      durationMinutes: 25,
    },
    logs: [],
    settings: {
      userName: 'Vivek',
    },
  };
}

function tryMigrateLegacy(): SenkuState | null {
  try {
    const dataDir = getDataDir();
    const wsFile = path.join(dataDir, 'workspaces.json');
    if (!fs.existsSync(wsFile)) return null;

    const raw = JSON.parse(fs.readFileSync(wsFile, 'utf8'));
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const spaces: Workspace[] = raw.map((item: any) => ({
      id: item.id || randomUUID(),
      name: item.name || 'Workspace',
      path: item.masterFolder || item.path || app.getPath('home'),
      objective: item.activeObjective || '',
      links: Array.isArray(item.pinnedLinks) ? item.pinnedLinks : [],
      createdAt: typeof item.createdAt === 'string' ? new Date(item.createdAt).getTime() : Date.now(),
    }));

    let userName = 'Vivek';
    const settingsFile = path.join(dataDir, 'settings.json');
    if (fs.existsSync(settingsFile)) {
      try {
        const s = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        if (s.userName) userName = s.userName;
      } catch {}
    }

    return {
      version: 4,
      activeSpaceId: spaces[0]?.id || null,
      spaces,
      inbox: [],
      focus: {
        active: false,
        spaceId: spaces[0]?.id || null,
        goal: '',
        startedAt: null,
        durationMinutes: 25,
      },
      logs: [],
      settings: { userName },
    };
  } catch (err) {
    console.warn('[store] Legacy migration skipped:', err);
    return null;
  }
}

export function loadState(): SenkuState {
  if (stateCache) return stateCache;

  const file = getStatePath();
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && Array.isArray(data.spaces)) {
        stateCache = data;
        return stateCache!;
      }
    } catch (err) {
      console.error('[store] Error reading senku.json, creating backup:', err);
      try {
        fs.copyFileSync(file, `${file}.bak-${Date.now()}`);
      } catch {}
    }
  }

  // Attempt migration from legacy senku files, else defaults
  const migrated = tryMigrateLegacy();
  stateCache = migrated || createDefaultState();
  saveState(stateCache);
  return stateCache;
}

export function saveState(patch: Partial<SenkuState>): SenkuState {
  const current = stateCache || loadState();
  const updated: SenkuState = {
    ...current,
    ...patch,
    settings: {
      ...current.settings,
      ...(patch.settings || {}),
    },
    focus: {
      ...current.focus,
      ...(patch.focus || {}),
    },
  };

  stateCache = updated;

  const file = getStatePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmp = path.join(dir, `senku.tmp.${randomUUID().slice(0, 6)}`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(updated, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
    console.error('[store] Error saving state:', err);
  }

  return updated;
}
