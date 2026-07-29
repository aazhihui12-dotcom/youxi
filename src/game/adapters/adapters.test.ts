import { describe, expect, it } from 'vitest';

import {
  createSafeAds,
  NoopAdAdapter,
} from './ads';
import {
  createSafeAnalytics,
  NoopAnalyticsAdapter,
} from './analytics';

describe('platform adapters', () => {
  it('provides analytics and ad no-ops', async () => {
    expect(() => new NoopAnalyticsAdapter().track('game_loaded')).not.toThrow();
    await expect(new NoopAdAdapter().showInterstitial('level-complete')).resolves.toBe('unavailable');
    await expect(new NoopAdAdapter().showRewarded('extra-tube')).resolves.toBe('unavailable');
  });

  it('swallows synchronous analytics delegate failures', () => {
    const safeAnalytics = createSafeAnalytics({
      track: () => {
        throw new Error('offline');
      },
    });

    expect(() => safeAnalytics.track('game_loaded')).not.toThrow();
  });

  it('maps synchronous ad throws and rejected promises to unavailable', async () => {
    const safeAds = createSafeAds({
      showInterstitial: () => {
        throw new Error('offline');
      },
      showRewarded: async () => {
        throw new Error('offline');
      },
    });

    await expect(safeAds.showInterstitial('level-complete')).resolves.toBe('unavailable');
    await expect(safeAds.showRewarded('extra-tube')).resolves.toBe('unavailable');
  });

  it('preserves successful ad delegate results', async () => {
    const safeAds = createSafeAds({
      showInterstitial: async () => 'completed',
      showRewarded: async () => 'unavailable',
    });

    await expect(safeAds.showInterstitial('level-complete')).resolves.toBe('completed');
    await expect(safeAds.showRewarded('extra-tube')).resolves.toBe('unavailable');
  });
});
