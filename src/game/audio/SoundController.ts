export type SoundKind = 'select' | 'pour' | 'invalid' | 'success';

type AudioContextConstructor = new () => AudioContext;

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

export class SoundController {
  private context: AudioContext | null = null;
  private enabledState: boolean;

  constructor(enabled = true) {
    this.enabledState = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabledState = enabled;
  }

  get enabled(): boolean {
    return this.enabledState;
  }

  play(kind: SoundKind): void {
    if (!this.enabledState) return;

    void this.playSafely(kind);
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

    const audioGlobal = globalThis as typeof globalThis & WebkitAudioGlobal;
    const AudioContextClass = globalThis.AudioContext ?? audioGlobal.webkitAudioContext;
    if (AudioContextClass === undefined) {
      throw new Error('Web Audio is unavailable');
    }

    this.context = new AudioContextClass();
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
