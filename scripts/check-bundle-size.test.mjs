import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { inspectBundle } from './check-bundle-size.mjs';

async function createBundle(html, assets) {
  const root = await mkdtemp(path.join(tmpdir(), 'water-sort-size-'));
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'index.html'), html);
  await Promise.all(Object.entries(assets).map(([file, contents]) => (
    writeFile(path.join(root, 'assets', file), contents)
  )));
  return root;
}

function noisyContents(byteLength) {
  return randomBytes(byteLength).toString('base64');
}

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

test('rejects a single-quoted absolute JavaScript asset path', async () => {
  const root = await createBundle("<script defer src = '/assets/app.js'></script>", {
    'app.js': 'export const ready = true;',
  });

  const report = await inspectBundle(root);
  assert.ok(report.errors.some((error) => error.includes('relative')));
});

test('rejects a single-quoted absolute stylesheet asset path', async () => {
  const root = await createBundle("<link rel='stylesheet' href = '/assets/app.css'>", {
    'app.css': 'body{}',
  });

  const report = await inspectBundle(root);
  assert.ok(report.errors.some((error) => error.includes('relative')));
});

test('rejects JavaScript gzip overflow using gzip bytes', async () => {
  const contents = noisyContents(110_000);
  const root = await createBundle('<script src="./assets/app.js"></script>', {
    'app.js': contents,
  });

  const report = await inspectBundle(root);
  assert.equal(report.jsGzipBytes, gzipSync(contents).byteLength);
  assert.ok(report.jsGzipBytes > 102_400);
  assert.ok(report.errors.some((error) => error.startsWith('JavaScript gzip')));
});

test('rejects CSS gzip overflow using gzip bytes', async () => {
  const contents = `/* ${noisyContents(20_000)} */`;
  const root = await createBundle('<link rel="stylesheet" href="./assets/app.css">', {
    'app.css': contents,
  });

  const report = await inspectBundle(root);
  assert.equal(report.cssGzipBytes, gzipSync(contents).byteLength);
  assert.ok(report.cssGzipBytes > 15_360);
  assert.ok(report.errors.some((error) => error.startsWith('CSS gzip')));
});

test('aggregates gzip bytes across emitted JavaScript files', async () => {
  const first = noisyContents(55_000);
  const second = noisyContents(55_000);
  const root = await createBundle('<script src="./assets/first.js"></script>', {
    'first.js': first,
    'second.js': second,
  });
  const expectedGzipBytes = gzipSync(first).byteLength + gzipSync(second).byteLength;

  const report = await inspectBundle(root);
  assert.ok(gzipSync(first).byteLength < 102_400);
  assert.ok(gzipSync(second).byteLength < 102_400);
  assert.equal(report.jsGzipBytes, expectedGzipBytes);
  assert.ok(report.errors.some((error) => error.startsWith('JavaScript gzip')));
});
