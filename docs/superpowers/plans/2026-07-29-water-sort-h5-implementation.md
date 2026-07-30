# Water Sort H5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, Japanese-language, mobile-first Water Sort H5 game with eight original solvable levels and lightweight 2.5D visuals.

**Architecture:** Keep all puzzle rules and session transitions in pure TypeScript, independent from Phaser. Phaser owns rendering, input, animation, responsive layout, and effects; storage, analytics, and advertising sit behind small adapters so failures cannot stop play.

**Tech Stack:** Phaser 3.90.0, Vite 8.1.5, TypeScript 7.0.2, Vitest 4.1.10, browser `localStorage`

## Global Constraints

- Render as a 9:16 portrait game using a 540×960 logical canvas.
- All visible copy is Japanese and must fit at 360×640 through 430×932 CSS pixels.
- Use lightweight 2.5D gradients, highlights, masks, shadows, and tweens; do not add a real-time 3D engine.
- Include exactly eight original levels: levels 1–3 use 4 colors/6 tubes, levels 4–6 use 5 colors/7 tubes, and levels 7–8 use 6 colors/8 tubes.
- Each tube has a capacity of four color units.
- The production build target is no more than 3,000,000 total bytes in `dist/`.
- Do not connect an external ad SDK, analytics SDK, account system, payment system, leaderboard, or server API.
- Keep `sources/` read-only.
- Follow test-driven development for domain logic and pure layout/timeline functions.
- Commit after every task with only that task’s files staged.

---

## File Map

```text
.
├── index.html                         # Vite entry document and game mount
├── package.json                       # Scripts and pinned dependency ranges
├── package-lock.json                  # Reproducible dependency graph
├── tsconfig.json                      # Strict TypeScript configuration
├── vite.config.ts                     # Production asset and base settings
├── vitest.config.ts                   # Node-based unit test configuration
├── scripts/
│   └── check-bundle-size.mjs          # Fails when dist exceeds 3 MB
└── src/
    ├── main.ts                        # Creates the Phaser.Game instance
    ├── styles.css                     # Full-screen page and safe-area styling
    └── game/
        ├── constants.ts               # Logical dimensions and tube capacity
        ├── domain/
        │   ├── types.ts               # Board, move, level, and session types
        │   ├── rules.ts               # Pure pour and solved-state rules
        │   └── rules.test.ts
        ├── levels/
        │   ├── levels.ts              # Eight original level definitions
        │   ├── repository.ts           # Bounds-safe level lookup
        │   ├── solver.ts               # Breadth-first solvability checker
        │   └── levels.test.ts
        ├── session/
        │   ├── reducer.ts              # Selection, pending move, undo, restart
        │   ├── reducer.test.ts
        │   ├── progress.ts             # Defensive localStorage persistence
        │   └── progress.test.ts
        ├── adapters/
        │   ├── analytics.ts            # Typed no-op analytics adapter
        │   ├── ads.ts                  # Typed no-op ad adapter
        │   └── adapters.test.ts
        ├── view/
        │   ├── palette.ts              # Approved 2.5D color tokens
        │   ├── layout.ts               # Pure responsive tube coordinates
        │   ├── layout.test.ts
        │   ├── TubeView.ts             # One interactive glass tube
        │   ├── PourAnimator.ts          # Ordered pour animation
        │   ├── timeline.ts              # Pure animation phase calculations
        │   └── timeline.test.ts
        ├── audio/
        │   └── SoundController.ts       # Synthesized UI and pour sounds
        ├── ui/
        │   ├── copy.ts                  # Japanese strings
        │   └── UIButton.ts              # Reusable round icon control
        └── scenes/
            └── GameScene.ts             # Game orchestration and win overlay
```

### Task 1: Project Foundation and Bootable Canvas

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/styles.css`
- Create: `src/game/constants.ts`
- Create: `src/main.ts`

**Interfaces:**
- Produces: `GAME_WIDTH`, `GAME_HEIGHT`, `TUBE_CAPACITY`, and a bootable Phaser canvas mounted under `#game`.

- [ ] **Step 1: Install the pinned toolchain**

Run:

```bash
npm init -y
npm install phaser@3.90.0
npm install --save-dev vite@8.1.5 typescript@7.0.2 vitest@4.1.10
```

Expected: `package-lock.json` is created and `npm ls --depth=0` lists the four requested packages.

- [ ] **Step 2: Configure scripts and strict TypeScript**

Set the scripts in `package.json` to:

```json
{
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals"],
    "allowImportingTsExtensions": false
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

Create `vite.config.ts` with `base: './'`, `assetsInlineLimit: 4096`, and `build.target: 'es2020'`. Create `vitest.config.ts` with `environment: 'node'`, `globals: true`, and test pattern `src/**/*.test.ts`.

- [ ] **Step 3: Add the constants and minimal Phaser entry**

Create `src/game/constants.ts`:

```ts
export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;
export const TUBE_CAPACITY = 4;
```

Create `src/main.ts`:

```ts
import Phaser from 'phaser';
import './styles.css';
import { GAME_HEIGHT, GAME_WIDTH } from './game/constants';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#fffaf2',
  transparent: false,
  render: { antialias: true, roundPixels: false },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: {
    create(this: Phaser.Scene) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '色をそろえよう！', {
        color: '#4d4664',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '34px',
        fontStyle: 'bold',
      }).setOrigin(0.5);
    },
  },
});
```

Create `index.html` with a viewport-fit meta tag, a `#game` element, and a module script for `/src/main.ts`. In `src/styles.css`, remove page margins, use `100dvh`, apply the approved pale gradient, hide overflow, disable touch selection, and center the canvas.

- [ ] **Step 4: Verify the build**

Run:

```bash
npm run build
```

Expected: a successful Vite build with a 540×960 Phaser configuration.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts index.html src
git commit -m "chore: scaffold Phaser Water Sort game"
```

### Task 2: Pure Water Sort Rules

**Files:**
- Create: `src/game/domain/types.ts`
- Create: `src/game/domain/rules.ts`
- Create: `src/game/domain/rules.test.ts`

**Interfaces:**
- Produces: `ColorId`, `TubeState`, `BoardState`, `Move`, `cloneBoard()`, `getPour()`, `applyMove()`, `getValidTargets()`, and `isSolved()`.
- Consumers: all later session, solver, and scene tasks.

- [ ] **Step 1: Define domain types**

```ts
export type ColorId = 'pink' | 'yellow' | 'mint' | 'blue' | 'purple' | 'orange';
export type TubeState = ColorId[];
export type BoardState = TubeState[];

export interface Move {
  from: number;
  to: number;
  amount: number;
  color: ColorId;
}

export interface LevelDefinition {
  id: number;
  tubes: BoardState;
}
```

- [ ] **Step 2: Write failing rule tests**

Add tests that assert:

```ts
expect(getPour([['pink'], []], 0, 1)).toEqual({
  from: 0, to: 1, amount: 1, color: 'pink',
});
expect(getPour([['pink'], ['blue']], 0, 1)).toBeNull();
expect(getPour([['blue', 'pink', 'pink'], ['pink', 'pink']], 0, 1)?.amount).toBe(2);
expect(getPour([['blue', 'pink', 'pink'], ['pink', 'pink', 'pink']], 0, 1)?.amount).toBe(1);
expect(getPour([['pink'], ['pink', 'pink', 'pink', 'pink']], 0, 1)).toBeNull();
expect(getPour([['pink'], []], 0, 0)).toBeNull();
expect(applyMove([['blue', 'pink'], []], {
  from: 0, to: 1, amount: 1, color: 'pink',
})).toEqual([['blue'], ['pink']]);
expect(isSolved([['pink', 'pink', 'pink', 'pink'], []])).toBe(true);
expect(isSolved([['pink', 'pink'], []])).toBe(false);
expect(getValidTargets([['pink'], [], ['pink'], ['blue']], 0)).toEqual([1, 2]);
```

- [ ] **Step 3: Run the tests and confirm the red state**

Run: `npm test -- src/game/domain/rules.test.ts`

Expected: FAIL because rule functions are not defined.

- [ ] **Step 4: Implement the rule engine**

Implement `getPour()` using these exact checks in order:

1. Reject out-of-range indexes, identical indexes, empty source, and full destination.
2. Read the source top color.
3. Reject a non-empty destination whose top color differs.
4. Count the contiguous source units matching the top color.
5. Return `amount = Math.min(contiguousCount, capacity - destination.length)`.

Implement `applyMove()` by cloning every tube, validating that the requested source suffix matches `move.color`, removing exactly `move.amount`, and appending it to the destination. Throw `RangeError` only for a structurally invalid `Move` object; ordinary illegal taps are represented by `getPour() === null`.

Implement `isSolved()` as:

```ts
export function isSolved(board: BoardState, capacity = TUBE_CAPACITY): boolean {
  return board.every(
    (tube) => tube.length === 0 ||
      (tube.length === capacity && tube.every((color) => color === tube[0])),
  );
}
```

- [ ] **Step 5: Run the domain tests**

Run: `npm test -- src/game/domain/rules.test.ts`

Expected: all rule tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/domain
git commit -m "feat: add Water Sort rule engine"
```

### Task 3: Eight Original Levels and Solvability Checks

**Files:**
- Create: `src/game/levels/levels.ts`
- Create: `src/game/levels/repository.ts`
- Create: `src/game/levels/solver.ts`
- Create: `src/game/levels/levels.test.ts`

**Interfaces:**
- Consumes: `BoardState`, `LevelDefinition`, `getPour()`, `applyMove()`, and `isSolved()`.
- Produces: `LEVELS`, `getLevel(id)`, `findMinimumMoves(board, maxStates)`.

- [ ] **Step 1: Write failing level validation tests**

Test all eight levels:

```ts
expect(LEVELS).toHaveLength(8);
expect(LEVELS.map((level) => level.tubes.length)).toEqual([6, 6, 6, 7, 7, 7, 8, 8]);

for (const level of LEVELS) {
  const counts = new Map<string, number>();
  level.tubes.flat().forEach((color) => counts.set(color, (counts.get(color) ?? 0) + 1));
  expect([...counts.values()].every((count) => count === 4)).toBe(true);
  expect(level.tubes.every((tube) => tube.length <= 4)).toBe(true);
  expect(isSolved(level.tubes)).toBe(false);
}

expect(LEVELS.map((level) => findMinimumMoves(level.tubes, 100_000))).toEqual([
  13, 14, 13, 16, 17, 17, 19, 19,
]);
expect(getLevel(0).id).toBe(1);
expect(getLevel(99).id).toBe(8);
```

- [ ] **Step 2: Run the tests and confirm the red state**

Run: `npm test -- src/game/levels/levels.test.ts`

Expected: FAIL because level modules do not exist.

- [ ] **Step 3: Add the exact level data**

Use the color aliases `P='pink'`, `Y='yellow'`, `M='mint'`, `B='blue'`, `V='purple'`, and `O='orange'`. Arrays are bottom-to-top:

```ts
export const LEVELS: readonly LevelDefinition[] = [
  { id: 1, tubes: [[P,Y,M,B],[Y,M,B,P],[M,B,P,Y],[B,P,Y,M],[],[]] },
  { id: 2, tubes: [[P,Y,P,Y],[M,B,M,B],[Y,P,Y,P],[B,M,B,M],[],[]] },
  { id: 3, tubes: [[P,Y,M,P],[Y,M,B,Y],[M,B,P,M],[B,P,Y,B],[],[]] },
  { id: 4, tubes: [[P,Y,M,B],[Y,M,B,V],[M,B,V,P],[B,V,P,Y],[V,P,Y,M],[],[]] },
  { id: 5, tubes: [[P,Y,P,M],[Y,M,B,Y],[M,B,V,M],[B,V,P,B],[V,P,V,Y],[],[]] },
  { id: 6, tubes: [[P,Y,M,V],[Y,B,V,P],[M,V,P,B],[B,P,Y,M],[V,M,B,Y],[],[]] },
  { id: 7, tubes: [[P,Y,M,B],[Y,M,B,V],[M,B,V,O],[B,V,O,P],[V,O,P,Y],[O,P,Y,M],[],[]] },
  { id: 8, tubes: [[P,Y,B,O],[Y,M,V,P],[M,B,O,Y],[B,V,P,M],[V,O,Y,B],[O,P,M,V],[],[]] },
];
```

Clone tube arrays when returning a level so callers cannot mutate the repository. `getLevel(id)` clamps `id` to 1–8.

- [ ] **Step 4: Implement the breadth-first solver**

`findMinimumMoves()` must:

1. Canonicalize a board by converting each tube to its comma-separated colors, sorting those tube strings, and joining with `|`.
2. Queue `{ board, depth }`, beginning at depth zero.
3. Generate each legal `from → to` pair through `getPour()` and `applyMove()`.
4. Skip states whose canonical key has already been visited.
5. Return the first solved depth.
6. Throw `Error('Solver state limit exceeded')` after `maxStates` unique states.

The sorting in the canonical key treats equivalent permutations of tube positions as the same puzzle state and keeps the eight tests below 100,000 states.

- [ ] **Step 5: Run the level tests**

Run: `npm test -- src/game/levels/levels.test.ts`

Expected: four level assertions pass, including exact minimum-move counts.

- [ ] **Step 6: Commit**

```bash
git add src/game/levels
git commit -m "feat: add eight verified Water Sort levels"
```

### Task 4: Session Reducer, Persistence, and Safe Adapters

**Files:**
- Create: `src/game/session/reducer.ts`
- Create: `src/game/session/reducer.test.ts`
- Create: `src/game/session/progress.ts`
- Create: `src/game/session/progress.test.ts`
- Create: `src/game/adapters/analytics.ts`
- Create: `src/game/adapters/ads.ts`
- Create: `src/game/adapters/adapters.test.ts`

**Interfaces:**
- Consumes: `BoardState`, `LevelDefinition`, `Move`, `getPour()`, and `applyMove()`.
- Produces: `GameState`, `createGameState()`, `tapTube()`, `commitPendingMove()`, `advanceElapsed()`, `undo()`, `restart()`, `ProgressData`, `loadProgress()`, `saveProgress()`, `AnalyticsAdapter`, `AdAdapter`, `createSafeAnalytics()`, and `createSafeAds()`.

- [ ] **Step 1: Write failing reducer tests**

Use a two-color fixture and test:

```ts
const level = { id: 1, tubes: [['blue','pink'], ['pink'], [], []] } as LevelDefinition;
let state = createGameState(level);

state = tapTube(state, 0).state;
expect(state.selectedTube).toBe(0);

const transition = tapTube(state, 1);
expect(transition.effect.kind).toBe('pour');
expect(transition.state.inputLocked).toBe(true);
expect(transition.state.board).toEqual(level.tubes);

const committed = commitPendingMove(transition.state);
expect(committed.board).toEqual([['blue'], ['pink','pink'], [], []]);
expect(committed.moveCount).toBe(1);
expect(committed.history).toHaveLength(1);
expect(tapTube(transition.state, 2).effect.kind).toBe('ignored');
expect(advanceElapsed(committed, 250).elapsedMs).toBe(250);
expect(undo(committed).board).toEqual(level.tubes);
expect(restart(committed).moveCount).toBe(0);
```

Also test deselecting the selected tube, tapping an empty source, and choosing an illegal destination.

- [ ] **Step 2: Run reducer tests and confirm the red state**

Run: `npm test -- src/game/session/reducer.test.ts`

Expected: FAIL because the reducer does not exist.

- [ ] **Step 3: Implement immutable session transitions**

Define:

```ts
export interface GameState {
  levelId: number;
  initialBoard: BoardState;
  board: BoardState;
  selectedTube: number | null;
  pendingMove: Move | null;
  history: BoardState[];
  moveCount: number;
  elapsedMs: number;
  inputLocked: boolean;
}

export type GameEffect =
  | { kind: 'selected'; tube: number }
  | { kind: 'deselected'; tube: number }
  | { kind: 'invalid'; tube: number }
  | { kind: 'pour'; move: Move }
  | { kind: 'ignored' };
```

`tapTube()` must leave `board` unchanged when it produces a `pour` effect. It sets `pendingMove`, clears selection, and locks input. `commitPendingMove()` applies the move, pushes a cloned pre-move board to history, increments `moveCount`, clears pending state, and unlocks. `advanceElapsed(state, deltaMs)` adds a non-negative finite delta to `elapsedMs`; invalid deltas leave the state unchanged. `undo()` is disabled while locked and restores the latest history item without rewinding elapsed time. `restart()` returns the cloned initial board with an empty history, zero moves, and zero elapsed time.

- [ ] **Step 4: Write persistence and adapter tests**

Test a small in-memory `StorageLike`:

```ts
expect(loadProgress(emptyStorage)).toEqual({
  version: 1,
  currentLevel: 1,
  bestMoves: {},
  soundEnabled: true,
});

brokenStorage.setItem('water-sort-progress', '{not-json');
expect(loadProgress(brokenStorage).currentLevel).toBe(1);

saveProgress(emptyStorage, {
  version: 1, currentLevel: 3, bestMoves: { '2': 14 }, soundEnabled: false,
});
expect(loadProgress(emptyStorage).currentLevel).toBe(3);

await expect(new NoopAdAdapter().showInterstitial('level-complete')).resolves.toBe('unavailable');
expect(() => new NoopAnalyticsAdapter().track('game_loaded')).not.toThrow();

const safeAnalytics = createSafeAnalytics({ track: () => { throw new Error('offline'); } });
expect(() => safeAnalytics.track('game_loaded')).not.toThrow();

const safeAds = createSafeAds({
  showInterstitial: async () => { throw new Error('offline'); },
  showRewarded: async () => { throw new Error('offline'); },
});
await expect(safeAds.showRewarded('extra-tube')).resolves.toBe('unavailable');
```

- [ ] **Step 5: Implement defensive persistence and adapters**

Use these contracts:

```ts
export interface ProgressData {
  version: 1;
  currentLevel: number;
  bestMoves: Record<string, number>;
  soundEnabled: boolean;
}

export type AnalyticsEvent =
  | 'game_loaded' | 'first_interaction' | 'level_started'
  | 'level_completed' | 'restart_clicked' | 'undo_clicked';

export interface AnalyticsAdapter {
  track(event: AnalyticsEvent, payload?: Record<string, string | number | boolean>): void;
}

export type AdPlacement = 'level-complete' | 'extra-tube';
export interface AdAdapter {
  showInterstitial(placement: AdPlacement): Promise<'completed' | 'unavailable'>;
  showRewarded(placement: AdPlacement): Promise<'completed' | 'unavailable'>;
}
```

Validate parsed progress before returning it: `version` must equal 1, `currentLevel` must be an integer from 1 through 8, `soundEnabled` must be boolean, and every `bestMoves` value must be a positive integer. Any invalid field resets the complete object to defaults. Catch JSON, storage quota, and unavailable-storage errors.

`createSafeAnalytics(delegate)` catches synchronous delegate errors. `createSafeAds(delegate)` catches synchronous throws and Promise rejections and resolves them as `'unavailable'`. The no-op implementations never access the network and never reject.

- [ ] **Step 6: Run the task tests**

Run:

```bash
npm test -- src/game/session src/game/adapters
```

Expected: reducer, persistence, and adapter tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/session src/game/adapters
git commit -m "feat: add game session and safe platform adapters"
```

### Task 5: Responsive 2.5D Tube Rendering

**Files:**
- Create: `src/game/view/palette.ts`
- Create: `src/game/view/layout.ts`
- Create: `src/game/view/layout.test.ts`
- Create: `src/game/view/TubeView.ts`

**Interfaces:**
- Consumes: `ColorId`, `TubeState`, `GAME_WIDTH`, and `GAME_HEIGHT`.
- Produces: `COLOR_STOPS`, `computeTubeLayout()`, and `TubeView`.

- [ ] **Step 1: Write failing responsive layout tests**

Define and test:

```ts
expect(computeTubeLayout(540, 960, 6)).toEqual({
  tubeWidth: 60,
  tubeHeight: 184,
  positions: [
    { x: 156, y: 370 }, { x: 270, y: 370 }, { x: 384, y: 370 },
    { x: 156, y: 610 }, { x: 270, y: 610 }, { x: 384, y: 610 },
  ],
});

const eight = computeTubeLayout(360, 640, 8);
expect(eight.positions).toHaveLength(8);
expect(eight.positions.every(({ x }) => x >= 34 && x <= 326)).toBe(true);
expect(eight.positions.every(({ y }) => y >= 210 && y <= 510)).toBe(true);
```

- [ ] **Step 2: Run the test and confirm the red state**

Run: `npm test -- src/game/view/layout.test.ts`

Expected: FAIL because `computeTubeLayout()` does not exist.

- [ ] **Step 3: Implement the layout function**

Use three columns for six tubes and four columns for seven or eight tubes. Use two rows, center the last incomplete row, scale the reference 540×960 coordinates to the current logical viewport, and return integer positions. Tube reference dimensions are 60×184.

The six-tube layout must match the exact expected fixture. For seven tubes, use rows of four and three. For eight tubes, use four and four.

- [ ] **Step 4: Implement the approved palette**

Map each `ColorId` to `top`, `middle`, and `bottom` gradient colors:

```ts
export const COLOR_STOPS = {
  pink:   { top: 0xffa6c4, middle: 0xff6f9e, bottom: 0xe9528b },
  yellow: { top: 0xffff9a, middle: 0xffc84b, bottom: 0xeead2f },
  mint:   { top: 0x8bf5db, middle: 0x44d7b0, bottom: 0x2fac91 },
  blue:   { top: 0xa8c7ff, middle: 0x5e94ff, bottom: 0x426ed6 },
  purple: { top: 0xc8b7ff, middle: 0x9a78e8, bottom: 0x7457c8 },
  orange: { top: 0xffc08c, middle: 0xff925c, bottom: 0xdd6b3c },
} as const;
```

- [ ] **Step 5: Implement `TubeView`**

`TubeView` extends `Phaser.GameObjects.Container` and contains:

- a shadow ellipse at 12% opacity;
- a four-layer liquid container masked by the inner glass shape;
- one gradient rectangle per liquid unit, rebuilt by `setTube(tube)`;
- a transparent glass body with a 2 px violet-gray outline;
- a white vertical highlight at 65% opacity;
- a thick elliptical lip;
- a hit zone at least 72×204 logical pixels.

Expose:

```ts
setTube(tube: TubeState): void;
setSelected(selected: boolean): void;
setValidTarget(valid: boolean): void;
setCompleted(completed: boolean): void;
shake(): Promise<void>;
```

`setSelected(true)` moves the container 18 px upward and rotates it −0.04 radians. `setValidTarget(true)` adds a mint outer glow. `shake()` runs x offsets `0, -8, 8, -5, 5, 0` over 180 ms and resolves after the final tween.

- [ ] **Step 6: Run tests and build**

Run:

```bash
npm test -- src/game/view/layout.test.ts
npm run build
```

Expected: layout tests pass and Phaser rendering code type-checks.

- [ ] **Step 7: Commit**

```bash
git add src/game/view
git commit -m "feat: render responsive 2.5D glass tubes"
```

### Task 6: Pour Timeline, Animation, and Sound

**Files:**
- Create: `src/game/view/timeline.ts`
- Create: `src/game/view/timeline.test.ts`
- Create: `src/game/view/PourAnimator.ts`
- Create: `src/game/audio/SoundController.ts`

**Interfaces:**
- Consumes: `Move`, source and target `TubeView` instances, and sound-enabled state.
- Produces: `buildPourTimeline()`, `PourAnimator.play()`, and `SoundController`.

- [ ] **Step 1: Write the failing timeline test**

```ts
expect(buildPourTimeline(
  { x: 150, y: 420 },
  { x: 390, y: 420 },
  2,
)).toEqual({
  liftMs: 140,
  travelMs: 260,
  tiltMs: 180,
  pourMs: 560,
  returnMs: 320,
  pourX: 342,
  pourY: 284,
  tiltRadians: 1.05,
});
```

Also assert that a target to the left returns `tiltRadians: -1.05` and `pourX` positioned 48 px to the right of the target center.

- [ ] **Step 2: Run the test and confirm the red state**

Run: `npm test -- src/game/view/timeline.test.ts`

Expected: FAIL because the timeline module does not exist.

- [ ] **Step 3: Implement the deterministic timeline**

Use fixed phase durations from the test. Place a source moving right at `target.x - 48`; place a source moving left at `target.x + 48`. Set `pourY = target.y - 136`. Increase `pourMs` by 140 ms per extra liquid unit beyond one, so two units equal 560 ms.

- [ ] **Step 4: Implement `PourAnimator.play()`**

The method:

```ts
async play(
  source: TubeView,
  target: TubeView,
  move: Move,
  sourceFinal: TubeState,
  targetFinal: TubeState,
): Promise<void>
```

must execute these phases:

1. Lift source.
2. Travel source to its pour point above the target.
3. Rotate toward the target.
4. Draw a rounded liquid stream in `move.color`, animate its scale Y, and reveal the units in `targetFinal` at evenly spaced unit boundaries.
5. Add a 200 ms expanding, fading landing ellipse.
6. Remove the stream, rotate upright, return source, and synchronize both views with `sourceFinal` and `targetFinal`.

Wrap the sequence in `try/finally`; `finally` removes transient graphics and resets source rotation and position. Reject only after cleanup so `GameScene` can immediately synchronize the board.

- [ ] **Step 5: Implement synthesized sounds**

`SoundController` lazily creates `AudioContext` after the first pointer interaction. Expose:

```ts
setEnabled(enabled: boolean): void;
get enabled(): boolean;
play(kind: 'select' | 'pour' | 'invalid' | 'success'): void;
```

Use short oscillator envelopes:

- select: sine 620 Hz, 55 ms;
- pour: sine sweep 430→260 Hz, 280 ms;
- invalid: square 150 Hz, 70 ms at low gain;
- success: three sine notes 523, 659, 784 Hz, each 110 ms.

Catch `AudioContext` construction, resume, and oscillator errors; set the controller to disabled on failure.

- [ ] **Step 6: Run tests and build**

Run:

```bash
npm test -- src/game/view/timeline.test.ts
npm run build
```

Expected: timeline tests pass and animation/audio code type-checks.

- [ ] **Step 7: Commit**

```bash
git add src/game/view/timeline.ts src/game/view/timeline.test.ts src/game/view/PourAnimator.ts src/game/audio
git commit -m "feat: animate liquid pours with lightweight sound"
```

### Task 7: Japanese UI and Complete Game Scene

**Files:**
- Create: `src/game/ui/copy.ts`
- Create: `src/game/ui/UIButton.ts`
- Create: `src/game/scenes/GameScene.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: all domain, level, session, adapter, view, and audio modules.
- Produces: the complete playable loop from level 1 through level 8.

- [ ] **Step 1: Add Japanese copy and reusable buttons**

Create `JA.title = '色をそろえよう！'`, `JA.guide = 'ボトルをタップして水を移動しよう'`, `JA.clear = 'クリア！'`, `JA.nextLevel = '次のレベル'`, `JA.playAgain = 'もう一度遊ぶ'`, and a `JA.level(id)` formatter that returns two-digit labels such as `レベル 08`. `UIButton` is a 64×64 `Phaser.GameObjects.Container` with a soft white or violet gradient circle, an icon text child, a 72×72 hit zone, a 0.96 press scale, and a disabled alpha of 0.35.

- [ ] **Step 2: Implement the scene background and HUD**

In `GameScene.create()`:

1. Draw the ivory→lavender→pale-blue background with `Graphics.fillGradientStyle()` and one full-canvas rectangle.
2. Draw two large white low-opacity circles and two low-opacity five-petal blossom shapes.
3. Add undo at x=64, centered level text, and sound at x=476, all at y=64 plus safe-area allowance.
4. Add the title and guide at y=132 and y=180.
5. Create tube views from `computeTubeLayout()`.
6. Add a centered restart button at y=892.
7. Load progress safely, create state from `getLevel(progress.currentLevel)`, track `game_loaded` and `level_started`, and render all tubes.

- [ ] **Step 3: Wire interactions and animation boundaries**

For every tube pointer:

1. Resume or create audio on the first interaction and track `first_interaction` once.
2. Call `tapTube(state, index)`.
3. For `selected`, update raised state, highlight `getValidTargets()`, and play select sound.
4. For `deselected`, clear highlights.
5. For `invalid`, await `TubeView.shake()` and play invalid sound.
6. For `pour`, calculate `previewBoard = applyMove(state.board, effect.move)`, then await `PourAnimator.play(source, target, effect.move, previewBoard[effect.move.from]!, previewBoard[effect.move.to]!)`. On success or failure, call `commitPendingMove()`, render from the committed board, clear highlights, and ensure input is unlocked.
7. If `isSolved()` is true, run the win sequence.

Undo and restart use the reducer, re-render every tube, update the HUD, track the matching event, and remain disabled while input is locked.
In `GameScene.update(_time, delta)`, call `advanceElapsed(state, delta)` only while the level is active and the clear overlay is closed.

- [ ] **Step 4: Implement the clear overlay and progress**

After a solved move:

1. Track `level_completed` with level, moves, and elapsed seconds.
2. Save the lower of the previous best move count and current move count.
3. Emit 48 small pink, yellow, mint, blue, and purple rectangles with gravity and rotation.
4. Play success audio and a subtle camera shake of intensity 0.002 for 120 ms.
5. Show a translucent white rounded panel with `クリア！`, move count, elapsed time, `次のレベル`, and `もう一度遊ぶ`.
6. On next level, clamp at level 8, save progress, and load the next level.
7. On replay, reload the current level without changing the saved current level.

At level 8, hide the next-level button and keep only `もう一度遊ぶ`, which restarts level 8.

- [ ] **Step 5: Replace the temporary scene**

Update `src/main.ts` to import `GameScene` and set `scene: [GameScene]`. Set Phaser input to one active pointer plus two extra pointers for robust touch cancellation, while the session lock still allows only one logical action.

- [ ] **Step 6: Run all tests and build**

Run:

```bash
npm test
npm run build
```

Expected: all unit tests pass and the full game builds.

- [ ] **Step 7: Commit**

```bash
git add src/game/ui src/game/scenes src/main.ts
git commit -m "feat: complete Japanese Water Sort game loop"
```

### Task 8: Bundle Gate and Cross-Device Verification

**Files:**
- Create: `scripts/check-bundle-size.mjs`
- Modify: `package.json`
- Modify: `README.md` if it exists; otherwise create `README.md`

**Interfaces:**
- Consumes: production files generated by `npm run build`.
- Produces: a deterministic size gate and final run instructions.

- [ ] **Step 1: Add the bundle size check**

Create `scripts/check-bundle-size.mjs`:

```js
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const LIMIT = 3_000_000;

async function sizeOf(path) {
  const info = await stat(path);
  if (info.isFile()) return info.size;
  const entries = await readdir(path);
  return entries.reduce(async (sumPromise, entry) => {
    const sum = await sumPromise;
    return sum + await sizeOf(join(path, entry));
  }, Promise.resolve(0));
}

const total = await sizeOf('dist');
console.log(`dist size: ${total} bytes`);
if (total > LIMIT) {
  throw new Error(`dist exceeds ${LIMIT} bytes`);
}
```

Add these scripts to `package.json`:

```json
{
  "check:size": "node scripts/check-bundle-size.mjs",
  "check": "npm run test && npm run build && npm run check:size"
}
```

- [ ] **Step 2: Document exact run commands**

Create `README.md` containing:

```md
# Water Sort H5

## Local preview

1. Run `npm install`.
2. Run `npm run dev`.
3. Open the printed local URL on a phone or desktop browser.

## Production build

Run `npm run check`. Deploy the generated `dist/` directory to any static HTTPS host.

## Current integrations

Analytics and advertising adapters are no-op implementations. The game makes no external analytics or ad requests.
```

- [ ] **Step 3: Run the full automated gate**

Run:

```bash
npm run check
```

Expected:

- every Vitest test passes;
- TypeScript and Vite production build pass;
- `dist size` is printed;
- the printed size is at most 3,000,000 bytes.

- [ ] **Step 4: Run focused manual browser checks**

Start `npm run dev` and verify:

1. 360×640 portrait: all six-, seven-, and eight-tube layouts fit without overlap.
2. 430×932 portrait: title, controls, tubes, and win panel stay inside the canvas.
3. Landscape: the 9:16 canvas remains centered and fully operable.
4. Mouse and touch: source select, deselect, valid pour, invalid shake, undo, and restart work.
5. Rapid taps during pour do not mutate or desynchronize the board.
6. Sound blocked: the game remains playable and the sound button shows muted state.
7. Refresh: current level, best move count, and sound setting restore.
8. Levels 1–8: every level can be completed and the win overlay advances correctly.
9. Network panel: no analytics, advertising, account, payment, or game-server requests occur.

- [ ] **Step 5: Inspect the production build**

Run `npx vite preview --host 0.0.0.0`, open the production preview, and repeat checks 1, 4, 7, and 9. Confirm relative asset paths work under the preview.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-bundle-size.mjs README.md
git commit -m "chore: add production size and release checks"
```

- [ ] **Step 7: Final verification record**

Run and retain the outputs of:

```bash
git status --short
git log --oneline -8
npm run check
```

Expected: no unintended tracked changes, eight or fewer focused implementation commits after the design commit, and a fully passing check command.
