import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QualityConfig } from './adaptiveQuality';
import { CanvasRenderer } from './CanvasRenderer';
import type { SceneRenderModel } from './renderModel';
import { computeResponsiveLayout } from './responsiveLayout';

interface FakeCanvas extends HTMLCanvasElement {
  readonly cacheId?: number;
}

interface CanvasObservations {
  drawImages: Array<{ source: CanvasImageSource; args: readonly number[] }>;
  moveTos: Array<{ x: number; y: number }>;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
}

function createContext(
  events: string[] = [],
  assignments: Array<{ property: string; value: unknown }> = [],
  observations?: CanvasObservations,
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
    drawImage: (source, ...args) => {
      events.push(`image:${String((source as FakeCanvas).cacheId ?? 'other')}`);
      observations?.drawImages.push({
        source: source as CanvasImageSource,
        args: args as number[],
      });
    },
    beginPath: () => events.push('beginPath'),
    closePath: () => events.push('closePath'),
    moveTo: (x, y) => {
      events.push('moveTo');
      observations?.moveTos.push({ x: Number(x), y: Number(y) });
    },
    lineTo: () => events.push('lineTo'),
    quadraticCurveTo: () => events.push('quadraticCurveTo'),
    roundRect: () => events.push('roundRect'),
    rect: (x, y, width, height) => {
      events.push('rect');
      observations?.rects.push({
        x: Number(x),
        y: Number(y),
        width: Number(width),
        height: Number(height),
      });
    },
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

function createObservations(): CanvasObservations {
  return {
    drawImages: [],
    moveTos: [],
    rects: [],
  };
}

function createPourScene(input: {
  from?: 0 | 1;
  liquidProgress: number;
  rotation?: number;
  streamProgress?: number;
}): SceneRenderModel {
  const from = input.from ?? 0;
  const to = from === 0 ? 1 : 0;
  const layouts = [100, 300].map((centerX) => ({
    centerX,
    centerY: 200,
    visualWidth: 60,
    visualHeight: 180,
    hitRect: {
      x: centerX - 40,
      y: 100,
      width: 80,
      height: 200,
    },
  }));
  const sourceColors = ['blue', 'pink', 'pink'] as const;
  const targetColors = ['pink'] as const;

  return {
    quality: LOW_QUALITY,
    tubes: [0, 1].map((index) => ({
      index,
      colors: index === from ? sourceColors : targetColors,
      layout: layouts[index]!,
      selected: false,
      validTarget: false,
      completed: false,
      pressed: false,
    })),
    pour: {
      from,
      to,
      color: 'pink',
      sourceX: layouts[from]!.centerX,
      sourceY: 150,
      rotation: input.rotation ?? 0,
      streamProgress: input.streamProgress ?? 0,
      liquidProgress: input.liquidProgress,
      rippleProgress: 0,
      done: false,
    },
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

  it('reuses glass across color sequences and liquid across quality levels', () => {
    const createElement = installDocumentCanvasFallback();
    const renderer = new CanvasRenderer(createTargetCanvas());
    renderer.resize(390, 500, 1);

    renderer.render(createScene(HIGH_QUALITY, ['pink']));
    expect(createElement).toHaveBeenCalledTimes(2);
    renderer.render(createScene(HIGH_QUALITY, ['pink']));
    expect(createElement).toHaveBeenCalledTimes(2);

    renderer.render(createScene(HIGH_QUALITY, ['blue']));
    expect(createElement).toHaveBeenCalledTimes(3);

    renderer.render(createScene(LOW_QUALITY, ['blue']));
    expect(createElement).toHaveBeenCalledTimes(4);
  });

  it('retains at most the 24 most recently used liquid sequences', () => {
    const createElement = installDocumentCanvasFallback();
    const renderer = new CanvasRenderer(createTargetCanvas());
    const sequences = [
      ['pink'],
      ['yellow'],
      ['mint'],
      ['blue'],
      ['purple'],
      ['orange'],
      ['pink', 'pink'],
      ['pink', 'yellow'],
      ['pink', 'mint'],
      ['pink', 'blue'],
      ['pink', 'purple'],
      ['pink', 'orange'],
      ['yellow', 'pink'],
      ['yellow', 'yellow'],
      ['yellow', 'mint'],
      ['yellow', 'blue'],
      ['yellow', 'purple'],
      ['yellow', 'orange'],
      ['mint', 'pink'],
      ['mint', 'yellow'],
      ['mint', 'mint'],
      ['mint', 'blue'],
      ['mint', 'purple'],
      ['mint', 'orange'],
      ['blue', 'pink'],
    ] as const;
    renderer.resize(390, 500, 1);

    for (const colors of sequences) {
      renderer.render(createScene(HIGH_QUALITY, colors));
    }
    expect(createElement).toHaveBeenCalledTimes(26);

    for (const colors of sequences.slice(1)) {
      renderer.render(createScene(HIGH_QUALITY, colors));
    }
    expect(createElement).toHaveBeenCalledTimes(26);

    renderer.render(createScene(HIGH_QUALITY, sequences[0]));
    expect(createElement).toHaveBeenCalledTimes(27);
  });

  it('uses document canvas fallback when OffscreenCanvas is unavailable', () => {
    const createElement = installDocumentCanvasFallback();
    const renderer = new CanvasRenderer(createTargetCanvas());
    renderer.resize(390, 500, 1);

    renderer.render(createScene());

    expect(createElement).toHaveBeenCalledWith('canvas');
  });

  it.each(['construction', 'context'] as const)(
    'uses document canvas fallback when OffscreenCanvas %s fails',
    (failure) => {
      const createElement = vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: () => createContext(),
      }) as unknown as HTMLCanvasElement);
      class FailingOffscreenCanvas {
        constructor(_width: number, _height: number) {
          if (failure === 'construction') {
            throw new Error('OffscreenCanvas construction failed');
          }
        }

        getContext(): null {
          return null;
        }
      }
      vi.stubGlobal('document', { createElement });
      vi.stubGlobal('OffscreenCanvas', FailingOffscreenCanvas);
      const renderer = new CanvasRenderer(createTargetCanvas());
      renderer.resize(390, 500, 1);

      expect(() => renderer.render(createScene())).not.toThrow();
      expect(createElement).toHaveBeenCalledWith('canvas');
    },
  );

  it('renders when exposed OffscreenCanvas objects cannot be composited', () => {
    class PartialOffscreenCanvas {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}

      getContext(): CanvasRenderingContext2D {
        return createContext();
      }
    }
    vi.stubGlobal('OffscreenCanvas', PartialOffscreenCanvas);
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => createContext(),
      }),
    });
    const observations = createObservations();
    const context = createContext([], [], observations);
    context.drawImage = (
      source: CanvasImageSource,
      ...args: unknown[]
    ): void => {
      if (source instanceof PartialOffscreenCanvas) {
        throw new TypeError('OffscreenCanvas cannot be used as a CanvasImageSource');
      }
      observations.drawImages.push({
        source,
        args: args.map(Number),
      });
    };
    const renderer = new CanvasRenderer(createTargetCanvas(context));
    renderer.resize(390, 500, 1);

    expect(() => renderer.render(createScene())).not.toThrow();
    expect(observations.drawImages).toHaveLength(2);
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
    const targetLiquidIndex = events.indexOf('image:0');
    const targetGlassIndex = events.indexOf('image:1');
    const stateIndex = events.indexOf('stroke');
    const pourIndex = events.indexOf('translate');
    const sourceLiquidIndex = events.indexOf('image:2');
    const sourceGlassIndex = events.lastIndexOf('image:1');

    expect(clearIndex).toBeLessThan(backgroundIndex);
    expect(backgroundIndex).toBeLessThan(ellipseIndexes[0]!);
    expect(ellipseIndexes[0]!).toBeLessThan(targetLiquidIndex);
    expect(targetLiquidIndex).toBeLessThan(targetGlassIndex);
    expect(targetGlassIndex).toBeLessThan(stateIndex);
    expect(stateIndex).toBeLessThan(pourIndex);
    expect(pourIndex).toBeLessThan(sourceLiquidIndex);
    expect(sourceLiquidIndex).toBeLessThan(sourceGlassIndex);
  });

  it('drains the animated source and fills the target from the pending board', () => {
    installDocumentCanvasFallback();
    const start = createObservations();
    const startRenderer = new CanvasRenderer(
      createTargetCanvas(createContext([], [], start)),
    );
    startRenderer.resize(400, 400, 1);
    startRenderer.render(createPourScene({ liquidProgress: 0 }));

    vi.unstubAllGlobals();
    installDocumentCanvasFallback();
    const end = createObservations();
    const endRenderer = new CanvasRenderer(
      createTargetCanvas(createContext([], [], end)),
    );
    endRenderer.resize(400, 400, 1);
    endRenderer.render(createPourScene({ liquidProgress: 1 }));

    const targetAtStart = start.rects.find(({ x }) => x > 0);
    const sourceAtEnd = end.rects.find(({ x }) => x < 0);
    expect(targetAtStart).toBeDefined();
    expect(targetAtStart!.x).toBeCloseTo(270);
    expect(targetAtStart!.y).toBeCloseTo(236.225);
    expect(targetAtStart!.height).toBeCloseTo(37.575);
    expect(start.rects.some(({ x }) => x < 0)).toBe(false);

    expect(sourceAtEnd).toBeDefined();
    expect(sourceAtEnd!.x).toBeCloseTo(-30);
    expect(sourceAtEnd!.y).toBeCloseTo(36.225);
    expect(sourceAtEnd!.height).toBeCloseTo(37.575);
    expect(end.rects.some(({ x }) => x > 0)).toBe(false);
  });

  it('paints each static and animated liquid once while reusing glass', () => {
    installDocumentCanvasFallback();
    const observations = createObservations();
    const renderer = new CanvasRenderer(
      createTargetCanvas(createContext([], [], observations)),
    );
    renderer.resize(400, 400, 1);

    renderer.render(createPourScene({ liquidProgress: 0.5 }));

    expect(observations.drawImages).toHaveLength(4);
    const paintsPerBitmap = new Map<CanvasImageSource, number>();
    observations.drawImages.forEach(({ source }) => {
      paintsPerBitmap.set(source, (paintsPerBitmap.get(source) ?? 0) + 1);
    });
    expect([...paintsPerBitmap.values()]).toEqual([1, 2, 1]);
  });

  it.each([
    {
      label: 'rightward',
      from: 0 as const,
      rotation: Math.PI / 2,
      expectedX: 179.2,
    },
    {
      label: 'leftward',
      from: 1 as const,
      rotation: -Math.PI / 2,
      expectedX: 220.8,
    },
  ])('starts a $label stream at the transformed top lip', ({
    from,
    rotation,
    expectedX,
  }) => {
    installDocumentCanvasFallback();
    const observations = createObservations();
    const renderer = new CanvasRenderer(
      createTargetCanvas(createContext([], [], observations)),
    );
    renderer.resize(400, 400, 1);

    renderer.render(createPourScene({
      from,
      liquidProgress: 0.5,
      rotation,
      streamProgress: 0.5,
    }));

    expect(observations.moveTos).toHaveLength(1);
    expect(observations.moveTos[0]!.x).toBeCloseTo(expectedX);
    expect(observations.moveTos[0]!.y).toBeCloseTo(150);
  });
});
