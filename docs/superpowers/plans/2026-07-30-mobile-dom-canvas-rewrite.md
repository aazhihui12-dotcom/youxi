# 手机端 DOM＋Canvas 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用原生 DOM＋Canvas 2D 替换 Phaser 渲染层，使日本向 Water Sort H5 在 TikTok 手机内置浏览器中加载更快、触摸更跟手并能自适应常见手机尺寸。

**Architecture:** 现有纯规则、关卡、进度、音频和适配器保持不变。新的 DOM 外壳负责安全区、按钮、文案和通关面板；单个 Canvas 负责瓶子和动画；纯函数布局、指针控制器、动画采样器、渲染调度器和自适应画质模块通过明确接口由 `GameApp` 组合。

**Tech Stack:** TypeScript 7、Vite 8、Vitest 4、Canvas 2D、Pointer Events、Web Audio、原生 DOM/CSS、GitHub Pages

## Global Constraints

- 不新增运行时第三方依赖，并从 production 中删除 Phaser。
- 保留现有 8 关、日文 UI、Water Sort 规则、撤销、重开、声音、通关和本地进度。
- 保持 `water-sort-progress`、`version: 1` 的存储格式兼容。
- 用户不需要登录，页面打开后直接进入当前关卡。
- 首要支持宽 320～480 CSS 像素的竖屏；横屏必须居中且可操作。
- 使用 `100dvh` 与 `env(safe-area-inset-*)` 适配刘海屏。
- 触摸热区最小为 56×72 CSS 像素；移动超过 12 CSS 像素取消点击。
- 倒水总动画与输入锁时长必须为 700～900 毫秒。
- 动画期间最多排队一次后续瓶子点击。
- Canvas 初始渲染倍率为 `min(devicePixelRatio, 2)`，低帧率只能降低装饰画质。
- 空闲时不能持续请求 `requestAnimationFrame`。
- production JavaScript gzip 小于 100 KB，CSS gzip 小于 15 KB。
- 不加载外部字体、大图、视频或远程美术资源。
- GitHub Pages 继续使用相对资源路径。

---

## File Map

- `src/game/canvas/responsiveLayout.ts`：计算 DOM 棋盘尺寸、瓶子位置和触摸热区。
- `src/game/canvas/adaptiveQuality.ts`：根据帧间隔选择 `high`、`balanced`、`low`。
- `src/game/canvas/renderScheduler.ts`：脏帧和动画帧调度，空闲时停止。
- `src/game/canvas/renderModel.ts`：从 `GameState` 生成只读 Canvas 绘制模型。
- `src/game/canvas/CanvasRenderer.ts`：Canvas 尺寸、缓存和绘制入口。
- `src/game/canvas/drawBottle.ts`：玻璃、液体、状态光效和缓存位图。
- `src/game/canvas/pourAnimation.ts`：700～900 毫秒倒水时间线与逐帧姿态。
- `src/game/input/PointerController.ts`：单指所有权、移动容差和单次排队。
- `src/game/app/domShell.ts`：创建 DOM 外壳并暴露按钮和文本更新接口。
- `src/game/app/GameApp.ts`：连接 reducer、DOM、Canvas、指针、动画和生命周期。
- `src/main.ts`：创建并启动 `GameApp`。
- `src/styles.css`：安全区、自适应 DOM 布局、触摸反馈和错误页面。
- `scripts/check-bundle-size.mjs`：gzip 预算与 Phaser 排除检查。
- 现有 `src/game/domain/*`、`session/*`、`levels/*`、`audio/*`、`adapters/*`：继续复用。
- 现有 Phaser 文件在新入口通过全部测试后删除。

---

### Task 1: Responsive layout and hit areas

**Files:**
- Create: `src/game/canvas/responsiveLayout.ts`
- Create: `src/game/canvas/responsiveLayout.test.ts`

**Interfaces:**
- Consumes: Canvas 棋盘的 `{ width, height, tubeCount }`，单位为 CSS 像素。
- DOM 在 Task 6 中处理安全区、顶部和底部占位；本模块所有坐标都相对于 Canvas
  左上角，避免页面坐标与 Canvas 坐标混用。
- Produces:

```ts
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TubeLayout {
  centerX: number;
  centerY: number;
  visualWidth: number;
  visualHeight: number;
  hitRect: Rect;
}

export interface ResponsiveLayout {
  width: number;
  height: number;
  tubes: readonly TubeLayout[];
}

export function computeResponsiveLayout(input: {
  width: number;
  height: number;
  tubeCount: number;
}): ResponsiveLayout;

export function hitTestTube(
  tubes: readonly TubeLayout[],
  x: number,
  y: number,
): number | null;
```

- [ ] **Step 1: Write failing portrait, landscape, safe-area, and hit tests**

```ts
import { describe, expect, it } from 'vitest';
import { computeResponsiveLayout, hitTestTube } from './responsiveLayout';

describe('computeResponsiveLayout', () => {
  it.each([
    [296, 330, 6],
    [336, 400, 6],
    [336, 500, 7],
    [366, 540, 8],
    [406, 600, 8],
  ])('fits %sx%s with %s tubes', (width, height, tubeCount) => {
    const layout = computeResponsiveLayout({
      width,
      height,
      tubeCount,
    });

    expect(layout.width).toBe(width);
    expect(layout.height).toBe(height);
    expect(layout.tubes).toHaveLength(tubeCount);

    for (const tube of layout.tubes) {
      expect(tube.visualWidth).toBeGreaterThanOrEqual(44);
      expect(tube.hitRect.width).toBeGreaterThanOrEqual(56);
      expect(tube.hitRect.height).toBeGreaterThanOrEqual(72);
      expect(tube.hitRect.x).toBeGreaterThanOrEqual(0);
      expect(tube.hitRect.y).toBeGreaterThanOrEqual(0);
      expect(tube.hitRect.x + tube.hitRect.width).toBeLessThanOrEqual(width);
      expect(tube.hitRect.y + tube.hitRect.height).toBeLessThanOrEqual(height);
    }

    for (const left of layout.tubes) {
      for (const right of layout.tubes) {
        if (right.centerX <= left.centerX || right.centerY !== left.centerY) continue;
        expect(right.hitRect.x - (left.hitRect.x + left.hitRect.width))
          .toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('fits a short landscape board without changing coordinate space', () => {
    const layout = computeResponsiveLayout({
      width: 480,
      height: 300,
      tubeCount: 8,
    });

    expect(layout.width).toBe(480);
    expect(layout.height).toBe(300);
    expect(layout.tubes.every((tube) =>
      tube.centerX >= 0 && tube.centerX <= 480)).toBe(true);
  });

  it('returns the nearest containing tube hit area', () => {
    const layout = computeResponsiveLayout({
      width: 366,
      height: 540,
      tubeCount: 8,
    });
    const tube = layout.tubes[3]!;

    expect(hitTestTube(layout.tubes, tube.centerX, tube.centerY)).toBe(3);
    expect(hitTestTube(layout.tubes, -20, -20)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/game/canvas/responsiveLayout.test.ts`

Expected: FAIL because `responsiveLayout.ts` does not exist.

- [ ] **Step 3: Implement deterministic responsive layout**

```ts
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function computeResponsiveLayout(input: LayoutInput): ResponsiveLayout {
  const width = Math.max(280, input.width);
  const height = Math.max(228, input.height);
  const columns = input.tubeCount >= 7 ? 4 : 3;
  const rows = Math.ceil(input.tubeCount / columns);
  const paddingX = clamp(width * 0.04, 12, 20);
  const paddingY = clamp(height * 0.04, 10, 22);
  const cellWidth = (width - paddingX * 2) / columns;
  const cellHeight = (height - paddingY * 2) / rows;
  const visualWidth = clamp(Math.min(cellWidth * 0.54, cellHeight * 0.32), 44, 68);
  const visualHeight = clamp(Math.min(visualWidth * 3, cellHeight - 16), 124, 204);
  const hitWidth = Math.max(56, Math.min(cellWidth - 4, visualWidth + 18));
  const hitHeight = Math.max(72, Math.min(cellHeight - 4, visualHeight + 20));
  const rowCounts = [
    Math.min(columns, input.tubeCount),
    Math.max(0, input.tubeCount - columns),
  ];
  const tubes: TubeLayout[] = [];

  rowCounts.forEach((count, row) => {
    for (let column = 0; column < count; column += 1) {
      const rowOffset = (columns - count) * cellWidth / 2;
      const centerX = paddingX + rowOffset + cellWidth * (column + 0.5);
      const centerY = paddingY + cellHeight * (row + 0.5);
      tubes.push({
        centerX,
        centerY,
        visualWidth,
        visualHeight,
        hitRect: {
          x: centerX - hitWidth / 2,
          y: centerY - hitHeight / 2,
          width: hitWidth,
          height: hitHeight,
        },
      });
    }
  });

  return {
    width,
    height,
    tubes,
  };
}

export function hitTestTube(
  tubes: readonly TubeLayout[],
  x: number,
  y: number,
): number | null {
  const matches = tubes
    .map((tube, index) => ({ tube, index }))
    .filter(({ tube }) =>
      x >= tube.hitRect.x
      && x <= tube.hitRect.x + tube.hitRect.width
      && y >= tube.hitRect.y
      && y <= tube.hitRect.y + tube.hitRect.height)
    .sort((a, b) =>
      Math.hypot(x - a.tube.centerX, y - a.tube.centerY)
      - Math.hypot(x - b.tube.centerX, y - b.tube.centerY));

  return matches[0]?.index ?? null;
}
```

Define `LayoutInput`, `Rect`, `TubeLayout`, and `ResponsiveLayout` exactly as listed in
the interface block above. The old Phaser layout remains tracked until Task 8 switches
the entry point, so every intermediate commit continues to build.

- [ ] **Step 4: Verify GREEN and run existing layout-adjacent tests**

Run:

```bash
npm test -- src/game/canvas/responsiveLayout.test.ts src/game/ui/safeArea.test.ts
```

Expected: both test files PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/canvas/responsiveLayout.ts \
  src/game/canvas/responsiveLayout.test.ts
git commit -m "feat: add responsive mobile game layout"
```

---

### Task 2: Adaptive quality and idle render scheduling

**Files:**
- Create: `src/game/canvas/adaptiveQuality.ts`
- Create: `src/game/canvas/adaptiveQuality.test.ts`
- Create: `src/game/canvas/renderScheduler.ts`
- Create: `src/game/canvas/renderScheduler.test.ts`

**Interfaces:**
- Produces:

```ts
export type QualityLevel = 'high' | 'balanced' | 'low';

export interface QualityConfig {
  level: QualityLevel;
  maxPixelRatio: number;
  glow: boolean;
  confettiCount: number;
}

export class AdaptiveQuality {
  constructor(devicePixelRatio: number);
  observeFrame(deltaMs: number): QualityConfig;
  get config(): QualityConfig;
}

export type AnimationStep = (timeMs: number) => boolean;

export class RenderScheduler {
  constructor(
    render: () => void,
    requestFrame?: (callback: FrameRequestCallback) => number,
    cancelFrame?: (id: number) => void,
  );
  invalidate(): void;
  animate(step: AnimationStep): Promise<void>;
  stop(): void;
  get running(): boolean;
}
```

- [ ] **Step 1: Write failing quality and scheduler tests**

```ts
import { describe, expect, it } from 'vitest';
import { AdaptiveQuality } from './adaptiveQuality';
import { RenderScheduler } from './renderScheduler';

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

describe('RenderScheduler', () => {
  it('coalesces invalidations and returns to idle after one frame', () => {
    const callbacks: FrameRequestCallback[] = [];
    let renders = 0;
    const scheduler = new RenderScheduler(
      () => { renders += 1; },
      (callback) => { callbacks.push(callback); return callbacks.length; },
      () => undefined,
    );

    scheduler.invalidate();
    scheduler.invalidate();
    expect(callbacks).toHaveLength(1);
    callbacks.shift()!(10);
    expect(renders).toBe(1);
    expect(scheduler.running).toBe(false);
  });

  it('runs animation frames only while the step returns true', async () => {
    const callbacks: FrameRequestCallback[] = [];
    const scheduler = new RenderScheduler(
      () => undefined,
      (callback) => { callbacks.push(callback); return callbacks.length; },
      () => undefined,
    );
    let calls = 0;

    const done = scheduler.animate(() => {
      calls += 1;
      return calls < 2;
    });
    callbacks.shift()!(10);
    callbacks.shift()!(20);
    await done;

    expect(calls).toBe(2);
    expect(callbacks).toHaveLength(0);
    expect(scheduler.running).toBe(false);
  });

  it('resolves the active animation when stopped', async () => {
    const callbacks: FrameRequestCallback[] = [];
    const scheduler = new RenderScheduler(
      () => undefined,
      (callback) => { callbacks.push(callback); return callbacks.length; },
      () => undefined,
    );
    const done = scheduler.animate(() => true);

    scheduler.stop();

    await expect(done).resolves.toBeUndefined();
    expect(scheduler.running).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/game/canvas/adaptiveQuality.test.ts \
  src/game/canvas/renderScheduler.test.ts
```

Expected: FAIL because both production modules are missing.

- [ ] **Step 3: Implement quality downgrade rules**

```ts
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

    const average = this.samples.reduce((sum, value) => sum + value, 0)
      / this.samples.length;
    if (average > 26) this.current = 'low';
    else if (average > 20 && this.current === 'high') this.current = 'balanced';
    return this.config;
  }
}
```

- [ ] **Step 4: Implement a one-shot/animation render scheduler**

```ts
export class RenderScheduler {
  private frameId: number | null = null;
  private step: AnimationStep | null = null;
  private resolveAnimation: (() => void) | null = null;

  constructor(
    private readonly render: () => void,
    private readonly requestFrame = requestAnimationFrame,
    private readonly cancelFrame = cancelAnimationFrame,
  ) {}

  get running(): boolean {
    return this.frameId !== null;
  }

  invalidate(): void {
    if (this.frameId !== null) return;
    this.frameId = this.requestFrame(this.onFrame);
  }

  animate(step: AnimationStep): Promise<void> {
    this.stop();
    this.step = step;
    const done = new Promise<void>((resolve) => {
      this.resolveAnimation = resolve;
    });
    this.invalidate();
    return done;
  }

  stop(): void {
    if (this.frameId !== null) this.cancelFrame(this.frameId);
    this.frameId = null;
    this.step = null;
    const resolve = this.resolveAnimation;
    this.resolveAnimation = null;
    resolve?.();
  }

  private readonly onFrame = (timeMs: number): void => {
    this.frameId = null;
    const keepRunning = this.step?.(timeMs) ?? false;
    this.render();
    if (keepRunning) {
      this.frameId = this.requestFrame(this.onFrame);
    } else {
      this.step = null;
      const resolve = this.resolveAnimation;
      this.resolveAnimation = null;
      resolve?.();
    }
  };
}
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- src/game/canvas/adaptiveQuality.test.ts \
  src/game/canvas/renderScheduler.test.ts
```

Expected: both test files PASS and the idle assertion reports no queued callback.

- [ ] **Step 6: Commit**

```bash
git add src/game/canvas/adaptiveQuality.ts \
  src/game/canvas/adaptiveQuality.test.ts \
  src/game/canvas/renderScheduler.ts \
  src/game/canvas/renderScheduler.test.ts
git commit -m "feat: add adaptive canvas quality scheduling"
```

---

### Task 3: Pointer ownership, movement tolerance, and one-slot queue

**Files:**
- Create: `src/game/input/PointerController.ts`
- Create: `src/game/input/PointerController.test.ts`

**Interfaces:**
- Consumes: a hit-test function `(x, y) => tubeIndex | null`.
- Produces:

```ts
export type PointerResult =
  | { kind: 'pressed'; tube: number }
  | { kind: 'tap'; tube: number }
  | { kind: 'queued'; tube: number }
  | { kind: 'canceled'; tube: number | null }
  | { kind: 'ignored' };

export class PointerController {
  constructor(hitTest: (x: number, y: number) => number | null);
  setBusy(busy: boolean): void;
  down(pointerId: number, x: number, y: number): PointerResult;
  move(pointerId: number, x: number, y: number): PointerResult;
  up(pointerId: number, x: number, y: number): PointerResult;
  cancel(pointerId: number): PointerResult;
  takeQueuedTap(): number | null;
  reset(): void;
}
```

- [ ] **Step 1: Write failing pointer behavior tests**

```ts
import { describe, expect, it } from 'vitest';
import { PointerController } from './PointerController';

const hitTest = (x: number): number | null => {
  if (x >= 0 && x < 80) return 0;
  if (x >= 80 && x < 160) return 1;
  return null;
};

describe('PointerController', () => {
  it('reports press immediately and tap on release over the same tube', () => {
    const input = new PointerController(hitTest);
    expect(input.down(7, 20, 20)).toEqual({ kind: 'pressed', tube: 0 });
    expect(input.up(7, 22, 20)).toEqual({ kind: 'tap', tube: 0 });
  });

  it('cancels when movement exceeds twelve CSS pixels', () => {
    const input = new PointerController(hitTest);
    input.down(7, 20, 20);
    expect(input.move(7, 33, 20)).toEqual({ kind: 'canceled', tube: 0 });
    expect(input.up(7, 33, 20)).toEqual({ kind: 'ignored' });
  });

  it('rejects a second pointer until the owner releases', () => {
    const input = new PointerController(hitTest);
    input.down(1, 20, 20);
    expect(input.down(2, 100, 20)).toEqual({ kind: 'ignored' });
    input.up(1, 20, 20);
    expect(input.down(2, 100, 20)).toEqual({ kind: 'pressed', tube: 1 });
  });

  it('stores only the first completed tap while busy', () => {
    const input = new PointerController(hitTest);
    input.setBusy(true);
    input.down(1, 20, 20);
    expect(input.up(1, 20, 20)).toEqual({ kind: 'queued', tube: 0 });
    input.down(2, 100, 20);
    expect(input.up(2, 100, 20)).toEqual({ kind: 'ignored' });
    expect(input.takeQueuedTap()).toBe(0);
    expect(input.takeQueuedTap()).toBeNull();
  });
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- src/game/input/PointerController.test.ts`

Expected: FAIL because `PointerController.ts` is missing.

- [ ] **Step 3: Implement the controller**

```ts
const MOVE_TOLERANCE = 12;

interface ActivePointer {
  id: number;
  tube: number;
  startX: number;
  startY: number;
  canceled: boolean;
}

export class PointerController {
  private active: ActivePointer | null = null;
  private busy = false;
  private queuedTap: number | null = null;

  constructor(private readonly hitTest: (x: number, y: number) => number | null) {}

  setBusy(busy: boolean): void {
    this.busy = busy;
  }

  down(pointerId: number, x: number, y: number): PointerResult {
    if (this.active !== null) return { kind: 'ignored' };
    const tube = this.hitTest(x, y);
    if (tube === null) return { kind: 'ignored' };
    this.active = { id: pointerId, tube, startX: x, startY: y, canceled: false };
    return { kind: 'pressed', tube };
  }

  move(pointerId: number, x: number, y: number): PointerResult {
    if (this.active?.id !== pointerId || this.active.canceled) {
      return { kind: 'ignored' };
    }
    if (Math.hypot(x - this.active.startX, y - this.active.startY) <= MOVE_TOLERANCE) {
      return { kind: 'ignored' };
    }
    this.active.canceled = true;
    return { kind: 'canceled', tube: this.active.tube };
  }

  up(pointerId: number, x: number, y: number): PointerResult {
    if (this.active?.id !== pointerId) return { kind: 'ignored' };
    const active = this.active;
    this.active = null;
    if (active.canceled) return { kind: 'ignored' };
    if (this.hitTest(x, y) !== active.tube) {
      return { kind: 'canceled', tube: active.tube };
    }
    if (this.busy) {
      if (this.queuedTap !== null) return { kind: 'ignored' };
      this.queuedTap = active.tube;
      return { kind: 'queued', tube: active.tube };
    }
    return { kind: 'tap', tube: active.tube };
  }

  cancel(pointerId: number): PointerResult {
    if (this.active?.id !== pointerId) return { kind: 'ignored' };
    const tube = this.active.tube;
    this.active = null;
    return { kind: 'canceled', tube };
  }

  takeQueuedTap(): number | null {
    const tube = this.queuedTap;
    this.queuedTap = null;
    return tube;
  }

  reset(): void {
    this.active = null;
    this.queuedTap = null;
    this.busy = false;
  }
}
```

Export the `PointerResult` union exactly as defined above. Keep the old
`PointerOwnershipGate` files until Task 8 switches the application entry point.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/game/input/PointerController.test.ts`

Expected: all four cases PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/input/PointerController.ts \
  src/game/input/PointerController.test.ts
git commit -m "feat: add responsive pointer interaction queue"
```

---

### Task 4: Short deterministic pour animation

**Files:**
- Create: `src/game/canvas/pourAnimation.ts`
- Create: `src/game/canvas/pourAnimation.test.ts`

**Interfaces:**
- Consumes: source and target centers, amount 1～4, elapsed milliseconds.
- Produces:

```ts
export interface Point {
  x: number;
  y: number;
}

export interface PourTimeline {
  liftMs: 100;
  travelMs: 150;
  tiltMs: 100;
  pourMs: number;
  returnMs: 120;
  totalMs: number;
}

export interface PourFrame {
  sourceX: number;
  sourceY: number;
  rotation: number;
  streamProgress: number;
  liquidProgress: number;
  rippleProgress: number;
  done: boolean;
}

export function buildPourTimeline(amount: number): PourTimeline;
export function samplePourFrame(input: {
  source: Point;
  target: Point;
  amount: number;
  elapsedMs: number;
}): PourFrame;
```

- [ ] **Step 1: Write failing timing and endpoint tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildPourTimeline, samplePourFrame } from './pourAnimation';

describe('buildPourTimeline', () => {
  it.each([
    [1, 720],
    [2, 770],
    [3, 820],
    [4, 870],
  ])('keeps amount %s within the mobile budget', (amount, totalMs) => {
    expect(buildPourTimeline(amount)).toMatchObject({ totalMs });
    expect(totalMs).toBeGreaterThanOrEqual(700);
    expect(totalMs).toBeLessThanOrEqual(900);
  });

  it('returns the source to its origin on the final frame', () => {
    const timeline = buildPourTimeline(4);
    const frame = samplePourFrame({
      source: { x: 40, y: 300 },
      target: { x: 240, y: 300 },
      amount: 4,
      elapsedMs: timeline.totalMs,
    });

    expect(frame).toMatchObject({
      sourceX: 40,
      sourceY: 300,
      rotation: 0,
      streamProgress: 0,
      liquidProgress: 1,
      done: true,
    });
  });

  it('runs the ripple in parallel with the return phase', () => {
    const timeline = buildPourTimeline(1);
    const frame = samplePourFrame({
      source: { x: 40, y: 300 },
      target: { x: 240, y: 300 },
      amount: 1,
      elapsedMs: timeline.totalMs - 60,
    });

    expect(frame.rippleProgress).toBeGreaterThan(0);
    expect(frame.sourceX).toBeLessThan(240);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/game/canvas/pourAnimation.test.ts`

Expected: FAIL because the new animation module is missing.

- [ ] **Step 3: Implement the 720～870 ms timeline**

```ts
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const ease = (value: number): number =>
  0.5 - Math.cos(Math.PI * clamp01(value)) / 2;

export function buildPourTimeline(amount: number): PourTimeline {
  const safeAmount = Math.min(4, Math.max(1, Math.round(amount)));
  const pourMs = 250 + (safeAmount - 1) * 50;
  return {
    liftMs: 100,
    travelMs: 150,
    tiltMs: 100,
    pourMs,
    returnMs: 120,
    totalMs: 100 + 150 + 100 + pourMs + 120,
  };
}

export function samplePourFrame(input: PourFrameInput): PourFrame {
  const timeline = buildPourTimeline(input.amount);
  const direction = input.target.x >= input.source.x ? 1 : -1;
  const pourPoint = {
    x: input.target.x - direction * 40,
    y: input.target.y - 118,
  };
  const liftEnd = timeline.liftMs;
  const travelEnd = liftEnd + timeline.travelMs;
  const tiltEnd = travelEnd + timeline.tiltMs;
  const pourEnd = tiltEnd + timeline.pourMs;
  const elapsed = Math.min(timeline.totalMs, Math.max(0, input.elapsedMs));
  let sourceX = input.source.x;
  let sourceY = input.source.y;
  let rotation = 0;
  let streamProgress = 0;
  let liquidProgress = 0;

  if (elapsed <= liftEnd) {
    sourceY -= 28 * ease(elapsed / timeline.liftMs);
  } else if (elapsed <= travelEnd) {
    const progress = ease((elapsed - liftEnd) / timeline.travelMs);
    sourceX += (pourPoint.x - input.source.x) * progress;
    sourceY = input.source.y - 28 + (pourPoint.y - (input.source.y - 28)) * progress;
  } else if (elapsed <= tiltEnd) {
    const progress = ease((elapsed - travelEnd) / timeline.tiltMs);
    sourceX = pourPoint.x;
    sourceY = pourPoint.y;
    rotation = direction * 1.02 * progress;
  } else if (elapsed <= pourEnd) {
    const progress = clamp01((elapsed - tiltEnd) / timeline.pourMs);
    sourceX = pourPoint.x;
    sourceY = pourPoint.y;
    rotation = direction * 1.02;
    streamProgress = Math.min(1, progress * 4, (1 - progress) * 4);
    liquidProgress = progress;
  } else {
    const progress = ease((elapsed - pourEnd) / timeline.returnMs);
    sourceX = pourPoint.x + (input.source.x - pourPoint.x) * progress;
    sourceY = pourPoint.y + (input.source.y - pourPoint.y) * progress;
    rotation = direction * 1.02 * (1 - progress);
    liquidProgress = 1;
  }

  const rippleProgress = clamp01(
    (elapsed - (pourEnd - 80)) / (timeline.returnMs + 80),
  );
  return {
    sourceX,
    sourceY,
    rotation,
    streamProgress,
    liquidProgress,
    rippleProgress,
    done: elapsed >= timeline.totalMs,
  };
}
```

Add `PourFrameInput` as the object type shown in the interface block.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/game/canvas/pourAnimation.test.ts`

Expected: all tests PASS. Keep the old Phaser timeline and animator until the atomic
entry-point migration in Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/game/canvas/pourAnimation.ts \
  src/game/canvas/pourAnimation.test.ts
git commit -m "feat: add fast deterministic pour animation"
```

---

### Task 5: Canvas render model, bottle cache, and renderer

**Files:**
- Create: `src/game/canvas/renderModel.ts`
- Create: `src/game/canvas/renderModel.test.ts`
- Create: `src/game/canvas/drawBottle.ts`
- Create: `src/game/canvas/CanvasRenderer.ts`
- Create: `src/game/canvas/CanvasRenderer.test.ts`

**Interfaces:**
- Consumes: current board, selected tube, valid targets, pressed tube, responsive layout,
  quality config, and optional pour frame.
- Produces:

```ts
export interface TubeRenderModel {
  index: number;
  colors: readonly ColorId[];
  layout: TubeLayout;
  selected: boolean;
  validTarget: boolean;
  completed: boolean;
  pressed: boolean;
}

export interface SceneRenderModel {
  tubes: readonly TubeRenderModel[];
  quality: QualityConfig;
  pour: (PourFrame & { from: number; to: number; color: ColorId }) | null;
}

export function buildSceneRenderModel(input: {
  board: readonly TubeState[];
  selectedTube: number | null;
  validTargets: ReadonlySet<number>;
  pressedTube: number | null;
  layout: ResponsiveLayout;
  quality: QualityConfig;
  pour: SceneRenderModel['pour'];
}): SceneRenderModel;

export class CanvasRenderer {
  constructor(canvas: HTMLCanvasElement);
  resize(cssWidth: number, cssHeight: number, pixelRatio: number): void;
  render(model: SceneRenderModel): void;
  clearCache(): void;
}
```

- [ ] **Step 1: Write failing render-model and backing-size tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildSceneRenderModel } from './renderModel';
import { CanvasRenderer } from './CanvasRenderer';
import { computeResponsiveLayout } from './responsiveLayout';

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
});

describe('CanvasRenderer', () => {
  it('separates CSS size from a capped backing size', () => {
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      rect: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    };
    const canvas = {
      width: 0,
      height: 0,
      style: { width: '', height: '' },
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    const renderer = new CanvasRenderer(canvas);

    renderer.resize(390, 500, 2);

    expect(canvas.width).toBe(780);
    expect(canvas.height).toBe(1000);
    expect(canvas.style.width).toBe('390px');
    expect(canvas.style.height).toBe('500px');
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test -- src/game/canvas/renderModel.test.ts \
  src/game/canvas/CanvasRenderer.test.ts
```

Expected: FAIL because both new modules are missing.

- [ ] **Step 3: Implement the pure render model**

```ts
export function buildSceneRenderModel(input: RenderModelInput): SceneRenderModel {
  return {
    quality: input.quality,
    pour: input.pour,
    tubes: input.layout.tubes.map((layout, index) => {
      const colors = input.board[index] ?? [];
      const first = colors[0];
      return {
        index,
        colors,
        layout,
        selected: input.selectedTube === index,
        validTarget: input.validTargets.has(index),
        completed: colors.length === 4
          && first !== undefined
          && colors.every((color) => color === first),
        pressed: input.pressedTube === index,
      };
    }),
  };
}
```

Define `RenderModelInput`, `TubeRenderModel`, and `SceneRenderModel` exactly as the
interface block specifies.

- [ ] **Step 4: Implement Canvas resizing and deterministic draw order**

`CanvasRenderer.render` must clear once and draw in this exact order:

```ts
render(model: SceneRenderModel): void {
  this.context.clearRect(0, 0, this.cssWidth, this.cssHeight);
  drawBackground(this.context, this.cssWidth, this.cssHeight);
  for (const tube of model.tubes) drawTubeShadow(this.context, tube);
  for (const tube of model.tubes) drawLiquid(this.context, tube, this.cache);
  for (const tube of model.tubes) drawGlass(this.context, tube, this.cache);
  for (const tube of model.tubes) drawTubeState(this.context, tube, model.quality);
  if (model.pour !== null) drawPour(this.context, model);
}
```

`resize` must validate positive finite values, write CSS dimensions, set backing dimensions
to rounded CSS size times pixel ratio, call `setTransform`, and clear bottle cache whenever
the CSS dimensions or pixel ratio changes.

In `drawBottle.ts`, define the palette exactly:

```ts
export const COLOR_STOPS: Record<ColorId, readonly [string, string, string]> = {
  pink: ['#ff9bbb', '#ff6f9e', '#d94a7d'],
  yellow: ['#ffe28a', '#ffc84b', '#e6a72c'],
  mint: ['#90efd7', '#44d7b0', '#2aa889'],
  blue: ['#9fbdff', '#5e94ff', '#416fd1'],
  purple: ['#c8b6ff', '#9a78e8', '#7353bf'],
  orange: ['#ffc09a', '#ff925c', '#d96b3d'],
};
```

Draw each liquid layer with two gradient halves and an elliptical top. Draw glass with a
rounded outline, white vertical highlight, lip ellipse, and soft shadow. Only use
`shadowBlur` when `quality.glow` is true. Cache glass shell and liquid bitmaps by
`visualWidth:visualHeight:quality.level:color-sequence`; use `OffscreenCanvas` when
available and `document.createElement('canvas')` otherwise.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- src/game/canvas/renderModel.test.ts \
  src/game/canvas/CanvasRenderer.test.ts
```

Expected: both test files PASS. Keep the old Phaser view files until Task 8 switches the
application entry point.

- [ ] **Step 6: Commit**

```bash
git add src/game/canvas/renderModel.ts \
  src/game/canvas/renderModel.test.ts \
  src/game/canvas/drawBottle.ts \
  src/game/canvas/CanvasRenderer.ts \
  src/game/canvas/CanvasRenderer.test.ts
git commit -m "feat: render water sort with one canvas"
```

---

### Task 6: Responsive DOM shell and Japanese controls

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/game/app/domShell.ts`
- Create: `src/game/app/domShell.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Produces:

```ts
export interface DomShell {
  root: HTMLElement;
  board: HTMLElement;
  canvas: HTMLCanvasElement;
  undoButton: HTMLButtonElement;
  soundButton: HTMLButtonElement;
  restartButton: HTMLButtonElement;
  levelLabel: HTMLElement;
  guide: HTMLElement;
  clearPanel: HTMLElement;
  nextButton: HTMLButtonElement;
  replayButton: HTMLButtonElement;
  retryButton: HTMLButtonElement;
  setLevel(level: number): void;
  setGuideVisible(visible: boolean): void;
  setSoundEnabled(enabled: boolean): void;
  setControlsEnabled(input: {
    undo: boolean;
    restart: boolean;
    sound: boolean;
  }): void;
  showClear(input: {
    moves: number;
    elapsedSeconds: number;
    hasNext: boolean;
  }): void;
  hideClear(): void;
  showFatalError(): void;
}

export function createDomShell(document: Document, parent: HTMLElement): DomShell;
```

- [ ] **Step 1: Add jsdom as a development-only test dependency**

Run: `npm install --save-dev jsdom`

Expected: `package.json` adds `jsdom` under `devDependencies`; `dependencies` still only
contains Phaser until Task 8 removes it.

- [ ] **Step 2: Write the failing DOM shell and responsive CSS tests**

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDomShell } from './domShell';

describe('createDomShell', () => {
  it('opens directly into the Japanese game without login UI', () => {
    const parent = document.createElement('div');
    const shell = createDomShell(document, parent);

    expect(shell.canvas.getAttribute('aria-label')).toBe('カラーウォーターソート');
    expect(shell.undoButton.getAttribute('aria-label')).toBe('一手戻す');
    expect(shell.restartButton.getAttribute('aria-label')).toBe('やり直す');
    expect(shell.soundButton.getAttribute('aria-label')).toBe('サウンド');
    expect(parent.textContent).toContain('色をそろえよう！');
    expect(parent.textContent).not.toMatch(/ログイン|登録|アカウント/);
  });

  it('updates the level and clear panel through its public methods', () => {
    const parent = document.createElement('div');
    const shell = createDomShell(document, parent);

    shell.setLevel(3);
    shell.showClear({ moves: 12, elapsedSeconds: 18.4, hasNext: true });

    expect(shell.levelLabel.textContent).toBe('レベル 03');
    expect(shell.clearPanel.hidden).toBe(false);
    expect(shell.clearPanel.textContent).toContain('手数 12');
    expect(shell.clearPanel.textContent).toContain('タイム 18.4秒');
  });
});
```

Append these assertions to `src/styles.test.ts` before changing the stylesheet:

```ts
describe('responsive shell contract', () => {
  it('uses dynamic viewport and safe-area padding', () => {
    expect(stylesheet).toContain('.game-shell');
    expect(stylesheet).toContain('height: 100dvh');
    expect(stylesheet).toContain('env(safe-area-inset-top)');
    expect(stylesheet).toContain('env(safe-area-inset-bottom)');
  });

  it('keeps touch controls at least 56 CSS pixels wide and tall', () => {
    const declarations = declarationsFor('button');
    expect(declarations.get('min-width')).toContain('56px');
    expect(declarations.get('min-height')).toContain('56px');
  });

  it('contains an explicit landscape layout', () => {
    expect(stylesheet).toContain('@media (orientation: landscape)');
    expect(stylesheet).toContain(
      'grid-template-columns: auto minmax(280px, 480px) auto',
    );
  });
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm test -- src/game/app/domShell.test.ts src/styles.test.ts`

Expected: FAIL because `domShell.ts` does not exist and the new responsive CSS contracts
are absent.

- [ ] **Step 4: Implement semantic DOM creation**

`createDomShell` must create the following structure without `innerHTML`. The clear
panel creates and retains `nextButton` and `replayButton`; `showClear` changes their
visibility instead of replacing the elements:

```html
<main class="game-shell">
  <header class="hud">
    <button class="icon-button undo" aria-label="一手戻す">↶</button>
    <strong class="level-label">レベル 01</strong>
    <button class="icon-button sound" aria-label="サウンド">♫</button>
  </header>
  <section class="title-block">
    <h1>色をそろえよう！</h1>
    <p>ボトルをタップして水を移動しよう</p>
  </section>
  <section class="board-wrap">
    <canvas aria-label="カラーウォーターソート"></canvas>
  </section>
  <footer class="footer-controls">
    <button class="restart-button" aria-label="やり直す">↻</button>
  </footer>
  <section class="clear-panel" hidden>
    <h2>クリア！</h2>
    <p class="clear-moves"></p>
    <p class="clear-time"></p>
    <button class="next-button">次のレベル</button>
    <button class="replay-button">もう一度遊ぶ</button>
  </section>
  <section class="fatal-error" hidden>
    <p>ゲームを読み込めませんでした</p>
    <button>もう一度試す</button>
  </section>
</main>
```

Build the tree with `createElement`, `textContent`, `className`, `append`, and
`setAttribute`. `showClear` updates the retained moves/time elements and shows
`次のレベル` only when `hasNext` is true; `もう一度遊ぶ` remains available at every
level.

- [ ] **Step 5: Add safe-area grid CSS alongside the legacy Phaser CSS**

Use these layout contracts in `styles.css`:

```css
html,
body,
#app {
  width: 100%;
  min-width: 320px;
  height: 100%;
  min-height: 100%;
}

body {
  margin: 0;
  overflow: hidden;
  overscroll-behavior: none;
  background: linear-gradient(155deg, #fffaf2, #f3efff 52%, #e9f7ff);
  color: #514a69;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.game-shell {
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  width: min(100%, 480px);
  height: 100vh;
  height: 100dvh;
  margin: 0 auto;
  padding:
    max(8px, env(safe-area-inset-top))
    12px
    max(8px, env(safe-area-inset-bottom));
}

.board-wrap,
.board-wrap canvas {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.board-wrap canvas {
  display: block;
  touch-action: none;
}

button {
  min-width: 56px;
  min-height: 56px;
  border: 0;
  -webkit-tap-highlight-color: transparent;
}

button:active,
button.is-pressed {
  transform: scale(0.94);
}

@media (orientation: landscape) {
  .game-shell {
    grid-template-columns: auto minmax(280px, 480px) auto;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .hud {
    grid-column: 1;
    grid-row: 1 / span 2;
    flex-direction: column;
    align-self: center;
  }

  .title-block {
    display: none;
  }

  .board-wrap {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  .footer-controls {
    grid-column: 3;
    grid-row: 1 / span 2;
    align-self: center;
  }
}
```

Add these exact visual contracts without external assets:

```css
.hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title-block {
  text-align: center;
}

.title-block h1 {
  margin: 4px 0;
  font-size: clamp(24px, 7vw, 36px);
}

.title-block p {
  margin: 0 0 6px;
  color: #817994;
  font-size: clamp(14px, 4vw, 18px);
}

.icon-button,
.restart-button {
  border-radius: 999px;
  color: #665d82;
  background: linear-gradient(155deg, #ffffff, #e9e4fb);
  box-shadow: 0 6px 16px rgb(81 72 107 / 16%);
  font-size: 28px;
  font-weight: 700;
}

.restart-button {
  color: #ffffff;
  background: linear-gradient(155deg, #ded4ff, #9a78e8);
}

button:disabled {
  opacity: 0.35;
}

.clear-panel,
.fatal-error {
  position: fixed;
  inset: 50% auto auto 50%;
  z-index: 10;
  box-sizing: border-box;
  width: min(calc(100% - 32px), 420px);
  padding: 28px;
  transform: translate(-50%, -50%);
  border-radius: 30px;
  background: rgb(255 255 255 / 94%);
  box-shadow: 0 18px 60px rgb(79 69 105 / 20%);
  text-align: center;
}
```

Keep the existing `#game` and legacy `canvas` compatibility selectors in this task so the
currently deployed Phaser entry still runs until Task 8 performs the atomic switch.

- [ ] **Step 6: Verify GREEN**

Run: `npm test -- src/game/app/domShell.test.ts src/styles.test.ts`

Expected: DOM and CSS tests PASS. Retain the existing legacy assertions until Task 8.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/styles.css \
  src/styles.test.ts src/game/app/domShell.ts \
  src/game/app/domShell.test.ts
git commit -m "feat: add responsive Japanese game shell"
```

---

### Task 7: GameApp orchestration and queued interaction

**Files:**
- Create: `src/game/app/GameApp.ts`
- Create: `src/game/app/GameApp.test.ts`
- Reuse: `src/game/session/reducer.ts`
- Reuse: `src/game/domain/rules.ts`
- Reuse: `src/game/session/progress.ts`

**Interfaces:**
- Consumes:

```ts
export interface GameAppPorts {
  shell: DomShell;
  renderer: CanvasRenderer;
  scheduler: RenderScheduler;
  pointer: PointerController;
  quality: AdaptiveQuality;
  sound: SoundController;
  storage: StorageLike;
  now: () => number;
}
```

- Produces:

```ts
export class GameApp {
  constructor(ports: GameAppPorts);
  start(): void;
  hitTestTube(x: number, y: number): number | null;
  setPressedTube(index: number | null): void;
  tapTube(index: number): Promise<void>;
  undo(): void;
  restart(): void;
  toggleSound(): void;
  nextLevel(): void;
  replay(): void;
  resize(input: {
    width: number;
    height: number;
  }): void;
  pause(): void;
  resume(): void;
  destroy(): Promise<void>;
}
```

- [ ] **Step 1: Write failing integration tests with narrow fake ports**

```ts
import { describe, expect, it, vi } from 'vitest';
import { computeResponsiveLayout } from '../canvas/responsiveLayout';
import { GameApp } from './GameApp';

function createPorts() {
  return {
    shell: {
      setLevel: vi.fn(),
      setGuideVisible: vi.fn(),
      setSoundEnabled: vi.fn(),
      setControlsEnabled: vi.fn(),
      showClear: vi.fn(),
      hideClear: vi.fn(),
      showFatalError: vi.fn(),
    },
    renderer: { resize: vi.fn(), render: vi.fn(), clearCache: vi.fn() },
    scheduler: {
      invalidate: vi.fn(),
      animate: vi.fn(async (step: (timeMs: number) => boolean) => {
        step(0);
        step(900);
      }),
      stop: vi.fn(),
      running: false,
    },
    pointer: {
      setBusy: vi.fn(),
      takeQueuedTap: vi.fn<() => number | null>(() => null),
      reset: vi.fn(),
    },
    quality: {
      config: {
        level: 'high',
        maxPixelRatio: 2,
        glow: true,
        confettiCount: 32,
      },
      observeFrame: vi.fn(),
    },
    sound: {
      enabled: true,
      play: vi.fn(),
      setEnabled: vi.fn(),
      dispose: vi.fn(async () => undefined),
    },
    storage: {
      value: null as string | null,
      getItem() { return this.value; },
      setItem(_key: string, value: string) { this.value = value; },
    },
    now: vi.fn(() => 0),
  };
}

describe('GameApp', () => {
  it('starts directly at the persisted level', () => {
    const ports = createPorts();
    ports.storage.value = JSON.stringify({
      version: 1,
      currentLevel: 3,
      bestMoves: {},
      soundEnabled: true,
    });
    const app = new GameApp(ports as never);

    app.start();

    expect(ports.shell.setLevel).toHaveBeenCalledWith(3);
    expect(ports.scheduler.invalidate).toHaveBeenCalled();
  });

  it('invalidates immediately when the pressed tube changes', () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.start();
    ports.scheduler.invalidate.mockClear();

    app.setPressedTube(2);

    expect(ports.scheduler.invalidate).toHaveBeenCalledOnce();
  });

  it('hit-tests using local Canvas coordinates after resize', () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.start();
    app.resize({ width: 366, height: 540 });
    const layout = computeResponsiveLayout({ width: 366, height: 540, tubeCount: 6 });
    const first = layout.tubes[0]!;

    expect(app.hitTestTube(first.centerX, first.centerY)).toBe(0);
    expect(app.hitTestTube(-10, -10)).toBeNull();
  });

  it('selects a source and completes a legal pour', async () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.start();

    await app.tapTube(0);
    await app.tapTube(5);

    expect(ports.pointer.setBusy).toHaveBeenCalledWith(true);
    expect(ports.scheduler.animate).toHaveBeenCalledOnce();
    expect(ports.pointer.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('processes one queued tap after the pour commits', async () => {
    const ports = createPorts();
    ports.pointer.takeQueuedTap
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(null);
    const app = new GameApp(ports as never);
    app.start();

    await app.tapTube(0);
    await app.tapTube(5);

    expect(ports.pointer.takeQueuedTap).toHaveBeenCalledOnce();
    expect(ports.scheduler.invalidate).toHaveBeenCalled();
  });

  it('ignores gameplay taps while the page is paused', async () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.start();

    app.pause();
    await app.tapTube(0);
    expect(ports.sound.play).not.toHaveBeenCalled();

    app.resume();
    await app.tapTube(0);
    expect(ports.sound.play).toHaveBeenCalledWith('select');
  });

  it('commits once and unlocks when resize cancels an active pour', async () => {
    const ports = createPorts();
    let finishAnimation: () => void = () => undefined;
    ports.scheduler.animate.mockImplementation(
      () => new Promise<void>((resolve) => { finishAnimation = resolve; }),
    );
    ports.scheduler.stop.mockImplementation(() => finishAnimation());
    const app = new GameApp(ports as never);
    app.start();
    app.resize({ width: 366, height: 540 });
    await app.tapTube(0);
    const pouring = app.tapTube(5);
    await Promise.resolve();

    app.resize({ width: 360, height: 500 });
    await pouring;

    expect(ports.pointer.setBusy).toHaveBeenLastCalledWith(false);
    expect(ports.pointer.takeQueuedTap).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- src/game/app/GameApp.test.ts`

Expected: FAIL because `GameApp.ts` is missing.

- [ ] **Step 3: Implement state, rendering, and control synchronization**

`GameApp` must hold:

```ts
private readonly shell: DomShell;
private readonly renderer: CanvasRenderer;
private readonly scheduler: RenderScheduler;
private readonly pointer: PointerController;
private readonly quality: AdaptiveQuality;
private readonly sound: SoundController;
private readonly storage: StorageLike;
private readonly now: () => number;
private state: GameState;
private progress: ProgressData;
private layout: ResponsiveLayout | null = null;
private pressedTube: number | null = null;
private pour: SceneRenderModel['pour'] = null;
private paused = false;
private destroyed = false;
private animationToken = 0;
private lastElapsedSample = 0;

constructor(ports: GameAppPorts) {
  this.shell = ports.shell;
  this.renderer = ports.renderer;
  this.scheduler = ports.scheduler;
  this.pointer = ports.pointer;
  this.quality = ports.quality;
  this.sound = ports.sound;
  this.storage = ports.storage;
  this.now = ports.now;
}
```

`start()` must load progress, create the selected level state, set
`lastElapsedSample = this.now()`, synchronize shell text and sound, and call
`scheduler.invalidate()`.

`render()` must compute valid targets from the existing rules, call
`buildSceneRenderModel`, then call `renderer.render(model)`. It must never change
`GameState`.

`setPressedTube(index)` must only update `pressedTube` and call `scheduler.invalidate()`;
it must not call the reducer or change the board.

`hitTestTube(x, y)` must call the Task 1 `hitTestTube` helper with the current layout and
return `null` before the first valid resize.

`tapTube(index)` must:

```ts
async tapTube(index: number): Promise<void> {
  if (this.destroyed || this.paused) return;
  this.syncElapsed();
  const transition = tapTube(this.state, index);
  this.state = transition.state;

  if (transition.effect.kind === 'selected') {
    this.sound.play('select');
    this.shell.setGuideVisible(false);
    this.scheduler.invalidate();
    return;
  }
  if (transition.effect.kind === 'deselected') {
    this.scheduler.invalidate();
    return;
  }
  if (transition.effect.kind === 'invalid') {
    this.sound.play('invalid');
    this.playInvalidShake(transition.effect.tube);
    return;
  }
  if (transition.effect.kind !== 'pour') return;

  await this.playAndCommitPour(transition.effect.move);
}
```

`playAndCommitPour` must set `pointer.setBusy(true)`, build frames with
`samplePourFrame`, run them through `scheduler.animate`, commit in a `finally`, reset busy,
check solved state, and only when not solved call `pointer.takeQueuedTap()` once and pass
that tube back to `tapTube`.

Animation completion must use a Promise resolved when `samplePourFrame(...).done` is true.
Await the Promise returned by `scheduler.animate`; stopping the scheduler resolves that
Promise, so the `finally` block must still call `syncElapsed()` and
`commitPendingMove`. Track the previous animation timestamp inside the scheduler callback and call
`quality.observeFrame(currentTime - previousTime)` for positive frame deltas. When the
returned quality level changes, call `renderer.resize` with the current layout dimensions
and new `maxPixelRatio`; `resize` clears the cache. Continue the same animation frame
without changing hit areas.

Capture `const token = ++this.animationToken` before starting. After the `finally` commit,
return without a win check or queued tap when `token !== this.animationToken`,
`this.paused`, or `this.destroyed`. This makes resize, pause, restart, and destroy safe
animation-cancel boundaries.

- [ ] **Step 4: Implement undo, restart, sound, level progression, and resize**

Use existing reducer and progress functions:

```ts
private syncElapsed(): void {
  if (this.paused) return;
  const current = this.now();
  const delta = Math.max(0, current - this.lastElapsedSample);
  this.lastElapsedSample = current;
  this.state = advanceElapsed(this.state, delta);
}

undo(): void {
  this.syncElapsed();
  this.state = undo(this.state);
  this.scheduler.invalidate();
}

restart(): void {
  this.animationToken += 1;
  this.scheduler.stop();
  this.pointer.reset();
  this.state = restart(this.state);
  this.lastElapsedSample = this.now();
  this.scheduler.invalidate();
}

toggleSound(): void {
  const enabled = !this.sound.enabled;
  this.sound.setEnabled(enabled);
  this.progress = { ...this.progress, soundEnabled: enabled };
  saveProgress(this.storage, this.progress);
  this.shell.setSoundEnabled(enabled);
}

pause(): void {
  if (this.paused || this.destroyed) return;
  this.syncElapsed();
  this.paused = true;
  this.animationToken += 1;
  this.scheduler.stop();
  this.pointer.reset();
}

resume(): void {
  if (!this.paused || this.destroyed) return;
  this.lastElapsedSample = this.now();
  this.paused = false;
  this.scheduler.invalidate();
}
```

`resize` receives the CSS size of `shell.board`, computes a local-coordinate layout, caps
the renderer ratio with `quality.config`, clears renderer cache, and invalidates once.
`nextLevel` and `replay` must reset scheduler and pointer before replacing state.
`destroy` must set `destroyed = true` before stopping the scheduler so a resolved animation
cannot run a queued tap or win sequence; then reset the pointer and await `sound.dispose()`.

When `resize` occurs during a pending move, it must increment `animationToken`, stop the
scheduler, commit the pending move once, clear the temporary pour frame, reset the pointer,
and then calculate the new layout. `commitPendingMove` is idempotent, so the canceled
animation's later `finally` cannot apply the move twice.

- [ ] **Step 5: Verify GREEN and regression tests**

Run:

```bash
npm test -- src/game/app/GameApp.test.ts \
  src/game/session/reducer.test.ts \
  src/game/domain/rules.test.ts \
  src/game/session/progress.test.ts
```

Expected: all listed tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/app/GameApp.ts src/game/app/GameApp.test.ts
git commit -m "feat: orchestrate canvas gameplay interactions"
```

---

### Task 8: Browser entry, lifecycle, and Phaser removal

**Files:**
- Modify: `src/main.ts`
- Create: `src/main.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `src/game/scenes/GameScene.ts`
- Delete: `src/game/input/pointerOwnership.ts`
- Delete: `src/game/input/pointerOwnership.test.ts`
- Delete: `src/game/ui/UIButton.ts`
- Delete: `src/game/ui/safeArea.ts`
- Delete: `src/game/ui/safeArea.test.ts`
- Delete: `src/game/view/layout.ts`
- Delete: `src/game/view/layout.test.ts`
- Delete: `src/game/view/timeline.ts`
- Delete: `src/game/view/timeline.test.ts`
- Delete: `src/game/view/PourAnimator.ts`
- Delete: `src/game/view/TubeView.ts`
- Delete: `src/game/view/palette.ts`
- Modify: `src/styles.css`
- Modify: `src/styles.test.ts`
- Modify: `index.html`

**Interfaces:**
- Produces:

```ts
export function startGame(input: {
  document: Document;
  window: Window;
  parent: HTMLElement;
}): Promise<() => Promise<void>>;
```

- [ ] **Step 1: Write failing entry and lifecycle tests**

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { startGame } from './main';

describe('startGame', () => {
  it('creates one canvas and reacts to resize without login', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const cleanup = await startGame({
      document,
      window,
      parent: document.querySelector<HTMLElement>('#app')!,
    });

    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(document.body.textContent).toContain('色をそろえよう！');
    window.dispatchEvent(new Event('resize'));
    await cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the Japanese retry panel when Canvas 2D is unavailable', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await expect(startGame({
      document,
      window,
      parent: document.querySelector<HTMLElement>('#app')!,
    })).rejects.toThrow('Canvas 2D is unavailable');

    expect(document.body.textContent).toContain('ゲームを読み込めませんでした');
    vi.restoreAllMocks();
  });
});
```

Before changing `styles.css`, replace the old `#game` viewport test with:

```ts
it('removes the legacy Phaser root contract', () => {
  expect(stylesheet).not.toMatch(/(^|,)\s*#game\s*(,|\{)/m);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- src/main.test.ts src/styles.test.ts`

Expected: FAIL because the current `main.ts` only constructs Phaser and exports no
`startGame`, and the old stylesheet still contains the `#game` contract.

- [ ] **Step 3: Implement the browser composition root**

`startGame` must:

1. create the DOM shell;
2. throw after `shell.showFatalError()` when `canvas.getContext('2d')` is null;
3. create `AdaptiveQuality`, `CanvasRenderer`, `RenderScheduler`, `SoundController`, and
   a `PointerController` whose hit-test closure calls `app.hitTestTube`;
4. construct `GameApp`, measure `shell.board`, call `app.resize`, then call `app.start`;
5. convert pointer coordinates from `clientX/clientY` into Canvas CSS coordinates;
6. call `setPointerCapture` on accepted `pointerdown`;
7. map `pressed` to `app.setPressedTube(tube)`, clear pressed state on cancel/up, and pass
   `tap` results to `app.tapTube`;
8. connect undo, sound, restart, next-level, replay, and retry DOM buttons;
9. use `ResizeObserver` on `shell.board`, with window `resize` as fallback, and pass the
   board's CSS width/height to `app.resize`;
10. observe `orientationchange`, `visibilitychange`, `pagehide`, and `pageshow`;
11. return an async cleanup function that disconnects the observer, removes every
    listener, and calls
    `app.destroy()`.

Use a deferred closure without duplicate layout state:

```ts
let app: GameApp | null = null;
const pointer = new PointerController(
  (x, y) => app?.hitTestTube(x, y) ?? null,
);
app = new GameApp({
  shell,
  renderer,
  scheduler,
  pointer,
  quality,
  sound,
  storage: getStorage(window),
  now: () => window.performance.now(),
});
const boardRect = shell.board.getBoundingClientRect();
app.resize({ width: boardRect.width, height: boardRect.height });
app.start();
```

Use this storage fallback so property access failures do not block gameplay:

```ts
function getStorage(window: Window): StorageLike {
  try {
    return window.localStorage;
  } catch {
    return {
      getItem: () => null,
      setItem: () => undefined,
    };
  }
}
```

The visibility handlers must be:

```ts
const syncVisibility = (): void => {
  if (document.hidden) app?.pause();
  else app?.resume();
};
const handlePageHide = (): void => app?.pause();
const handlePageShow = (): void => app?.resume();
```

The module-level browser boot must be:

```ts
if (typeof document !== 'undefined') {
  const parent = document.querySelector<HTMLElement>('#app');
  if (parent !== null) {
    void startGame({ document, window, parent }).catch(() => undefined);
  }
}
```

- [ ] **Step 4: Remove Phaser from code and dependencies**

Run: `npm uninstall phaser`

Delete every legacy file listed in this task only after `startGame` is connected. Confirm
no source import contains Phaser:

Run: `rg -n "phaser|Phaser" src package.json`

Expected: no matches.

Change `index.html` to contain `<div id="app"></div>`. Remove the legacy `#game` CSS and
its old fixed-canvas assertions from `styles.test.ts`; retain every Task 6 responsive,
safe-area, and landscape assertion.

- [ ] **Step 5: Verify entry, full tests, and production build**

Run:

```bash
npm test -- src/main.test.ts
npm run test
npm run build
```

Expected: entry tests PASS, all remaining tests PASS, and Vite build succeeds without a
Phaser chunk.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/main.test.ts index.html src/styles.css \
  src/styles.test.ts package.json package-lock.json \
  src/game/scenes/GameScene.ts src/game/input/pointerOwnership.ts \
  src/game/input/pointerOwnership.test.ts src/game/ui/UIButton.ts \
  src/game/ui/safeArea.ts src/game/ui/safeArea.test.ts \
  src/game/view/layout.ts src/game/view/layout.test.ts \
  src/game/view/timeline.ts src/game/view/timeline.test.ts \
  src/game/view/PourAnimator.ts src/game/view/TubeView.ts \
  src/game/view/palette.ts
git commit -m "refactor: replace Phaser with DOM canvas runtime"
```

---

### Task 9: Bundle budgets and release regression checks

**Files:**
- Modify: `scripts/check-bundle-size.mjs`
- Create: `scripts/check-bundle-size.test.mjs`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- `check-bundle-size.mjs` exits non-zero when:
  - gzip JavaScript exceeds 102,400 bytes;
  - gzip CSS exceeds 15,360 bytes;
  - any built JavaScript contains `Phaser` or `phaser`;
  - `dist/index.html` has no relative JS/CSS asset path.

- [ ] **Step 1: Write failing Node tests for the release checker**

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inspectBundle } from './check-bundle-size.mjs';

test('accepts a small relative-path build without Phaser', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'water-sort-size-'));
  await mkdir(path.join(root, 'assets'));
  await writeFile(
    path.join(root, 'index.html'),
    '<script type="module" src="./assets/app.js"></script>'
      + '<link rel="stylesheet" href="./assets/app.css">',
  );
  await writeFile(path.join(root, 'assets/app.js'), 'export const ready=true;');
  await writeFile(path.join(root, 'assets/app.css'), 'body{margin:0}');

  const report = await inspectBundle(root);
  assert.equal(report.errors.length, 0);
});

test('rejects Phaser and absolute asset paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'water-sort-size-'));
  await mkdir(path.join(root, 'assets'));
  await writeFile(
    path.join(root, 'index.html'),
    '<script type="module" src="/assets/app.js"></script>',
  );
  await writeFile(path.join(root, 'assets/app.js'), 'const Phaser = {};');

  const report = await inspectBundle(root);
  assert.ok(report.errors.some((error) => error.includes('Phaser')));
  assert.ok(report.errors.some((error) => error.includes('relative')));
});
```

- [ ] **Step 2: Run the checker tests and verify RED**

Run: `node --test scripts/check-bundle-size.test.mjs`

Expected: FAIL because `inspectBundle` is not exported.

- [ ] **Step 3: Implement gzip and dependency inspection**

Use these imports and export this shape from `check-bundle-size.mjs`:

```js
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export async function inspectBundle(distDir) {
  const files = await readdir(path.join(distDir, 'assets'));
  const jsFiles = files.filter((file) => file.endsWith('.js'));
  const cssFiles = files.filter((file) => file.endsWith('.css'));
  const errors = [];
  let jsGzipBytes = 0;
  let cssGzipBytes = 0;

  for (const file of jsFiles) {
    const contents = await readFile(path.join(distDir, 'assets', file));
    jsGzipBytes += gzipSync(contents).byteLength;
    if (/phaser/i.test(contents.toString('utf8'))) {
      errors.push(`Phaser found in ${file}`);
    }
  }
  for (const file of cssFiles) {
    cssGzipBytes += gzipSync(
      await readFile(path.join(distDir, 'assets', file)),
    ).byteLength;
  }
  if (jsGzipBytes > 102_400) errors.push(`JavaScript gzip ${jsGzipBytes} > 102400`);
  if (cssGzipBytes > 15_360) errors.push(`CSS gzip ${cssGzipBytes} > 15360`);

  const html = await readFile(path.join(distDir, 'index.html'), 'utf8');
  if (/\b(?:src|href)="\/assets\//.test(html)) {
    errors.push('GitHub Pages assets must use relative paths');
  }
  return { jsGzipBytes, cssGzipBytes, errors };
}
```

The CLI path must be guarded so importing the module in the Node test does not inspect the
real `dist` folder:

```js
if (
  process.argv[1] !== undefined
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const report = await inspectBundle('dist');
  console.log(`JavaScript gzip: ${report.jsGzipBytes} bytes`);
  console.log(`CSS gzip: ${report.cssGzipBytes} bytes`);
  for (const error of report.errors) console.error(error);
  if (report.errors.length > 0) process.exitCode = 1;
}
```

- [ ] **Step 4: Add the checker test to the project check command**

Update scripts:

```json
{
  "scripts": {
    "test:scripts": "node --test scripts/*.test.mjs",
    "check": "npm run test && npm run test:scripts && npm run build && npm run check:size"
  }
}
```

Update `README.md` with the exact local commands, public URL, no-login behavior, supported
320～480px portrait range, landscape behavior, and the three quality levels.

- [ ] **Step 5: Verify GREEN and full release gate**

Run:

```bash
node --test scripts/check-bundle-size.test.mjs
npm run check
```

Expected: all Vitest and Node tests PASS, build succeeds, JavaScript gzip is below
102,400 bytes, CSS gzip is below 15,360 bytes, and no Phaser match is reported.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-bundle-size.mjs scripts/check-bundle-size.test.mjs \
  package.json README.md
git commit -m "test: enforce mobile release budgets"
```

---

### Task 10: Mobile validation, GitHub Pages deployment, and production smoke test

**Files:**
- Modify only if validation exposes a defect: files named by the failing test.
- No source change is expected when all gates pass.

**Interfaces:**
- Consumes: the completed production build and existing GitHub Pages workflow.
- Produces: a successful GitHub Actions Pages run and a playable public URL.

- [ ] **Step 1: Run the complete local release gate**

Run:

```bash
npm ci
npm run check
git status --short
```

Expected: every test and build check passes. Only known local helper artifacts outside the
tracked implementation—`github-pages/` and `scripts/create-single-file.mjs`—may remain
untracked and untouched; no generated `dist/` file is staged.

- [ ] **Step 2: Check the five portrait and two landscape layouts**

For each viewport below, verify title, controls, every bottle, and restart button remain
inside the visible safe area:

```text
320×568
360×640
360×800
390×844
430×932
568×320
844×390
```

Verify each bottle hit target is at least 56×72 CSS pixels, a 13-pixel move cancels a
tap, a fast second tap is processed once after pouring, and the final pour unlock occurs
within 900 milliseconds.

- [ ] **Step 3: Push the reviewed commits to the public repository**

Run:

```bash
git log --oneline --decorate -12
GIT_SSH_COMMAND='ssh -i /Users/mac/.ssh/codex_youxi_ed25519 -o IdentitiesOnly=yes' \
  git push github main
```

Expected: the `main` branch updates on
`https://github.com/aazhihui12-dotcom/youxi`.

- [ ] **Step 4: Verify the Pages workflow**

Open the latest `Deploy game to GitHub Pages` workflow run and verify both build and
deploy jobs complete successfully.

Expected: workflow conclusion `success`.

- [ ] **Step 5: Smoke-test the public page and assets**

Run:

```bash
curl -sS -L -o /tmp/youxi-index.html -w '%{http_code}\n' \
  'https://aazhihui12-dotcom.github.io/youxi/?mobile-canvas=1'
rg -o 'assets/[^"]+\\.(js|css)' /tmp/youxi-index.html
```

For every printed asset path, request
`https://aazhihui12-dotcom.github.io/youxi/<asset-path>` and expect HTTP 200.
Confirm the HTML title is `カラーウォーターソート` and no login page appears.

- [ ] **Step 6: Record final evidence**

Report:

- the public game URL;
- the successful workflow run URL;
- total Vitest and Node test counts;
- JavaScript and CSS gzip byte totals;
- confirmed portrait and landscape viewport list;
- any automatic quality downgrade observed during manual device testing.

Do not claim deployment complete until the public HTML, JavaScript, and CSS all return
HTTP 200.
