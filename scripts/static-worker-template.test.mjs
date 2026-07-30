import assert from 'node:assert/strict';
import test from 'node:test';

import { staticWorkerSource } from './static-worker-template.mjs';

async function loadWorker() {
  const moduleUrl = `data:text/javascript,${encodeURIComponent(staticWorkerSource)}`;
  const module = await import(moduleUrl);
  return module.default;
}

function createFetch(...responses) {
  const requests = [];
  return {
    requests,
    fetch: async (request) => {
      requests.push(request);
      return responses.shift();
    },
  };
}

test('returns an existing static asset unchanged', async () => {
  const assetResponse = new Response('asset', { status: 200 });
  const { fetch, requests } = createFetch(assetResponse);
  const worker = await loadWorker();

  const response = await worker.fetch(
    new Request('https://example.test/assets/game.js'),
    { ASSETS: { fetch } },
  );

  assert.equal(response, assetResponse);
  assert.equal(requests.length, 1);
});

test('falls back to index.html for missing HTML navigation requests', async () => {
  const { fetch, requests } = createFetch(
    new Response('missing', { status: 404 }),
    new Response('game', { status: 200 }),
  );
  const worker = await loadWorker();

  const response = await worker.fetch(
    new Request('https://example.test/play', {
      headers: { accept: 'text/html' },
    }),
    { ASSETS: { fetch } },
  );

  assert.equal(await response.text(), 'game');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, 'https://example.test/index.html');
});

test('preserves 404 responses for non-navigation requests', async () => {
  const missingResponse = new Response('missing', { status: 404 });
  const { fetch, requests } = createFetch(missingResponse);
  const worker = await loadWorker();

  const response = await worker.fetch(
    new Request('https://example.test/missing.json', {
      headers: { accept: 'application/json' },
    }),
    { ASSETS: { fetch } },
  );

  assert.equal(response, missingResponse);
  assert.equal(requests.length, 1);
});
