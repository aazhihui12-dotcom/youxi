import { describe, expect, it } from 'vitest';
import { AdaptiveQuality } from './adaptiveQuality';

describe('AdaptiveQuality', () => {
  it('starts at high with a pixel ratio capped at two', () => {
    expect(new AdaptiveQuality(3).config).toEqual({
      level: 'high',
      maxPixelRatio: 2,
      glow: true,
      confettiCount: 32,
    });
  });

  it('only downgrades when sampled frames are slow', () => {
    const quality = new AdaptiveQuality(3);
    Array.from({ length: 12 }, () => quality.observeFrame(22));
    expect(quality.config.level).toBe('balanced');
    Array.from({ length: 12 }, () => quality.observeFrame(28));
    expect(quality.config.level).toBe('low');
    Array.from({ length: 12 }, () => quality.observeFrame(12));
    expect(quality.config.level).toBe('low');
  });
});
