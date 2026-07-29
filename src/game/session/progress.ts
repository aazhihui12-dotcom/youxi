const PROGRESS_KEY = 'water-sort-progress';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ProgressData {
  version: 1;
  currentLevel: number;
  bestMoves: Record<string, number>;
  soundEnabled: boolean;
}

function createDefaultProgress(): ProgressData {
  return {
    version: 1,
    currentLevel: 1,
    bestMoves: {},
    soundEnabled: true,
  };
}

function isValidProgress(value: unknown): value is ProgressData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  const bestMoves = candidate.bestMoves;
  return candidate.version === 1
    && Number.isInteger(candidate.currentLevel)
    && (candidate.currentLevel as number) >= 1
    && (candidate.currentLevel as number) <= 8
    && typeof candidate.soundEnabled === 'boolean'
    && typeof bestMoves === 'object'
    && bestMoves !== null
    && !Array.isArray(bestMoves)
    && Object.values(bestMoves).every(
      (moves) => Number.isInteger(moves) && (moves as number) > 0,
    );
}

export function loadProgress(storage: StorageLike): ProgressData {
  try {
    const serialized = storage.getItem(PROGRESS_KEY);
    if (serialized === null) return createDefaultProgress();

    const parsed: unknown = JSON.parse(serialized);
    if (!isValidProgress(parsed)) return createDefaultProgress();

    return {
      version: 1,
      currentLevel: parsed.currentLevel,
      bestMoves: { ...parsed.bestMoves },
      soundEnabled: parsed.soundEnabled,
    };
  } catch {
    return createDefaultProgress();
  }
}

export function saveProgress(storage: StorageLike, progress: ProgressData): void {
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Persistence is optional; gameplay must continue when storage is unavailable.
  }
}
