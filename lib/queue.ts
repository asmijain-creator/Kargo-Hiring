// In-process queue for AI scoring, so a bulk upload of 60 CVs returns immediately and
// candidates fill in as they're scored. State lives in memory: if the server restarts,
// use "Score all unscored" to pick up anything that was left.

const CONCURRENCY = 3;

interface QueueState {
  waiting: string[];
  running: Set<string>;
  worker: ((id: string) => Promise<void>) | null;
}

const g = globalThis as unknown as { __scoreQueue?: QueueState };
const state: QueueState = (g.__scoreQueue ??= { waiting: [], running: new Set(), worker: null });

export function setWorker(fn: (id: string) => Promise<void>) {
  state.worker = fn;
}

export function enqueue(ids: string[]) {
  for (const id of ids) {
    if (!state.running.has(id) && !state.waiting.includes(id)) state.waiting.push(id);
  }
  pump();
}

export function isPending(id: string) {
  return state.running.has(id) || state.waiting.includes(id);
}

export function pendingCount() {
  return state.running.size + state.waiting.length;
}

function pump() {
  const worker = state.worker;
  if (!worker) return;
  while (state.running.size < CONCURRENCY && state.waiting.length > 0) {
    const id = state.waiting.shift()!;
    state.running.add(id);
    worker(id)
      .catch((e) => console.error(`Scoring ${id} failed:`, e))
      .finally(() => {
        state.running.delete(id);
        pump();
      });
  }
}
