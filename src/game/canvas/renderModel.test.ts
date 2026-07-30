import { describe, expect, it } from 'vitest';
import { computeResponsiveLayout } from './responsiveLayout';
import { buildSceneRenderModel } from './renderModel';

describe('buildSceneRenderModel', () => {
  it('marks selection, valid target, completion, and press independently', () => {
    const layout = computeResponsiveLayout({
      width: 366,
      height: 540,
      tubeCount: 3,
    });
    const model = buildSceneRenderModel({
      board: [['pink'], ['pink', 'pink', 'pink', 'pink'], []],
      selectedTube: 0,
      validTargets: new Set([2]),
      pressedTube: 2,
      layout,
      quality: {
        level: 'high',
        maxPixelRatio: 2,
        glow: true,
        confettiCount: 32,
      },
      pour: null,
    });

    expect(model.tubes[0]).toMatchObject({ selected: true });
    expect(model.tubes[1]).toMatchObject({ completed: true });
    expect(model.tubes[2]).toMatchObject({ validTarget: true, pressed: true });
  });

  it('uses layout order, defaults a missing board tube, and preserves scene inputs', () => {
    const layout = computeResponsiveLayout({
      width: 390,
      height: 500,
      tubeCount: 2,
    });
    const quality = {
      level: 'balanced' as const,
      maxPixelRatio: 1.5,
      glow: false,
      confettiCount: 20,
    };
    const pour = {
      from: 0,
      to: 1,
      color: 'mint' as const,
      sourceX: 80,
      sourceY: 100,
      rotation: 0.5,
      streamProgress: 0.4,
      liquidProgress: 0.25,
      rippleProgress: 0,
      done: false,
    };

    const model = buildSceneRenderModel({
      board: [['mint', 'mint', 'mint', 'mint']],
      selectedTube: null,
      validTargets: new Set(),
      pressedTube: null,
      layout,
      quality,
      pour,
    });

    expect(model.tubes).toHaveLength(2);
    expect(model.tubes[0]).toMatchObject({
      index: 0,
      colors: ['mint', 'mint', 'mint', 'mint'],
      layout: layout.tubes[0],
      completed: true,
    });
    expect(model.tubes[1]).toMatchObject({
      index: 1,
      colors: [],
      layout: layout.tubes[1],
      completed: false,
    });
    expect(model.quality).toBe(quality);
    expect(model.pour).toBe(pour);
  });

  it('only marks exactly four matching colors as completed', () => {
    const layout = computeResponsiveLayout({
      width: 390,
      height: 500,
      tubeCount: 3,
    });
    const model = buildSceneRenderModel({
      board: [
        ['blue', 'blue', 'blue'],
        ['blue', 'blue', 'blue', 'pink'],
        ['blue', 'blue', 'blue', 'blue', 'blue'],
      ],
      selectedTube: null,
      validTargets: new Set(),
      pressedTube: null,
      layout,
      quality: {
        level: 'low',
        maxPixelRatio: 1,
        glow: false,
        confettiCount: 12,
      },
      pour: null,
    });

    expect(model.tubes.map(({ completed }) => completed)).toEqual([
      false,
      false,
      false,
    ]);
  });
});
