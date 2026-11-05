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
    createdAt: Date.now(),
  };

  return {
    version: 4,
    activeSpaceId: defaultSpace.id,
    spaces: [defaultSpace],
    focus: {
      mode: 'work',
      active: false,
      paused: false,
      remainingSeconds: 30 * 60,
      goal: '',
      startedAt: null,
      durationMinutes: 30,
      history: [],
    },
    settings: {},
  };
}

export function loadState(): SenkuState {
  if (stateCache) return stateCache;

  const file = getStatePath();
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && Array.isArray(data.spaces)) {
        if (!data.focus) {
          data.focus = {
            mode: 'work',
            active: false,
            paused: false,
            remainingSeconds: 30 * 60,
            goal: '',
            startedAt: null,
            durationMinutes: 30,
            history: [],
          };
        } else {
          if (!data.focus.mode) data.focus.mode = 'work';
          if (!Array.isArray(data.focus.history)) {
            data.focus.history = [];
          }
        }
        if (!data.settings) data.settings = {};
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

  stateCache = createDefaultState();
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
