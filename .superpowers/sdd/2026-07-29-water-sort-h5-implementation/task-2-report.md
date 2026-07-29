# Task 2: Pure Water Sort Rules report

## Implementation

- Added domain types: `ColorId`, `TubeState`, `BoardState`, `Move`, and `LevelDefinition`.
- Added Phaser/DOM-independent rule functions: `cloneBoard`, `getPour`, `applyMove`, `getValidTargets`, and `isSolved`.
- `getPour` rejects invalid indices, self-pours, empty sources, full destinations, and color mismatches before calculating the contiguous top-color amount.
- `applyMove` copies the board and validates direct move objects with `RangeError`; it does not mutate the input board.

## RED verification

Command:

```sh
npm test -- src/game/domain/rules.test.ts
```

Output (exit 1):

```text
FAIL  src/game/domain/rules.test.ts
Error: Cannot find module './rules' imported from .../src/game/domain/rules.test.ts
Test Files  1 failed (1)
Tests  no tests
```

This was expected: the focused behavior tests were added before `src/game/domain/rules.ts` existed, so the suite could not load the required public API.

## GREEN and full verification

Focused GREEN command:

```sh
npm test -- src/game/domain/rules.test.ts
```

Output (exit 0):

```text
Test Files  1 passed (1)
Tests  11 passed (11)
```

Full-suite command:

```sh
npm test
```

Output (exit 0):

```text
Test Files  1 passed (1)
Tests  11 passed (11)
```

Additional build verification:

```sh
npm run build
```

Output (exit 0): TypeScript completed with `--noEmit` and Vite built the production bundle. Vite reported its standard chunk-size warning for the Phaser-containing bundle.

## Files changed

- `src/game/domain/types.ts`
- `src/game/domain/rules.ts`
- `src/game/domain/rules.test.ts`
- `.superpowers/sdd/2026-07-29-water-sort-h5-implementation/task-2-report.md`

## Self-review

- Confirmed the domain layer imports only `TUBE_CAPACITY` and has no Phaser or DOM dependency.
- Confirmed every tube is cloned before `applyMove` edits it.
- Confirmed the required source/destination rules and solved-board definition are covered by behavioral tests.
- Confirmed strict TypeScript compilation, focused tests, and the full suite are green.

## Concerns

No blocking concerns. The build emits a Vite chunk-size warning (the generated JavaScript bundle is about 1.2 MB); this is outside the pure rule-engine scope.
