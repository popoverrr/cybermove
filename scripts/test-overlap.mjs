#!/usr/bin/env node
/**
 * Проверка раскладки S7 и потоковых секций (BRIEF-4 §1.1–1.3): на пяти размерах экрана смотрим,
 * пересекаются ли карточки ленты со счётчиками, лезет ли сцена в полосу шапки и в футер,
 * видны ли анкоры S8 там, где их быть не должно.
 *   node scripts/test-overlap.mjs [--base http://127.0.0.1:4331] [--shots docs/screens/v4]
 */
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const get = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const base = get('--base', 'http://127.0.0.1:4331');
const shots = get('--shots', '');
const ONLY = get('--only', '');
const SIZES_ALL = [
  { name: '390x664', width: 390, height: 664, mobile: true },
  { name: '375x667', width: 375, height: 667, mobile: true },
  { name: '360x640', width: 360, height: 640, mobile: true },
  { name: '430x932', width: 430, height: 932, mobile: true },
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '1280x720', width: 1280, height: 720, mobile: false },
  { name: '1440x900', width: 1440, height: 900, mobile: false },
];

const SIZES = ONLY ? SIZES_ALL.filter((s) => ONLY.split(',').includes(s.name)) : SIZES_ALL;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
let fails = 0;
for (const s of SIZES) {
  const ctx = await browser.newContext(
    s.mobile
      ? { ...devices['Pixel 7'], viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1 }
      : { viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1 },
  );
  // BRIEF-7 §2: у S7 две точки покоя — верх (заголовок и карточки целиком) и низ (счётчики и «Все кейсы»)
  let ok = true;
  const lines = [];
  let page;
  for (const [rest, local] of [['верх', 0.34], ['низ', 0.66]]) {
    if (page) await page.close();
    page = await ctx.newPage();
    await page.goto(`${base}/?still&t=6&tier=low&screen=6&local=${local}`, { waitUntil: 'networkidle', timeout: 180000 });
    await page.waitForTimeout(3500);
    const r = await page.evaluate(() => {
      const rect = (el) => el.getBoundingClientRect();
      const ribbon = rect(document.querySelector('[data-ribbon]'));
      const cards = Array.from(document.querySelectorAll('.screen--s7 .card')).map(rect).filter((b) => b.left < ribbon.right - 2 && b.right > ribbon.left + 2);
      const counters = rect(document.querySelector('[data-counters]'));
      const foot = rect(document.querySelector('.screen--s7 .g__foot'));
      const ticker = rect(document.querySelector('.screen--s7 .g__ticker'));
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72;
      // «Все кейсы» и кнопки ленты не под плавающими кнопками SOUND и WhatsApp
      const hit = (a, b) => (b.width && b.height ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0);
      const floats = ['.audio', '[data-wa-fab]'].map((q) => document.querySelector(q)).filter((el) => el && getComputedStyle(el).display !== 'none').map(rect);
      const under = (el) => (el ? floats.reduce((m, f) => Math.max(m, hit(rect(el), f)), 0) : 0);
      const footHit = under(document.querySelector('.screen--s7 .g__foot a'));
      const barHit = Math.max(...Array.from(document.querySelectorAll('.screen--s7 .ribbon__btn')).map(under));
      let overlap = 0;
      for (const b of cards) overlap = Math.max(overlap, Math.min(b.bottom, counters.bottom) - Math.max(b.top, counters.top));
      return {
        overlap,
        cardsBottom: Math.max(...cards.map((b) => b.bottom)),
        cardsTop: Math.min(...cards.map((b) => b.top)),
        countersTop: counters.top,
        footBottom: foot.bottom,
        tickerTop: ticker.top,
        firstCardLeft: cards[0] ? cards[0].left : null,
        header,
        footHit,
        barHit,
      };
    });
    // пиксельная проверка полосы шапки: в ней не должно быть линий сцены (канвас под шапкой = чистый фон)
    const readInk = () => page.evaluate(async (headerH) => {
      const canvas = document.querySelector('#gl');
      if (!canvas) return null;
      const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
      if (!gl) return null;
      const dpr = canvas.width / window.innerWidth;
      const w = canvas.width;
      const h = Math.max(1, Math.round((headerH - 8) * dpr));
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, canvas.height - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let dark = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] < 190) dark++;
      return { dark, total: px.length / 4 };
    }, r.header);
    let headerInk = await readInk();
    // весь буфер «тёмный» = кадр ещё не нарисован (SwiftShader на большом холсте) — ждём и читаем снова
    for (let k = 0; k < 3 && headerInk && headerInk.dark === headerInk.total; k++) {
      await page.waitForTimeout(2000);
      headerInk = await readInk();
    }
    const inkOk = !headerInk || headerInk.dark < headerInk.total * 0.002;
    const restOk =
      rest === 'верх'
        ? r.overlap < 1 && r.cardsBottom <= r.tickerTop + 1 && r.cardsTop >= r.header && r.barHit < 1
        : r.overlap < 1 && r.footBottom <= r.tickerTop + 1 && r.countersTop >= r.header && r.footHit < 1;
    if (!(inkOk && restOk)) ok = false;
    lines.push(
      rest === 'верх'
        ? `верх: карточки ${r.cardsTop.toFixed(0)}–${r.cardsBottom.toFixed(0)} при тикере ${r.tickerTop.toFixed(0)}, наложение на счётчики ${Math.max(0, r.overlap).toFixed(0)} px, кнопки ленты под SOUND/WhatsApp ${r.barHit.toFixed(0)} px², первая карточка x ${r.firstCardLeft === null ? '—' : r.firstCardLeft.toFixed(0)}, тёмных в полосе шапки ${headerInk ? headerInk.dark : '—'}`
        : `низ: счётчики с ${r.countersTop.toFixed(0)}, «Все кейсы» до ${r.footBottom.toFixed(0)} при тикере ${r.tickerTop.toFixed(0)}, под SOUND/WhatsApp ${r.footHit.toFixed(0)} px², тёмных в полосе шапки ${headerInk ? headerInk.dark : '—'}`,
    );
  }
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${s.name}: ${lines.join(' · ')}`);
  if (shots) await page.screenshot({ path: path.join(shots, `s7-${s.name}.png`) });
  await ctx.close();
}
await browser.close();
process.exit(fails ? 1 : 0);
