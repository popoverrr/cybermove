#!/usr/bin/env node
/**
 * Гейт B (BRIEF-2 §9): прыжки раскладки на мобильном. Эмуляция телефона, скролл в середину экрана S3,
 * затем высота окна меняется на 60px (появление/скрытие адресной строки) — сглаженный прогресс активного
 * экрана не должен измениться больше чем на 0.01.
 *   node scripts/test-vh.mjs [base]
 */
import { chromium, devices } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:4331';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${base}/?tier=low&nogl`, { waitUntil: 'networkidle', timeout: 180000 });
await page.waitForTimeout(2500);

const read = () => page.evaluate(() => ({ y: window.scrollY, screen: window.__cm.screen, local: window.__cm.screens[window.__cm.screen], target: window.__cm.targets[window.__cm.screen] }));
// в середину S3: три экрана по прогрессу
await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * (1.8 + 1.7 + 0.85))));
await page.waitForTimeout(1200);
const before = await read();
let worst = 0;
for (const h of [784, 844, 784, 844]) {
  await page.setViewportSize({ width: 390, height: h });
  await page.waitForTimeout(400);
  const now = await read();
  const d = now.screen === before.screen ? Math.abs(now.local - before.local) : 1;
  worst = Math.max(worst, d);
  console.log(`height ${h}: screen ${now.screen} local ${now.local.toFixed(4)} (Δ ${d.toFixed(4)}) scrollY ${now.y}`);
}
await browser.close();
const ok = worst <= 0.01;
console.log(`${ok ? 'PASS' : 'FAIL'}: max Δ прогресса при смене высоты окна ${worst.toFixed(4)} ≤ 0.01`);
process.exit(ok ? 0 : 1);
