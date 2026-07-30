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
