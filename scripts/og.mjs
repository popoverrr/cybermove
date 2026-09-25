/**
 * OG-картинки 1200×630 на сборке (BRIEF-SEO §5): satori (разметка → SVG) + resvg (SVG → PNG) + sharp (JPEG).
 * Бумага темы страницы, микрометка раздела (JetBrains Mono), заголовок Inter Tight, логотип; кейсы — на кадре 16:9
 * с затемнением. Запускается из `npm run build` перед `astro build`; результат — public/og/<lang>/<путь>.jpg
 * (в git не хранится). Кэш по хэшу входных данных: неизменённые картинки не перерисовываются.
 *
 *   node scripts/og.mjs            # все страницы RU/EN
 *   node scripts/og.mjs --force    # перерисовать всё
 *   node scripts/og.mjs --only services/audit   # только пути, содержащие подстроку (для проверки)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public', 'og');
const CACHE_FILE = path.join(ROOT, 'node_modules', '.cache', 'cybermove-og.json');
const W = 1200;
const H = 630;
const VERSION = 'og-v1'; // смена шаблона — поднять версию, кэш сбросится
const LANGS = ['ru', 'en'];
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';

const PALETTE = {
  ivory: { bg: '#f2efe9', fg: '#1b1a18', micro: '#8a8177', line: 'rgba(27,26,24,0.16)' },
  sand: { bg: '#e9e4dc', fg: '#1b1a18', micro: '#8a8177', line: 'rgba(27,26,24,0.16)' },
  stone: { bg: '#ddd7ce', fg: '#1b1a18', micro: '#5a544d', line: 'rgba(27,26,24,0.18)' },
  clay: { bg: '#cfc7bb', fg: '#1b1a18', micro: '#5a544d', line: 'rgba(27,26,24,0.2)' },
};

/* ---------- данные ---------- */
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const content = (lang, name) => readJson(`src/content/${lang}/${name}.json`);
const media = readJson('src/content/media.json');

/** «Разборы»: верхние скалярные поля frontmatter (title, description, direction, cover) */
function readInsights(lang) {
  const dir = path.join(ROOT, 'src', 'content', 'insights', lang);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const fm = fs.readFileSync(path.join(dir, f), 'utf8').split(/^---\s*$/m)[1] || '';
      const get = (k) => {
        const m = fm.match(new RegExp(`^${k}:[ \t]*(.+)$`, 'm'));
        if (!m) return '';
        const v = m[1].trim();
        return /^["']/.test(v) ? v.slice(1, -1).replace(/\\"/g, '"') : v;
      };
      return { slug: f.replace(/\.md$/, ''), title: get('title'), description: get('description'), direction: get('direction'), cover: get('cover'), date: get('date') };
    });
}

/** Список страниц: { lang, key (путь без слэшей, 'home' для главной), theme, label, title, sub?, photo? } */
export function ogPages() {
  const pages = [];
  for (const lang of LANGS) {
    const ui = content(lang, 'ui');
    const home = content(lang, 'home');
    const services = content(lang, 'services');
    const cases = content(lang, 'cases');
    const about = content(lang, 'about');
    const contact = content(lang, 'contact');
        pages.push({ lang, key: 'home', theme: 'ivory', label: ui.meta.home.title.split(' — ')[0], title: home.s1.h1, sub: home.s1.lead });
    pages.push({ lang, key: 'services', theme: 'sand', label: `${ui.services} · 05 · 22`, title: services.index.h1, sub: services.index.lead });
    for (const d of services.directions) {
      pages.push({ lang, key: `services/${d.slug}`, theme: d.theme, label: `${d.index} · ${d.stage} · ${d.seo.kicker}`, title: d.h2, sub: d.phrase });
      for (const s of d.services) {
        pages.push({ lang, key: `services/${d.slug}/${s.id}`, theme: d.theme, label: `${d.index} · ${d.nameFull}`, title: s.seo.h1, sub: s.line });
      }
    }
    pages.push({ lang, key: 'cases', theme: 'ivory', label: `${cases.title} · ${cases.items.length}`, title: cases.h1, sub: `${cases.lead.split('. ')[0].replace(/\.$/, '')}.` });
    const caseWord = lang === 'ru' ? 'Кейс' : 'Case';
    for (const it of cases.items) {
      const cat = cases.categories.find((x) => x.id === it.category);
      const slot = media[`cases-${it.id}`];
      const photo = slot && typeof slot === 'object' ? slot.hero || slot.src : typeof slot === 'string' ? slot : null;
      pages.push({
        lang,
        key: `cases/${it.id}`,
        theme: 'ivory',
        label: `${caseWord} · ${String(it.n).padStart(2, '0')}${cat ? ` · ${cat.label}` : ''}`,
        title: it.name,
        sub: it.summary,
        photo: photo ? path.join('src', 'assets', photo) : null,
      });
    }
    pages.push({ lang, key: 'about', theme: 'sand', label: about.kicker, title: about.h1, sub: about.lead });
    pages.push({ lang, key: 'contact', theme: 'ivory', label: contact.title, title: contact.h1, sub: contact.lead });
    pages.push({ lang, key: 'privacy', theme: 'ivory', label: ui.brand, title: ui.privacy.title });

    const insights = readInsights(lang);
    if (insights.length) {
      pages.push({ lang, key: 'insights', theme: 'ivory', label: `${ui.insights} · ${insights.length}`, title: ui.insightsH1, sub: ui.insightsLead });
      const PAGE = 12;
      for (let n = 2; n <= Math.ceil(insights.length / PAGE); n++) {
        pages.push({ lang, key: `insights/page/${n}`, theme: 'ivory', label: `${ui.insights} · ${ui.pageLabel} ${n}`, title: ui.insightsH1, sub: ui.insightsLead });
      }
      for (const d of services.directions) {
        const list = insights.filter((x) => x.direction === d.id);
        if (!list.length) continue;
        pages.push({ lang, key: `insights/${d.id}`, theme: d.theme, label: `${ui.insights} · ${d.index} · ${d.stage}`, title: `${ui.insights}: ${d.nameFull}`, sub: d.phrase });
      }
      for (const a of insights) {
        const d = services.directions.find((x) => x.id === a.direction);
        const slot = a.cover ? media[a.cover] : null;
        const photo = slot && typeof slot === 'object' ? slot.hero || slot.src : typeof slot === 'string' ? slot : null;
        pages.push({
          lang,
          key: `insights/${a.direction}/${a.slug}`,
          theme: d?.theme || 'ivory',
          label: `${ui.insights} · ${d ? d.nameFull : a.direction}`,
          title: a.title,
          sub: a.description,
          photo: photo ? path.join('src', 'assets', photo) : null,
        });
      }
    }
  }
  return pages;
}

/* ---------- шрифты и логотип ---------- */
const fontFile = (pkg, file) => fs.readFileSync(path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file));
const FONTS = [
  { name: 'Inter Tight', data: fontFile('inter-tight', 'inter-tight-latin-300-normal.woff'), weight: 300, style: 'normal' },
  { name: 'Inter Tight', data: fontFile('inter-tight', 'inter-tight-latin-400-normal.woff'), weight: 400, style: 'normal' },
  { name: 'Inter Tight Cyr', data: fontFile('inter-tight', 'inter-tight-cyrillic-300-normal.woff'), weight: 300, style: 'normal' },
  { name: 'Inter Tight Cyr', data: fontFile('inter-tight', 'inter-tight-cyrillic-400-normal.woff'), weight: 400, style: 'normal' },
  { name: 'JetBrains Mono', data: fontFile('jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff'), weight: 400, style: 'normal' },
  { name: 'JetBrains Mono Cyr', data: fontFile('jetbrains-mono', 'jetbrains-mono-cyrillic-400-normal.woff'), weight: 400, style: 'normal' },
];
const SANS = 'Inter Tight, Inter Tight Cyr';
const MONO = 'JetBrains Mono, JetBrains Mono Cyr';
// в подмножествах latin/cyrillic нет стрелок и части символов — заменяем до вёрстки
const clean = (s) => String(s ?? '').replace(/\s*→\s*/g, ' · ').replace(/[↗↘]/g, '');
/** подзаголовок не длиннее n знаков: обрезка по слову с многоточием */
const clip = (s, n = 150) => {
  const t = clean(s);
  if (t.length <= n) return t;
  return `${t.slice(0, n).replace(/[\s,.;:—-]+\S*$/, '')}…`;
};

const logoRaw = fs.readFileSync(path.join(ROOT, 'src', 'assets', 'logo', 'logo.svg'), 'utf8');
const logo = (color) => `data:image/svg+xml;base64,${Buffer.from(logoRaw.replace(/currentColor/g, color)).toString('base64')}`;

/* ---------- вёрстка ---------- */
const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat().filter((x) => x !== null && x !== undefined && x !== false) } });
const img = (src, style) => ({ type: 'img', props: { src, style } });

function titleSize(t) {
  const n = t.length;
  if (n <= 28) return 78;
  if (n <= 44) return 68;
  if (n <= 64) return 58;
  if (n <= 90) return 50;
  return 44;
}

function paperCard(p) {
  const c = PALETTE[p.theme] || PALETTE.ivory;
  const title = clean(p.title);
  const fs = titleSize(title);
  return h(
    'div',
    { width: W, height: H, backgroundColor: c.bg, color: c.fg, position: 'relative', flexDirection: 'column', padding: '64px 72px 56px', fontFamily: SANS },
    // орбиты справа — волосяные линии, как на сайте
    h('div', { position: 'absolute', right: -300, top: 36, width: 560, height: 560, borderRadius: 9999, border: `1.5px solid ${c.line}` }),
    h('div', { position: 'absolute', right: -190, top: 146, width: 340, height: 340, borderRadius: 9999, border: `1.5px solid ${c.line}` }),
    h('div', { position: 'absolute', right: 56, top: 306, width: 12, height: 12, borderRadius: 9999, backgroundColor: c.fg }),
    img(logo(c.fg), { width: 148, height: 40 }),
    h(
      'div',
      { flexDirection: 'column', marginTop: 'auto', maxWidth: 850 },
      h('div', { fontFamily: MONO, fontSize: 20, letterSpacing: 2.4, textTransform: 'uppercase', color: c.micro, marginBottom: 22 }, clean(p.label)),
      h('div', { fontSize: fs, fontWeight: 300, lineHeight: 1.06, letterSpacing: -fs * 0.025 }, title),
      p.sub ? h('div', { fontSize: 25, fontWeight: 400, lineHeight: 1.35, color: '#5a544d', marginTop: 22, maxWidth: 800 }, clip(p.sub)) : null,
    ),
    h(
      'div',
      { marginTop: 40, paddingTop: 18, borderTop: `1px solid ${c.line}`, justifyContent: 'space-between', fontFamily: MONO, fontSize: 17, letterSpacing: 2, textTransform: 'uppercase', color: c.micro },
      h('div', {}, 'cybermove.asia'),
      h('div', {}, 'CHAOS · CORE · SYSTEM · GROWTH'),
    ),
  );
}

async function photoCard(p) {
  const buf = await sharp(path.join(ROOT, p.photo)).resize(W, H, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88 }).toBuffer();
  const bg = `data:image/jpeg;base64,${buf.toString('base64')}`;
  const title = clean(p.title);
  const fs = Math.min(titleSize(title) + 4, 82);
  return h(
    'div',
    { width: W, height: H, position: 'relative', flexDirection: 'column', padding: '64px 72px 56px', fontFamily: SANS, color: '#faf8f4', backgroundColor: '#1b1a18' },
    img(bg, { position: 'absolute', left: 0, top: 0, width: W, height: H }),
    // затемнение: сверху под логотип, снизу под текст (как scrim у CaseFrame)
    h('div', { position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundImage: 'linear-gradient(180deg, rgba(27,26,24,0.55) 0%, rgba(27,26,24,0.2) 34%, rgba(27,26,24,0.62) 64%, rgba(27,26,24,0.9) 100%)' }),
    img(logo('#faf8f4'), { width: 148, height: 40 }),
    h(
      'div',
      { flexDirection: 'column', marginTop: 'auto', maxWidth: 980 },
      h('div', { fontFamily: MONO, fontSize: 20, letterSpacing: 2.4, textTransform: 'uppercase', color: 'rgba(250,248,244,0.78)', marginBottom: 20 }, clean(p.label)),
      h('div', { fontSize: fs, fontWeight: 300, lineHeight: 1.04, letterSpacing: -fs * 0.025 }, title),
      p.sub ? h('div', { fontSize: 25, fontWeight: 400, lineHeight: 1.35, color: 'rgba(250,248,244,0.86)', marginTop: 20, maxWidth: 900 }, clip(p.sub)) : null,
    ),
  );
}

/* ---------- сборка ---------- */
function hashOf(p) {
  const hsh = crypto.createHash('sha1').update(VERSION).update(JSON.stringify(p));
  if (p.photo) {
    const st = fs.statSync(path.join(ROOT, p.photo));
    hsh.update(`${st.size}:${st.mtimeMs}`);
  }
  return hsh.digest('hex');
}

async function render(p) {
  const tree = p.photo ? await photoCard(p) : paperCard(p);
  const svg = await satori(tree, { width: W, height: H, fonts: FONTS });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: false } }).render().asPng();
  return sharp(png).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

async function main() {
  const t0 = Date.now();
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    /* первый запуск */
  }
  const pages = ogPages().filter((p) => !ONLY || `${p.lang}/${p.key}`.includes(ONLY));
  let drawn = 0;
  const want = new Set();
  for (const p of pages) {
    const rel = `${p.lang}/${p.key}.jpg`;
    want.add(rel);
    const file = path.join(OUT, rel);
    const hash = hashOf(p);
    if (!FORCE && cache[rel] === hash && fs.existsSync(file)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await render(p));
    cache[rel] = hash;
    drawn++;
  }
  // удалить картинки страниц, которых больше нет (только при полном прогоне)
  let removed = 0;
  if (!ONLY && fs.existsSync(OUT)) {
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) walk(full);
        else {
          const rel = path.relative(OUT, full).split(path.sep).join('/');
          if (!want.has(rel)) {
            fs.unlinkSync(full);
            delete cache[rel];
            removed++;
          }
        }
      }
    };
    walk(OUT);
  }
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  console.log(`OG: страниц ${pages.length}, нарисовано ${drawn}, из кэша ${pages.length - drawn}${removed ? `, удалено ${removed}` : ''} · ${((Date.now() - t0) / 1000).toFixed(1)} с`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
