export type AnalyticsEvent =
  | 'game_loaded'
  | 'first_interaction'
  | 'level_started'
  | 'level_completed'
  | 'restart_clicked'
  | 'undo_clicked';

export interface AnalyticsAdapter {
  track(
    event: AnalyticsEvent,
    payload?: Record<string, string | number | boolean>,
  ): void;
}

export class NoopAnalyticsAdapter implements AnalyticsAdapter {
  track(
    _event: AnalyticsEvent,
    _payload?: Record<string, string | number | boolean>,
  ): void {}
}

export function createSafeAnalytics(delegate: AnalyticsAdapter): AnalyticsAdapter {
  return {
    track(event, payload) {
      try {
        delegate.track(event, payload);
      } catch {
        // Analytics failures must not interrupt gameplay.
      }
    },
  };
}
