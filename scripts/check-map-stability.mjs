import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const output = new URL('../output/qa/map-stability/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
for (const [name, width, height] of [
  ['desktop', 1440, 1000],
  ['desktop-repeat', 1440, 1000],
  ['mobile', 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height } }),
    errors = [],
    failed = [];
  page.on('pageerror', (e) => errors.push(e.stack));
  page.on('response', (r) => {
    if (r.status() >= 400) {
      const u = new URL(r.url());
      failed.push({ status: r.status(), host: u.host, path: u.pathname });
    }
  });
  await page.goto('http://127.0.0.1:3000/?explore=1&year=2025-2026&measure=reported_spent');
  await page.locator('.map-canvas[data-zoom]').waitFor({ timeout: 45000 });
  await page.waitForFunction(() =>
    document.querySelector('.mapboxgl-canvas')?.style.clipPath.startsWith('path('),
  );
  const checkpoints = [];
  const check = async (label) => {
    await page.waitForTimeout(750);
    const mask = await page.locator('.mapboxgl-canvas').evaluate((el) => el.style.clipPath);
    if (!mask.startsWith('path(') || /NaN|Infinity|e\+/.test(mask))
      throw new Error('Invalid mask at ' + label);
    const nums = (mask.match(/-?\d+\.\d+/g) || []).map(Number);
    if (nums.some((n) => n < -0.1 || n > Math.max(width, height) + 0.1))
      throw new Error('Unclipped mask at ' + label);
    checkpoints.push(label);
  };
  await check('flat');
  await page.getByLabel('Toggle perspective', { exact: true }).click();
  await check('pitched');
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('Zoom in', { exact: true }).click();
    await page.waitForTimeout(240);
  }
  await page.mouse.move(width * 0.45, height * 0.4);
  await page.mouse.down();
  await page.mouse.move(width * 0.4, height * 0.7, { steps: 18 });
  await page.mouse.up();
  await check('pitched zoom and pan');
  await page.getByLabel('Map settings and layers', { exact: true }).click();
  const settings = page.getByLabel('Map settings', { exact: true });
  for (const label of ['Toggle terrain', 'Map', 'Satellite', 'Toggle terrain']) {
    await settings.getByRole('button', { name: label, exact: true }).click();
    if (label === 'Map' || label === 'Satellite')
      await page.waitForFunction(
        (expected) =>
          document.querySelector('.atlas-map')?.getAttribute('data-map-style') === expected,
        label === 'Map' ? 'streets' : 'satellite',
        { timeout: 30000 },
      );
    await check(label);
  }
  await page.getByLabel('Close controls', { exact: true }).click();
  await page.getByLabel('Toggle perspective', { exact: true }).click();
  await check('flat again');
  await page.screenshot({ path: new URL(`${name}-final.png`, output).pathname });
  results.push({ name, checkpoints, errors, failed });
  await page.close();
}
await browser.close();
await fs.writeFile(new URL('browser-results.json', output), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
if (results.some((r) => r.errors.length)) process.exitCode = 1;
