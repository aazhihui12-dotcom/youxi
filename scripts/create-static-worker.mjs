import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { staticWorkerSource } from './static-worker-template.mjs';

const outputPath = resolve(process.argv[2] ?? 'dist/server/index.js');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, staticWorkerSource, 'utf8');
