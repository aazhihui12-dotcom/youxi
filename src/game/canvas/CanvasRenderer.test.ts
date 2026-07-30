import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QualityConfig } from './adaptiveQuality';
import { CanvasRenderer } from './CanvasRenderer';
import type { SceneRenderModel } from './renderModel';
import { computeResponsiveLayout } from './responsiveLayout';

interface FakeCanvas extends HTMLCanvasElement {
  readonly cacheId?: number;
}

function createContext(
  events: string[] = [],
  assignments: Array<{ property: string; value: unknown }> = [],
): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() };
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    setTransform: (...args) => events.push(`transform:${args.join(',')}`),
    clearRect: () => events.push('clear'),
    save: () => events.push('save'),
    restore: () => events.push('restore'),
    translate: () => events.push('translate'),
    rotate: () => events.push('rotate'),
    scale: () => events.push('scale'),
    drawImage: (source) =>
      events.push(`image:${String((source as FakeCanvas).cacheId ?? 'other')}`),
    beginPath: () => events.push('beginPath'),
    closePath: () => events.push('closePath'),
    moveTo: () => events.push('moveTo'),
    lineTo: () => events.push('lineTo'),
    quadraticCurveTo: () => events.push('quadraticCurveTo'),
    roundRect: () => events.push('roundRect'),
    rect: () => events.push('rect'),
    ellipse: () => events.push('ellipse'),
    arc: () => events.push('arc'),
    clip: () => events.push('clip'),
    fill: () => events.push('fill'),
    stroke: () => events.push('stroke'),
    fillRect: () => events.push('fillRect'),
    strokeRect: () => events.push('strokeRect'),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  };

  return new Proxy(methods, {
    set(target, property, value) {
      assignments.push({ property: String(property), value });
      return Reflect.set(target, property, value);
    },
  }) as unknown as CanvasRenderingContext2D;
}

function createTargetCanvas(
  context = createContext(),
): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    style: { width: '', height: '' },
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
}

function installDocumentCanvasFallback(
  assignments: Array<{ property: string; value: unknown }> = [],
) {
  let nextId = 0;
  const createElement = vi.fn(() => {
    const canvas = {
      cacheId: nextId,
      width: 0,
      height: 0,
      getContext: () => createContext([], assignments),
    } as unknown as FakeCanvas;
    nextId += 1;
    return canvas;
  });
  vi.stubGlobal('document', { createElement });
  vi.stubGlobal('OffscreenCanvas', undefined);
  return createElement;
}

const HIGH_QUALITY: QualityConfig = {
  level: 'high',
  maxPixelRatio: 2,
  glow: true,
  confettiCount: 32,
};

const LOW_QUALITY: QualityConfig = {
  level: 'low',
  maxPixelRatio: 1,
  glow: false,
  confettiCount: 12,
};

function createScene(
  quality: QualityConfig = HIGH_QUALITY,
  colors: SceneRenderModel['tubes'][number]['colors'] = ['pink'],
): SceneRenderModel {
  const layout = computeResponsiveLayout({
    width: 390,
    height: 500,
    tubeCount: 1,
  });
  return {
    quality,
    pour: null,
    tubes: [{
      index: 0,
      colors,
      layout: layout.tubes[0]!,
      selected: true,
      validTarget: false,
      completed: false,
      pressed: false,
    }],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CanvasRenderer', () => {
  it('separates CSS size from a capped backing size', () => {
    const context = createContext();
    const setTransform = vi.spyOn(context, 'setTransform');
    const canvas = createTargetCanvas(context);
    const renderer = new CanvasRenderer(canvas);

    renderer.resize(390, 500, 2);

    expect(canvas.width).toBe(780);
    expect(canvas.height).toBe(1000);
    expect(canvas.style.width).toBe('390px');
    expect(canvas.style.height).toBe('500px');
    expect(setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it.each([
    [0, 500, 1],
    [-1, 500, 1],
    [Number.NaN, 500, 1],
    [390, Number.POSITIVE_INFINITY, 1],
    [390, 500, 0],
    [390, 500, Number.NaN],
  ])('rejects invalid resize values (%s, %s, %s)', (width, height, ratio) => {
    const canvas = createTargetCanvas();
    const renderer = new CanvasRenderer(canvas);

    expect(() => renderer.resize(width, height, ratio)).toThrow(RangeError);
    expect(canvas).toMatchObject({
      width: 0,
      height: 0,
      style: { width: '', height: '' },
    });
  });

  it('reuses cached bottle imagery and invalidates it explicitly or on resize', () => {
    const createElement = installDocumentCanvasFallback();
    const renderer = new CanvasRenderer(createTargetCanvas());
    const scene = createScene();
    renderer.resize(390, 500, 2);

    renderer.render(scene);
    const initialCreations = createElement.mock.calls.length;
    renderer.render(scene);
    renderer.resize(390, 500, 2);
    renderer.render(scene);
    expect(initialCreations).toBeGreaterThan(0);
    expect(createElement).toHaveBeenCalledTimes(initialCreations);

    renderer.clearCache();
    renderer.render(scene);
    expect(createElement.mock.calls.length).toBeGreaterThan(initialCreations);
    const afterExplicitClear = createElement.mock.calls.length;

    renderer.resize(391, 500, 2);
    renderer.render(scene);
    expect(createElement.mock.calls.length).toBeGreaterThan(afterExplicitClear);
  });

  it('keys cached imagery by quality level and color sequence', () => {
    const createElement = installDocumentCanvasFallback();
    const renderer = new CanvasRenderer(createTargetCanvas());
    renderer.resize(390, 500, 1);

    renderer.render(createScene(HIGH_QUALITY, ['pink']));
    const pinkHighCreations = createElement.mock.calls.length;
    renderer.render(createScene(HIGH_QUALITY, ['pink']));
    expect(createElement).toHaveBeenCalledTimes(pinkHighCreations);

    renderer.render(createScene(HIGH_QUALITY, ['blue']));
    expect(createElement.mock.calls.length).toBeGreaterThan(pinkHighCreations);
    const blueHighCreations = createElement.mock.calls.length;

    renderer.render(createScene(LOW_QUALITY, ['blue']));
    expect(createElement.mock.calls.length).toBeGreaterThan(blueHighCreations);
  });

  it('uses document canvas fallback when OffscreenCanvas is unavailable', () => {
    const createElement = installDocumentCanvasFallback();
    const renderer = new CanvasRenderer(createTargetCanvas());
    renderer.resize(390, 500, 1);

    renderer.render(createScene());

    expect(createElement).toHaveBeenCalledWith('canvas');
  });

  it('uses shadow blur for glow-enabled quality only', () => {
    const highAssignments: Array<{ property: string; value: unknown }> = [];
    installDocumentCanvasFallback(highAssignments);
    const highRenderer = new CanvasRenderer(
      createTargetCanvas(createContext([], highAssignments)),
    );
    highRenderer.resize(390, 500, 1);
    highRenderer.render(createScene(HIGH_QUALITY));

    expect(highAssignments).toContainEqual({
      property: 'shadowBlur',
      value: expect.any(Number),
    });

    vi.unstubAllGlobals();
    const lowAssignments: Array<{ property: string; value: unknown }> = [];
    installDocumentCanvasFallback(lowAssignments);
    const lowRenderer = new CanvasRenderer(
      createTargetCanvas(createContext([], lowAssignments)),
    );
    lowRenderer.resize(390, 500, 1);
    lowRenderer.render(createScene(LOW_QUALITY));

    expect(lowAssignments.some(({ property }) => property === 'shadowBlur')).toBe(false);
  });

  it('clears once and paints background, all shadows, liquids, glass, states, then pour', () => {
    const events: string[] = [];
    installDocumentCanvasFallback();
    const renderer = new CanvasRenderer(
      createTargetCanvas(createContext(events)),
    );
    renderer.resize(390, 500, 1);
    events.length = 0;

    const first = createScene();
    const layout = computeResponsiveLayout({
      width: 390,
      height: 500,
      tubeCount: 2,
    });
    const model: SceneRenderModel = {
      quality: HIGH_QUALITY,
      tubes: [
        { ...first.tubes[0]!, layout: layout.tubes[0]! },
        {
          ...first.tubes[0]!,
          index: 1,
          colors: ['blue'],
          layout: layout.tubes[1]!,
          selected: false,
          validTarget: true,
        },
      ],
      pour: {
        from: 0,
        to: 1,
        color: 'pink',
        sourceX: 120,
        sourceY: 160,
        rotation: 0.8,
        streamProgress: 0.5,
        liquidProgress: 0.4,
        rippleProgress: 0.2,
        done: false,
      },
    };

    renderer.render(model);

    expect(events.filter((event) => event === 'clear')).toHaveLength(1);
    const clearIndex = events.indexOf('clear');
    const backgroundIndex = events.indexOf('fillRect');
    const ellipseIndexes = events
      .map((event, index) => event === 'ellipse' ? index : -1)
      .filter((index) => index >= 0);
    const liquid0Index = events.indexOf('image:0');
    const liquid1Index = events.indexOf('image:1');
    const glass0Index = events.indexOf('image:2');
    const glass1Index = events.indexOf('image:3');
    const stateIndex = events.indexOf('stroke');
    const pourIndex = events.indexOf('translate');

    expect(clearIndex).toBeLessThan(backgroundIndex);
    expect(backgroundIndex).toBeLessThan(ellipseIndexes[0]!);
    expect(ellipseIndexes[1]!).toBeLessThan(liquid0Index);
    expect(liquid0Index).toBeLessThan(liquid1Index);
    expect(liquid1Index).toBeLessThan(glass0Index);
    expect(glass0Index).toBeLessThan(glass1Index);
    expect(glass1Index).toBeLessThan(stateIndex);
    expect(stateIndex).toBeLessThan(pourIndex);
  });
});
