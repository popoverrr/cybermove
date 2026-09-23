#!/usr/bin/env node
/**
 * Гейт страницы кейсов (BRIEF-5 §6): разделы вместо фильтра, живые кадры, логотипы слоем,
 * липкая навигация, медленный зум при наведении, вес первой загрузки и контраст имени на кадре.
 *   node scripts/test-cases.mjs [--base http://127.0.0.1:4331] [--dist dist]
 * Кадры и вёрстка проверяются в браузере, наличие файлов — в собранном dist/.
 */
import { chromium, devices } from 'playwright';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import path from 'node:path';

const args = process.argv.slice(2);
const get = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const base = get('--base', 'http://127.0.0.1:4331');
const dist = get('--dist', 'dist');
/** куда сложить вырезанные участки подложки под именем (для разбора замера контраста) */
const crops = get('--crops', '');

let fails = 0;
const check = (ok, line) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
};

// ---------- статические проверки собранного сайта ----------
const cases = JSON.parse(readFileSync('src/content/ru/cases.json', 'utf8'));
const media = JSON.parse(readFileSync('src/content/media.json', 'utf8'));
const ids = cases.items.map((i) => i.id);
const withLogo = ids.filter((id) => media[`cases-${id}`]?.logo);

const assets = existsSync(path.join(dist, '_astro')) ? readdirSync(path.join(dist, '_astro')) : [];
check(assets.length > 0, `dist собран: файлов в _astro ${assets.length}`);
const stale = assets.filter((f) => /-(color|mono)\./.test(f));
check(stale.length === 0, `в dist нет плиток итерации 4 (*-color / *-mono): найдено ${stale.length}`);

let heroMissing = [];
for (const id of ids) {
  for (const p of [`cases/${id}/index.html`, `en/cases/${id}/index.html`]) {
    const f = path.join(dist, p);
    if (!existsSync(f) || !readFileSync(f, 'utf8').includes('frame__img')) heroMissing.push(p);
  }
}
check(heroMissing.length === 0, `шапка 16:9 на страницах кейсов (34 × 2 языка): без кадра ${heroMissing.length}`);

const home = readFileSync(path.join(dist, 'index.html'), 'utf8');
const s7cards = (home.match(/class="[^"]*card__photo/g) || []).length;
check(s7cards === 5, `S7 «Рост»: карточек с кадром 4:5 — ${s7cards} (ожидается 5)`);

// ---------- браузерные проверки ----------
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

for (const [lang, url] of [
  ['RU', '/cases/'],
  ['EN', '/en/cases/'],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const bytes = { total: 0 };
  page.on('response', async (r) => {
    const len = Number(r.headers()['content-length'] || 0);
    bytes.total += len;
  });
  await page.goto(base + url, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForTimeout(800);

  const r = await page.evaluate(() => {
    const secs = Array.from(document.querySelectorAll('[data-cat]'));
    const tiles = Array.from(document.querySelectorAll('.tile'));
    const imgs = tiles.map((t) => t.querySelector('.frame__img'));
    const logos = tiles.filter((t) => t.querySelector('.frame__logo'));
    const names = tiles.filter((t) => t.querySelector('.frame__name')?.textContent?.trim());
    return {
      sections: secs.length,
      tiles: tiles.length,
      chips: document.querySelectorAll('[data-catnav-link]').length,
      noAlt: imgs.filter((i) => !i || !i.getAttribute('alt')).length,
      broken: imgs.filter((i) => i && i.complete && i.naturalWidth === 0).length,
      logos: logos.length,
      names: names.length,
      filter: document.querySelectorAll('[data-filter-cat]').length,
      docW: document.documentElement.scrollWidth,
      vw: window.innerWidth,
      cols: getComputedStyle(document.querySelector('.grid-tiles')).gridTemplateColumns.split(' ').length,
    };
  });
  check(r.sections === 7 && r.chips === 7, `${lang}: разделов ${r.sections}, чипов ${r.chips}`);
  check(r.tiles === 34, `${lang}: плиток ${r.tiles}`);
  check(r.filter === 0, `${lang}: фильтра на странице нет (кнопок ${r.filter})`);
  check(r.logos === withLogo.length, `${lang}: логотипов на кадрах ${r.logos} (в наборе ${withLogo.length})`);
  check(r.names === 34, `${lang}: имя кейса на кадре у ${r.names} плиток`);
  check(r.noAlt === 0 && r.broken === 0, `${lang}: alt у всех кадров, битых кадров ${r.broken}`);
  check(r.docW <= r.vw + 1 && r.cols === 4, `${lang}: сетка 4 колонки, страница не едет вбок (${r.docW} ≤ ${r.vw})`);

  // липкая навигация и активный чип
  const nav = await page.evaluate(async () => {
    const sec = document.querySelector('#b2b');
    const navEl = document.querySelector('[data-catnav]');
    window.scrollTo(0, sec.getBoundingClientRect().top + window.scrollY - 130);
    await new Promise((res) => setTimeout(res, 700));
    const navBox = navEl.getBoundingClientRect();
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h'));
    return {
      navTop: Math.round(navBox.top),
      headerH,
      active: document.querySelector('[data-catnav-link].is-active')?.dataset.catnavLink,
    };
  });
  check(Math.abs(nav.navTop - nav.headerH) <= 1, `${lang}: навигация липнет под шапкой (top ${nav.navTop} ≈ ${nav.headerH})`);
  check(nav.active === 'b2b', `${lang}: активный чип соответствует разделу в кадре (${nav.active})`);

  // deep-link
  await page.goto(base + url + '#horeca', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  const deep = await page.evaluate(() => {
    const sec = document.querySelector('#horeca');
    const navEl = document.querySelector('[data-catnav]');
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h'));
    return { top: Math.round(sec.getBoundingClientRect().top), min: Math.round(headerH + navEl.offsetHeight) };
  });
  check(deep.top >= deep.min - 4, `${lang}: deep-link #horeca не уезжает под навигацию (top ${deep.top} ≥ ${deep.min - 4})`);

  if (lang === 'RU') {
    // медленный зум при наведении
    await page.goto(base + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const zoom = await page.evaluate(() => {
      const img = document.querySelector('.tile .frame__img');
      return { dur: getComputedStyle(img).transitionDuration };
    });
    await page.hover('.tile');
    await page.waitForTimeout(1600);
    const after = await page.evaluate(() => {
      const m = new DOMMatrix(getComputedStyle(document.querySelector('.tile .frame__img')).transform);
      const grad = getComputedStyle(document.querySelector('.tile .frame'), '::after').opacity;
      return { scale: m.a, grad: Number(grad) };
    });
    check(zoom.dur.startsWith('1.4'), `наведение: длительность зума ${zoom.dur}`);
    check(Math.abs(after.scale - 1.045) < 0.005, `наведение: масштаб кадра ${after.scale.toFixed(3)} (ожидается 1.045)`);
    check(after.grad >= 0.99, `наведение: градиент уплотняется до ${after.grad}`);


    // Контраст имени на самых светлых кадрах: прячем текст и меряем то, что под ним (кадр + градиент).
    // Уводим курсор: после проверки наведения он остаётся над плиткой, и при прокрутке под ним
    // оказывается другая — её кадр приближен, и замер получается не от спокойного состояния.
    await page.mouse.move(2, 2);
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      document.querySelectorAll('.frame__name').forEach((n) => (n.style.visibility = 'hidden'));
    });
    const lin = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    const PAPER = 0.2126 * lin(250) + 0.7152 * lin(248) + 0.0722 * lin(244);
    // светлые кадры: три из итерации 5 и два новых из итерации 5a
    for (const id of ['meshtiish', 'toscana-wine', 'building-time', 'gaia', 'barbershops-kyiv']) {
      const el = await page.$(`#${id} .frame__name`);
      if (!el) {
        check(false, `контраст имени: плитка ${id} не найдена`);
        continue;
      }
      await el.scrollIntoViewIfNeeded();
      // ждём, пока ленивый кадр догрузится: иначе меряем пустую плитку на бумажном фоне
      await page.waitForFunction(
        (sel) => {
          const img = document.querySelector(sel);
          return !!img && img.complete && img.naturalWidth > 0;
        },
        `#${id} .frame__img`,
        { timeout: 15000 },
      );
      // элемент не должен оказаться под липкой лентой: она светлая и портит замер
      await page.evaluate(
        (sel) => {
          const name = document.querySelector(sel);
          const nav = document.querySelector('[data-catnav]');
          const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72;
          const min = headerH + nav.offsetHeight + 12;
          const top = name.getBoundingClientRect().top;
          if (top < min) window.scrollBy(0, top - min);
        },
        `#${id} .frame__name`,
      );
      await page.waitForTimeout(400);
      // Меряем не всю строку-контейнер, а прямоугольники самого текста (Range.getClientRects):
      // имя занимает не всю ширину кадра, и блик в пустой части полосы к читаемости отношения не имеет.
      // Снимаем сам кадр (element screenshot — Playwright сам доводит его до вида) и режем по смещениям
      // внутри кадра: координаты вьюпорта при прокрутке давали чужой участок страницы.
      const geom = await page.evaluate(
        (sel) => {
          const name = document.querySelector(sel);
          const frame = name.closest('.frame');
          const fb = frame.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(name);
          return {
            frame: { width: fb.width, height: fb.height },
            rects: Array.from(range.getClientRects())
              .filter((r) => r.width > 4 && r.height > 4)
              .map((r) => ({ x: r.left - fb.left, y: r.top - fb.top, width: r.width, height: r.height })),
          };
        },
        `#${id} .frame__name`,
      );
      const frameEl = await page.$(`#${id} .frame`);
      const shot = await frameEl.screenshot();
      const meta = await sharp(shot).metadata();
      const k = meta.width / geom.frame.width; // на случай, если снимок в других пикселях
      let worst = 0;
      let sum = 0;
      let n = 0;
      for (const [j, r] of geom.rects.entries()) {
        const box = {
          left: Math.max(0, Math.round(r.x * k)),
          top: Math.max(0, Math.round(r.y * k)),
          width: Math.round(r.width * k),
          height: Math.round(r.height * k),
        };
        box.width = Math.min(box.width, meta.width - box.left);
        box.height = Math.min(box.height, meta.height - box.top);
        const { data, info } = await sharp(shot).extract(box).raw().toBuffer({ resolveWithObject: true });
        if (crops) {
          await sharp(shot).toFile(`${crops}/frame-${id}.png`);
          await sharp(shot).extract(box).toFile(`${crops}/contrast-${id}-${j + 1}.png`);
        }
        for (let i = 0; i < data.length; i += info.channels) {
          const L = 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
          const ratio = (Math.max(L, PAPER) + 0.05) / (Math.min(L, PAPER) + 0.05);
          sum += ratio;
          n++;
          if (worst === 0 || ratio < worst) worst = ratio;
        }
      }
      check(worst >= 4.5, `контраст имени на кадре ${id}: худший пиксель ${worst.toFixed(2)}:1, средний ${(sum / n).toFixed(2)}:1 (нужно ≥ 4.5)`);
    }
    await page.evaluate(() => {
      document.querySelectorAll('.frame__name').forEach((n) => (n.style.visibility = ''));
    });

    check(bytes.total <= 1.2 * 1024 * 1024, `вес первой загрузки /cases/ ${(bytes.total / 1024).toFixed(0)} КБ ≤ 1229 КБ`);
  }
  await ctx.close();
}

// тач: плитка в центре экрана получает то же состояние
const touch = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const tp = await touch.newPage();
await tp.goto(base + '/cases/', { waitUntil: 'networkidle', timeout: 180000 });
await tp.waitForTimeout(800);
const t = await tp.evaluate(async () => {
  const tile = document.querySelectorAll('.tile')[3];
  tile.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 900));
  const lifted = Array.from(document.querySelectorAll('.frame.is-lifted'));
  const nav = document.querySelector('[data-catnav] .container');
  return {
    lifted: lifted.length,
    scrollable: nav.scrollWidth > nav.clientWidth + 4,
    cols: getComputedStyle(document.querySelector('.grid-tiles')).gridTemplateColumns.split(' ').length,
    docW: document.documentElement.scrollWidth,
    vw: window.innerWidth,
  };
});
check(t.lifted > 0, `тач: плитка в центре экрана в состоянии наведения (${t.lifted})`);
check(t.scrollable, 'тач: лента чипов прокручивается по горизонтали');
check(t.cols === 2 && t.docW <= t.vw + 1, `тач: сетка ${t.cols} колонки, страница не едет вбок`);
await touch.close();

await browser.close();
console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
process.exit(fails ? 1 : 0);
