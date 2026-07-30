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
