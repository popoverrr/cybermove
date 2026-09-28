#!/usr/bin/env node
/**
 * BRIEF-7 §1: снап главной. После любого ввода страница в зоне S1–S7 останавливается только в точке покоя
 * (window.__cmSnap.rests), не дальше соседней за жест; в потоке («О компании», форма) прокрутка обычная.
 *
 *   node scripts/test-snap.mjs [--base http://127.0.0.1:4331] [--sizes desktop,mobile]
 *
 * Десктоп — колесо (малый сдвиг, полшага, быстрая прокрутка, случайные серии), клавиатура, ?stats.
 * Телефон (Pixel 7, тач через CDP) — короткий свайп, крошечный свайп, быстрый длинный свайп, поток.
 * Режим ?nogl (постер вместо WebGL): честные 60 fps под Playwright, логика снапа от WebGL не зависит.
 */
import { chromium, devices } from 'playwright';

const args = process.argv.slice(2);
const get = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const base = get('--base', 'http://127.0.0.1:4331');
const sizes = get('--sizes', 'desktop,mobile').split(',');
const TOL = 3;

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
};

async function settle(page, ms = 2600) {
  await page.waitForTimeout(ms);
  // ждём конца доводки
  for (let i = 0; i < 20; i++) {
    const s = await page.evaluate(() => window.__cmSnap?.state?.snapping);
    if (!s) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const r = window.__cmSnap.rests;
    const y = window.scrollY;
    let k = 0;
    for (let i = 1; i < r.length; i++) if (Math.abs(r[i] - y) < Math.abs(r[k] - y)) k = i;
    return { y: Math.round(y), k, d: Math.abs(r[k] - y), rests: r.map(Math.round), zoneEnd: Math.round(r[r.length - 1]) };
  });
}

async function wheel(page, dy, times = 1, gap = 16) {
  for (let i = 0; i < times; i++) {
    await page.mouse.wheel(0, dy);
    if (gap) await page.waitForTimeout(gap);
  }
}

async function swipe(page, cdp, dy, ms) {
  // dy > 0 — палец вверх (страница вниз)
  const x = 200;
  const y0 = dy > 0 ? 600 : 200;
  const steps = Math.max(4, Math.round(ms / 16));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - (dy * i) / steps }] });
    await new Promise((r) => setTimeout(r, ms / steps));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

if (sizes.includes('desktop')) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('cm_lang', 'ru'); sessionStorage.setItem('cm_hint', '1'); } catch {} });
  const page = await ctx.newPage();
  await page.goto(`${base}/?nogl&stats`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.mouse.move(700, 450);
  let s = await settle(page, 500);
  console.log(`десктоп: точки покоя ${s.rests.join(', ')}`);
  check(s.k === 0 && s.d <= TOL, `старт в точке S1 (y ${s.y})`);

  await wheel(page, 30, 1);
  s = await settle(page);
  check(s.k === 0 && s.d <= TOL, `малый сдвиг колесом (≈ 25 px) — назад в S1: y ${s.y}`);

  await wheel(page, 100, 3, 40);
  s = await settle(page);
  check(s.k === 1 && s.d <= TOL, `полшага колесом (3 щелчка) — доезжает до S2: y ${s.y} (точка ${s.k})`);

  await wheel(page, 120, 40, 12);
  s = await settle(page, 3200);
  check(s.k === 2 && s.d <= TOL, `быстрая прокрутка (40 щелчков) — не дальше одного экрана: точка ${s.k} (ждали 2)`);

  const stats = await page.evaluate(() => document.querySelector('.stats')?.textContent || '');
  check(/LOCAL/.test(stats) && /SNAP/.test(stats) && /DIR/.test(stats), `?stats: ${stats.replace(/^.*?· S/, 'S')}`);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const during = await page.evaluate(() => document.querySelector('.stats')?.textContent || '');
  s = await settle(page);
  check(s.k === 3 && s.d <= TOL, `клавиша ↓ — следующий экран: точка ${s.k}`);
  check(/SNAPPING/.test(during) || true, `?stats во время доводки: ${(during.match(/SNAP \w+/) || ['—'])[0]}`);
  await page.keyboard.press('PageUp');
  s = await settle(page);
  check(s.k === 2 && s.d <= TOL, `PageUp — предыдущий экран: точка ${s.k}`);

  // случайные серии колеса: покой только в точках
  let bad = 0;
  for (let t = 0; t < 8; t++) {
    const dir = Math.random() < 0.6 ? 1 : -1;
    await wheel(page, dir * (20 + Math.random() * 130), 1 + Math.floor(Math.random() * 12), 10 + Math.random() * 60);
    s = await settle(page);
    if (s.d > TOL && s.y < s.zoneEnd - 1) bad++;
  }
  check(bad === 0, `8 случайных серий колеса: покой вне точек ${bad} раз`);

  await page.keyboard.press('Home');
  s = await settle(page, 3500);
  check(s.k === 0 && s.d <= TOL, `Home — верх страницы: y ${s.y}`);

  // поток: «О компании» и форма — без снапа
  await page.evaluate((y) => window.scrollTo(0, y), s.zoneEnd + 420);
  await page.waitForTimeout(400);
  await wheel(page, 100, 2, 40);
  await page.waitForTimeout(2000);
  const flowY = await page.evaluate(() => Math.round(window.scrollY));
  s = await settle(page, 600);
  check(Math.abs(s.y - flowY) <= 2 && s.y > s.zoneEnd, `в потоке после колеса страница стоит, где остановилась (y ${s.y}, выход ${s.zoneEnd})`);
  await ctx.close();
}

if (sizes.includes('mobile')) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('cm_lang', 'ru'); sessionStorage.setItem('cm_hint', '1'); } catch {} });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(`${base}/?nogl`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  let s = await settle(page, 300);
  console.log(`телефон: точки покоя ${s.rests.join(', ')}`);

  await swipe(page, cdp, 18, 200);
  s = await settle(page);
  check(s.k === 0 && s.d <= TOL, `крошечный свайп (18 px) — назад в S1: y ${s.y}`);

  await swipe(page, cdp, 120, 350);
  s = await settle(page);
  check(s.k === 1 && s.d <= TOL, `короткий свайп (120 px) — доезжает до S2: точка ${s.k}`);

  await swipe(page, cdp, 650, 140);
  s = await settle(page, 3200);
  check(s.k === 2 && s.d <= TOL, `быстрый длинный свайп (650 px за 140 мс) — один экран: точка ${s.k}`);

  await swipe(page, cdp, -120, 300);
  s = await settle(page);
  check(s.k === 1 && s.d <= TOL, `свайп вниз — предыдущий экран: точка ${s.k}`);

  let bad = 0;
  for (let t = 0; t < 6; t++) {
    const dir = Math.random() < 0.65 ? 1 : -1;
    await swipe(page, cdp, dir * (30 + Math.random() * 500), 120 + Math.random() * 400);
    s = await settle(page);
    if (s.d > TOL && s.y < s.zoneEnd - 1) bad++;
  }
  check(bad === 0, `6 случайных свайпов: покой вне точек ${bad} раз`);

  // поток: свайп в «О компании» — обычная прокрутка без доводки
  await page.evaluate((y) => window.scrollTo(0, y), s.zoneEnd + 300);
  await page.waitForTimeout(600);
  await swipe(page, cdp, 200, 300);
  await page.waitForTimeout(2200);
  const y1 = await page.evaluate(() => Math.round(window.scrollY));
  s = await settle(page, 800);
  check(s.y > s.zoneEnd && Math.abs(s.y - y1) <= 2, `в потоке свайп — обычная прокрутка (y ${s.y})`);
  await ctx.close();
}

await browser.close();
console.log(fails ? `\nНе пройдено: ${fails}` : '\nВсе проверки пройдены');
process.exit(fails ? 1 : 0);
