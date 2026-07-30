export type SoundKind = 'select' | 'pour' | 'invalid' | 'success';

type AudioContextConstructor = new () => AudioContext;
type AudioContextFactory = () => AudioContext;

interface WebkitAudioGlobal {
  webkitAudioContext?: AudioContextConstructor;
}

interface Note {
  frequency: number;
  durationMs: number;
  startOffsetMs?: number;
  endFrequency?: number;
  type: OscillatorType;
  gain: number;
}

function createBrowserAudioContext(): AudioContext {
  const audioGlobal = globalThis as typeof globalThis & WebkitAudioGlobal;
  const AudioContextClass = globalThis.AudioContext ?? audioGlobal.webkitAudioContext;
  if (AudioContextClass === undefined) {
    throw new Error('Web Audio is unavailable');
  }

  return new AudioContextClass();
}

export class SoundController {
  private context: AudioContext | null = null;
  private enabledState: boolean;
  private disposed = false;
  private disposal: Promise<void> | null = null;

  constructor(
    enabled = true,
    private readonly contextFactory: AudioContextFactory = createBrowserAudioContext,
  ) {
    this.enabledState = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabledState = enabled;
  }

  get enabled(): boolean {
    return this.enabledState;
  }

  play(kind: SoundKind): void {
    if (!this.enabledState || this.disposed) return;

    void this.playSafely(kind);
  }

  dispose(): Promise<void> {
    if (this.disposal !== null) return this.disposal;

    this.disposed = true;
    this.enabledState = false;
    const context = this.context;
    this.context = null;
    this.disposal = (async () => {
      if (context === null) return;

      try {
        await context.close();
      } catch {
        // Audio cleanup must never interrupt scene shutdown.
      }
    })();
    return this.disposal;
  }

  private async playSafely(kind: SoundKind): Promise<void> {
    try {
      const context = this.getOrCreateContext();
      if (context.state === 'suspended') {
        await context.resume();
      }
      if (context.state !== 'running') {
        throw new Error('Audio context is not running');
      }

      for (const note of this.getNotes(kind)) {
        this.scheduleNote(context, note);
      }
    } catch {
      this.enabledState = false;
    }
  }

  private getOrCreateContext(): AudioContext {
    if (this.context !== null) return this.context;
    if (this.disposed) {
      throw new Error('Sound controller has been disposed');
    }

    this.context = this.contextFactory();
    return this.context;
  }

  private getNotes(kind: SoundKind): Note[] {
    switch (kind) {
      case 'select':
        return [{
          frequency: 620,
          durationMs: 55,
          type: 'sine',
          gain: 0.06,
        }];
      case 'pour':
        return [{
          frequency: 430,
          endFrequency: 260,
          durationMs: 280,
          type: 'sine',
          gain: 0.055,
        }];
      case 'invalid':
        return [{
          frequency: 150,
          durationMs: 70,
          type: 'square',
          gain: 0.022,
        }];
      case 'success':
        return [523, 659, 784].map((frequency, index) => ({
          frequency,
          durationMs: 110,
          startOffsetMs: index * 110,
          type: 'sine',
          gain: 0.065,
        }));
    }
  }

  private scheduleNote(context: AudioContext, note: Note): void {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const start = context.currentTime + (note.startOffsetMs ?? 0) / 1_000;
    const attackEnd = start + Math.min(0.012, note.durationMs / 4_000);
    const end = start + note.durationMs / 1_000;

    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, start);
    if (note.endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(note.endFrequency, end);
    }

    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(note.gain, attackEnd);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.addEventListener('ended', () => {
      try {
        oscillator.disconnect();
        envelope.disconnect();
      } catch {
        this.enabledState = false;
      }
    }, { once: true });
    oscillator.start(start);
    oscillator.stop(end);
  }
}
