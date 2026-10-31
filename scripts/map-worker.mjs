import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/vendor/maplibre', { recursive: true });
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'])
  await copyFile(`node_modules/maplibre-gl/dist/${name}`, `public/vendor/maplibre/${name}`);
await copyFile('node_modules/maplibre-gl/LICENSE.txt', 'public/vendor/maplibre/LICENSE.txt');
