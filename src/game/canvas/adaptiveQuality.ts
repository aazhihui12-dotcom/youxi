export type QualityLevel = 'high' | 'balanced' | 'low';

export interface QualityConfig {
  level: QualityLevel;
  maxPixelRatio: number;
  glow: boolean;
  confettiCount: number;
}

const CONFIGS: Record<QualityLevel, QualityConfig> = {
  high: { level: 'high', maxPixelRatio: 2, glow: true, confettiCount: 32 },
  balanced: {
    level: 'balanced',
    maxPixelRatio: 1.5,
    glow: false,
    confettiCount: 20,
  },
  low: { level: 'low', maxPixelRatio: 1, glow: false, confettiCount: 12 },
};

export class AdaptiveQuality {
  private samples: number[] = [];
  private current: QualityLevel = 'high';

  constructor(private readonly devicePixelRatio: number) {}

  get config(): QualityConfig {
    const config = CONFIGS[this.current];
    return {
      ...config,
      maxPixelRatio: Math.min(config.maxPixelRatio, Math.max(1, this.devicePixelRatio)),
    };
  }

  observeFrame(deltaMs: number): QualityConfig {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return this.config;

    this.samples.push(deltaMs);
    if (this.samples.length > 12) this.samples.shift();
    if (this.samples.length < 12) return this.config;

    const average = this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length;
    if (average > 26) this.current = 'low';
    else if (average > 20 && this.current === 'high') this.current = 'balanced';

    return this.config;
  }
}
