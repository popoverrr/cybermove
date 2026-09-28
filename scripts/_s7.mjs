import { chromium, devices } from 'playwright';
const base = 'http://127.0.0.1:4331', out = 'docs/screens/v7';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const sizes = [['1440x900', 1440, 900, false], ['1280x720', 1280, 720, false], ['1024x768', 1024, 768, false], ['390x844', 390, 844, true], ['360x640', 360, 640, true]];
for (const [name, w, h, mobile] of sizes) {
  const ctx = await b.newContext(mobile ? { ...devices['Pixel 7'], viewport: { width: w, height: h }, deviceScaleFactor: 2 } : { viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { try { localStorage.setItem('cm_lang', 'ru'); } catch {} });
  for (const local of [0.34, 0.66]) {
    const p = await ctx.newPage();
    await p.goto(`${base}/?still&t=6&tier=low&screen=6&local=${local}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(3000);
    const r = await p.evaluate(() => {
      const R = (el) => el && el.getBoundingClientRect();
      const cards = [...document.querySelectorAll('.screen--s7 .ribbon__item')].map(R);
      const vis = cards.filter((c) => c.right > 0 && c.left < innerWidth - 2);
      const photo = R(document.querySelector('.screen--s7 .ribbon__item .frame'));
      const counters = R(document.querySelector('[data-counters]'));
      const foot = R(document.querySelector('.g__foot'));
      const head = R(document.querySelector('.g__h2'));
      const tick = R(document.querySelector('.g__ticker'));
      return {
        card: `${Math.round(photo.width)}×${Math.round(photo.height)} (${Math.round((photo.height / innerHeight) * 100)}vh) в кадре ${vis.length}`,
        headTop: Math.round(head.top), photoTop: Math.round(photo.top), photoBottom: Math.round(photo.bottom), tickerTop: Math.round(tick.top),
        counters: `${Math.round(counters.top)}–${Math.round(counters.bottom)}`, footBottom: Math.round(foot.bottom), pos: document.querySelector('[data-ribbon-pos]')?.textContent,
      };
    });
    console.log(name, local, JSON.stringify(r));
    await p.screenshot({ path: `${out}/s7-${name}-${local === 0.34 ? 'top' : 'bottom'}.png` });
    await p.close();
  }
  await ctx.close();
}
await b.close();
