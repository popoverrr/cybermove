#!/usr/bin/env node
/**
 * Видео экрана через Playwright (SwiftShader, webm): цикл удержания сцены в реальном времени.
 *   node scripts/video.mjs --out docs/screens/v3/B/video --base http://127.0.0.1:4330 --seconds 6 "/?screen=1&local=0.45&tier=high:s2-hold" ...
 * Под программным рендером кадров мало (≈ 8–12 fps), но время таймлайнов — реальное.
 */
import { chromium } from 'playwright';
import { mkdir, rename, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = { out: 'docs/screens/tmp-video', base: 'http://127.0.0.1:4330', seconds: 6, mobile: false };
const targets = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opt.out = args[++i];
  else if (a === '--base') opt.base = args[++i];
  else if (a === '--seconds') opt.seconds = Number(args[++i]);
  else if (a === '--mobile') opt.mobile = true;
  else targets.push(a);
}

const gpuArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--use-gl=angle'];
const size = opt.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };

await mkdir(opt.out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: gpuArgs });
try {
  for (const t of targets) {
    const idx = t.lastIndexOf(':');
    const url = idx > 0 ? t.slice(0, idx) : t;
    const name = idx > 0 ? t.slice(idx + 1) : url.replace(/[^a-z0-9]+/gi, '-');
    const tmp = path.join(opt.out, `.tmp-${name}`);
    await mkdir(tmp, { recursive: true });
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, isMobile: opt.mobile, hasTouch: opt.mobile, recordVideo: { dir: tmp, size }, locale: 'ru-RU' });
    const page = await context.newPage();
    const t0 = Date.now();
    await page.goto(opt.base.replace(/\/$/, '') + url, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForFunction(() => document.body.classList.contains('gl-ready') || document.body.classList.contains('gl-fallback'), null, { timeout: 60000 });
    await page.waitForTimeout(opt.seconds * 1000);
    await context.close();
    const files = await readdir(tmp);
    const webm = files.find((f) => f.endsWith('.webm'));
    if (webm) await rename(path.join(tmp, webm), path.join(opt.out, `${name}.webm`));
    await rm(tmp, { recursive: true, force: true });
    console.log(`${path.join(opt.out, `${name}.webm`)}  (${Date.now() - t0} ms)`);
  }
} finally {
  await browser.close();
}
