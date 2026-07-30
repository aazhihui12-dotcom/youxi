import { describe, expect, it, vi } from 'vitest';

import { staticWorkerSource } from './static-worker-template.mjs';

async function loadWorker() {
  const moduleUrl = `data:text/javascript,${encodeURIComponent(staticWorkerSource)}`;
  const module = await import(moduleUrl);
  return module.default;
}

describe('static hosting worker', () => {
  it('returns an existing static asset unchanged', async () => {
    const assetResponse = new Response('asset', { status: 200 });
    const fetch = vi.fn().mockResolvedValue(assetResponse);
    const worker = await loadWorker();

    const response = await worker.fetch(
      new Request('https://example.test/assets/game.js'),
      { ASSETS: { fetch } },
    );

    expect(response).toBe(assetResponse);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to index.html for missing HTML navigation requests', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response('game', { status: 200 }));
    const worker = await loadWorker();

    const response = await worker.fetch(
      new Request('https://example.test/play', {
        headers: { accept: 'text/html' },
      }),
      { ASSETS: { fetch } },
    );

    expect(await response.text()).toBe('game');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0].url).toBe('https://example.test/index.html');
  });

  it('preserves 404 responses for non-navigation requests', async () => {
    const missingResponse = new Response('missing', { status: 404 });
    const fetch = vi.fn().mockResolvedValue(missingResponse);
    const worker = await loadWorker();

    const response = await worker.fetch(
      new Request('https://example.test/missing.json', {
        headers: { accept: 'application/json' },
      }),
      { ASSETS: { fetch } },
    );

    expect(response).toBe(missingResponse);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
