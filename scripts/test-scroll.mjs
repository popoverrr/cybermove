#!/usr/bin/env node
/**
 * Плавность скролла главной (BRIEF-2 §8.8). Прокручивает страницу сверху вниз: на десктопе — шагами колеса
 * 100px, на мобильной эмуляции — window.scrollBy с паузами (инерция). Каждый кадр читает window.__cm
 * (сглаженный прогресс активного экрана, номер экрана, dt) и пишет docs/screens/v2/scroll-<size>.json
 * плюс видео прокрутки в docs/screens/v2/.
 *
 *   node scripts/test-scroll.mjs [--base http://127.0.0.1:4331] [--sizes desktop,mobile] [--tier low] [--no-video] [--nogl] [--suffix name]
 *
 * Критерии: |Δ сглаженного прогресса| за кадр ≤ 0.012 при равномерной прокрутке; активный экран не
 * прыгает назад-вперёд; полный переход между экранами (выход + вход) при 100px/шаг ≥ 1.2 с (десктоп).
 * Под SwiftShader кадры длинные (~100 мс), поэтому Δ нормируется к кадру 60 fps по формуле
 * экспоненциального сглаживания: Δ60 = Δ · (1 − e^(−λ/60)) / (1 − e^(−λ·dt)). Режим --nogl (постер вместо
 * WebGL) даёт честные 60 fps и проверяет сам конвейер сглаживания; с WebGL сравнивать относительно
 * предыдущей версии (docs/screens/v2/before/scroll-*.json).
 */
import { chromium, devices } from 'playwright';
import { mkdir, writeFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = { base: 'http://127.0.0.1:4331', sizes: ['desktop', 'mobile'], tier: 'low', video: true, out: 'docs/screens/v2', nogl: false, suffix: '' };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--base') opt.base = args[++i];
  else if (a === '--sizes') opt.sizes = args[++i].split(',');
  else if (a === '--tier') opt.tier = args[++i];
  else if (a === '--no-video') opt.video = false;
  else if (a === '--out') opt.out = args[++i];
  else if (a === '--nogl') opt.nogl = true;
  else if (a === '--suffix') opt.suffix = args[++i];
}
await mkdir(opt.out, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });

/** Запись кадров внутри страницы: rAF-цикл читает состояние и складывает в window.__scrollLog */
const RECORDER = `
  window.__scrollLog = [];
  (function loop(now) {
    const s = window.__cm;
    if (s) {
      const i = s.screen;
      window.__scrollLog.push({ t: now, y: window.scrollY, screen: i, local: s.screens[i], target: s.targets ? s.targets[i] : null, dt: s.frame ? s.frame.dt : null });
    }
    requestAnimationFrame(loop);
  })(performance.now());
`;

function analyze(log, vh, lambda) {
  const frames = log.length;
  let maxDelta = 0;
  let maxDeltaAt = 0;
  let maxDelta60 = 0;
  let flips = 0;
  let dir = 0;
  const transitions = [];
  let tStart = null;
  for (let i = 1; i < log.length; i++) {
    const a = log[i - 1];
    const b = log[i];
    // S8 (индекс 7) — секция в потоке высотой 100vh, её local — видимость, а не прогресс сцены; в критерий не входит
    if (a.screen === b.screen && a.screen < 7) {
      const d = Math.abs(b.local - a.local);
      if (d > maxDelta) {
        maxDelta = d;
        maxDeltaAt = b.t;
      }
      // нормировка к кадру 60 fps (см. шапку файла); dt из state.frame или из времени кадров
      // реальное время между кадрами (state.frame.dt обрезан до 0.1 с в сглаживании; rAF-метки честнее)
      const dt = Math.max(typeof b.dt === 'number' ? b.dt : 0, (b.t - a.t) / 1000);
      const k = dt > 0 ? (1 - Math.exp(-lambda / 60)) / (1 - Math.exp(-lambda * dt)) : 1;
      const d60 = d * Math.min(1, k);
      if (d60 > maxDelta60) maxDelta60 = d60;
    }
    // прыжки активного экрана назад-вперёд (смена направления при движении только вниз)
    if (b.screen !== a.screen) {
      const nd = Math.sign(b.screen - a.screen);
      if (dir !== 0 && nd !== dir) flips++;
      dir = nd;
    }
    // переход между экранами: от local ≥ 0.7 (начало выхода) экрана i до local ≥ 0.2 экрана i+1 (конец входа)
    if (tStart === null && a.local < 0.7 && b.local >= 0.7) tStart = b.t;
    if (tStart !== null && b.screen === a.screen + 1) {
      // ждём конца входа следующего
      const idx = i;
      for (let k = idx; k < log.length; k++) {
        if (log[k].screen !== b.screen) break;
        if (log[k].local >= 0.2) {
          transitions.push((log[k].t - tStart) / 1000);
          break;
        }
      }
      tStart = null;
    }
  }
  const dts = log.map((f) => f.dt).filter((d) => typeof d === 'number' && d > 0).sort((a, b) => a - b);
  const p95 = dts.length ? dts[Math.floor(dts.length * 0.95)] : null;
  return {
    frames,
    maxDelta: Number(maxDelta.toFixed(4)),
    maxDelta60: Number(maxDelta60.toFixed(4)),
    maxDeltaAt: Math.round(maxDeltaAt),
    screenFlips: flips,
    transitionsSec: transitions.map((x) => Number(x.toFixed(2))),
    minTransitionSec: transitions.length ? Number(Math.min(...transitions).toFixed(2)) : null,
    frameP95Ms: p95 !== null ? Number((p95 * 1000).toFixed(1)) : null,
    viewportHeight: vh,
  };
}

const results = {};
for (const size of opt.sizes) {
  const mobile = size === 'mobile';
  const ctxOpts = mobile
    ? { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
  const videoDir = path.join(opt.out, `.video-${size}`);
  const ctx = await browser.newContext({ ...ctxOpts, recordVideo: opt.video ? { dir: videoDir, size: ctxOpts.viewport } : undefined });
  const page = await ctx.newPage();
  await page.goto(`${opt.base}/?tier=${opt.tier}${opt.nogl ? '&nogl' : ''}`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(4000); // интро + движок
  await page.evaluate(RECORDER);
  const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const t0 = Date.now();
  if (mobile) {
    // свайп: равномерное ведение пальцем (~940 px/с), затем инерционный хвост и пауза
    let y = 0;
    while (y < total) {
      const steps = [...Array(12).fill(30), 22, 16, 10, 6, 3];
      for (const s of steps) {
        y += s;
        await page.evaluate((v) => window.scrollBy(0, v), s);
        await page.waitForTimeout(s >= 30 ? 32 : 40);
      }
      await page.waitForTimeout(350);
    }
  } else {
    let y = 0;
    while (y < total) {
      await page.mouse.wheel(0, 100);
      y += 100;
      await page.waitForTimeout(120);
    }
  }
  await page.waitForTimeout(1500);
  const log = await page.evaluate(() => window.__scrollLog);
  const vh = ctxOpts.viewport.height;
  const summary = analyze(log, vh, mobile ? 4.5 : 7);
  summary.scrollMs = Date.now() - t0;
  summary.mode = opt.nogl ? 'nogl' : `webgl-${opt.tier}`;
  results[size] = summary;
  const name = `scroll-${size}${opt.suffix ? `-${opt.suffix}` : ''}`;
  await writeFile(path.join(opt.out, `${name}.json`), JSON.stringify({ summary, frames: log }, null, 0));
  console.log(size, JSON.stringify(summary));
  await ctx.close();
  if (opt.video) {
    const files = await readdir(videoDir);
    for (const f of files) await rename(path.join(videoDir, f), path.join(opt.out, `${name}.webm`));
    await rm(videoDir, { recursive: true, force: true });
  }
}
await browser.close();

let ok = true;
for (const [size, s] of Object.entries(results)) {
  const transOk = size !== 'desktop' || s.minTransitionSec === null || s.minTransitionSec >= 1.2;
  const pass = s.maxDelta60 <= 0.012 && s.screenFlips === 0 && transOk;
  if (!pass) ok = false;
  console.log(`${size}: ${pass ? 'PASS' : 'FAIL'} (Δ60 ${s.maxDelta60} ≤ 0.012 [raw ${s.maxDelta}], flips ${s.screenFlips} = 0${size === 'desktop' ? `, minTransition ${s.minTransitionSec} ≥ 1.2 s` : ''})`);
}
process.exit(ok ? 0 : 1);
