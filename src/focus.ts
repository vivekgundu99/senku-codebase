import { state } from './state';
import { toast } from './toast';
import type { FocusSession } from '../electron/types';

export type LoadFn = (path?: string) => Promise<void>;
export type RenderFn = () => void;

let timerInterval: NodeJS.Timeout | null = null;
let currentRemainingSec = 0;

export function getRemainingSeconds(): number {
  return currentRemainingSec;
}

export function formatTimerSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function initFocusTimer(render: RenderFn): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const session = state.activeSession;
  if (!session || session.state !== 'running') {
    currentRemainingSec = 0;
    return;
  }

  const totalSec = session.durationMinutes * 60;
  const elapsedSec = Math.floor((Date.now() - session.startedAt) / 1000);
  currentRemainingSec = Math.max(0, totalSec - elapsedSec);

  timerInterval = setInterval(() => {
    if (!state.activeSession || state.activeSession.state !== 'running') {
      if (timerInterval) clearInterval(timerInterval);
      return;
    }

    const elapsed = Math.floor((Date.now() - state.activeSession.startedAt) / 1000);
    const left = Math.max(0, totalSec - elapsed);
    currentRemainingSec = left;

    // Update timer display in DOM directly without full re-render for 60fps smoothness
    const timerDisplay = document.querySelector<HTMLElement>('#topbar-focus-countdown');
    if (timerDisplay) {
      timerDisplay.textContent = formatTimerSeconds(left);
    }

    if (left <= 0) {
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      void handleSessionFinished(state.activeSession, render);
    }
  }, 1000);
}

async function handleSessionFinished(session: FocusSession, render: RenderFn): Promise<void> {
  await window.senku.stopFocus('completed');
  toast('🎉 Focus session complete! Log your milestone.');
  render();
}

export async function startFocusSession(durationMin: number, objective?: string, load?: LoadFn, render?: RenderFn): Promise<void> {
  const currentSpaceId = state.workspace?.id;
  const snap = await window.senku.startFocus(durationMin, objective || state.workspace?.activeObjective, currentSpaceId);
  if (load) await load();
  if (render) {
    initFocusTimer(render);
    render();
  }
  toast(`Started ${durationMin}m focus block`);
}

export async function stopFocusSession(status: 'completed' | 'cancelled', load?: LoadFn, render?: RenderFn): Promise<void> {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  await window.senku.stopFocus(status);
  if (status === 'completed') {
    toast('Session marked complete.');
  } else {
    toast('Session stopped.');
  }
  if (load) await load();
  if (render) render();
}
