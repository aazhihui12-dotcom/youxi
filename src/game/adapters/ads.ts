export type AdPlacement = 'level-complete' | 'extra-tube';
export type AdResult = 'completed' | 'unavailable';

export interface AdAdapter {
  showInterstitial(placement: AdPlacement): Promise<AdResult>;
  showRewarded(placement: AdPlacement): Promise<AdResult>;
}

export class NoopAdAdapter implements AdAdapter {
  async showInterstitial(_placement: AdPlacement): Promise<AdResult> {
    return 'unavailable';
  }

  async showRewarded(_placement: AdPlacement): Promise<AdResult> {
    return 'unavailable';
  }
}

async function safelyShow(show: () => Promise<AdResult>): Promise<AdResult> {
  try {
    return await show();
  } catch {
    return 'unavailable';
  }
}

export function createSafeAds(delegate: AdAdapter): AdAdapter {
  return {
    showInterstitial(placement) {
      return safelyShow(() => delegate.showInterstitial(placement));
    },
    showRewarded(placement) {
      return safelyShow(() => delegate.showRewarded(placement));
    },
  };
}
