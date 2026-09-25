#!/usr/bin/env node
/**
 * Аудит собранного сайта (BRIEF-SEO §8): проходит по dist/**\/*.html и проверяет то, что видит поисковик.
 *   node scripts/seo-audit.mjs [--dist dist] [--json docs/seo-audit.json]
 *
 * Проверки по каждой индексируемой странице:
 *   - ровно один H1; уровни заголовков идут без пропусков (h2 → h4 без h3 — ошибка);
 *   - в <title>, meta description и H1 нет «[PLACEHOLDER»;
 *   - есть canonical и hreflang, title ≤ 60 символов, description 70–170;
 *   - у содержательных картинок непустой alt (декоративные — alt="" внутри aria-hidden допустимы);
 *   - title не повторяется в пределах языка.
 * Граф ссылок: у каждой страницы ≥ 2 входящих ссылок не из подвала и не из шапки («сирот» нет).
 * Страницы с meta robots noindex (404) в граф и проверки заголовков не входят.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';

const args = process.argv.slice(2);
const get = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const DIST = get('--dist', 'dist');
const JSON_OUT = get('--json', '');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** /cases/usyk/index.html → /cases/usyk/ */
const urlOf = (file) => {
  const rel = path.relative(DIST, file).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  return '/' + rel;
};

const pages = new Map();
for (const file of walk(DIST)) {
  const url = urlOf(file);
  const html = readFileSync(file, 'utf8');
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: true } });
  const robots = root.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
  pages.set(url, { url, file, root, noindex: /noindex/i.test(robots) });
}

const problems = [];
const warn = (url, msg) => problems.push({ url, msg });
const titles = new Map();

for (const p of pages.values()) {
  if (p.noindex) continue;
  const { root, url } = p;
  const lang = root.querySelector('html')?.getAttribute('lang') || '?';
  const title = root.querySelector('title')?.text.trim() || '';
  const desc = root.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const h1s = root.querySelectorAll('h1');
  p.title = title;
  p.lang = lang;

  if (h1s.length !== 1) warn(url, `H1: ${h1s.length} (нужен ровно один)`);
  for (const [label, text] of [['title', title], ['description', desc], ['H1', h1s[0]?.text || '']]) {
    if (text.includes('[PLACEHOLDER')) warn(url, `«[PLACEHOLDER» в ${label}`);
  }
  if (!title) warn(url, 'нет <title>');
  else if (title.length > 60) warn(url, `title ${title.length} символов (> 60): ${title}`);
  if (!desc) warn(url, 'нет meta description');
  else if (desc.length < 70 || desc.length > 170) warn(url, `description ${desc.length} символов (нужно 70–170)`);
  if (!root.querySelector('link[rel="canonical"]')) warn(url, 'нет canonical');
  if (root.querySelectorAll('link[rel="alternate"][hreflang]').length < 2) warn(url, 'нет hreflang');

  // порядок заголовков по документу
  let prev = 0;
  for (const h of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const lvl = Number(h.tagName[1]);
    if (prev && lvl > prev + 1) warn(url, `пропуск уровня: h${prev} → h${lvl} («${h.text.trim().slice(0, 50)}»)`);
    prev = lvl;
  }

  // картинки: содержательные (не внутри aria-hidden) должны иметь alt
  for (const img of root.querySelectorAll('img')) {
    const alt = img.getAttribute('alt');
    let decorative = false;
    for (let n = img; n; n = n.parentNode) {
      if (n.getAttribute?.('aria-hidden') === 'true') decorative = true;
    }
    if (alt === undefined) warn(url, `img без alt: ${img.getAttribute('src')}`);
    else if (!alt.trim() && !decorative && !img.classList.contains('frame__logo')) {
      warn(url, `пустой alt у содержательной картинки: ${(img.getAttribute('src') || '').slice(0, 60)}`);
    }
  }

  const key = `${lang}:${title}`;
  titles.set(key, [...(titles.get(key) || []), url]);
}
for (const [key, urls] of titles) {
  if (urls.length > 1) warn(urls.join(', '), `одинаковый title (${key.split(':')[0]}): ${key.slice(3)}`);
}

// ---------- граф внутренних ссылок
const incoming = new Map([...pages.keys()].map((u) => [u, new Set()]));
const inFooterOrHeader = (a) => {
  for (let n = a; n; n = n.parentNode) {
    const tag = n.tagName?.toLowerCase();
    if (tag === 'footer' || tag === 'header') {
      const cls = n.getAttribute?.('class') || '';
      // шапка страницы кейса (<header class="chead">) и разделов — это контент, не навигация
      if (tag === 'footer' || /\bheader\b/.test(cls)) return true;
    }
  }
  return false;
};
for (const p of pages.values()) {
  for (const a of p.root.querySelectorAll('a[href]')) {
    let href = a.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) continue;
    href = href.split('#')[0].split('?')[0];
    if (!href.endsWith('/') && !path.extname(href)) href += '/';
    if (!incoming.has(href) || href === p.url) continue;
    if (inFooterOrHeader(a)) continue;
    incoming.get(href).add(p.url);
  }
}
const orphans = [];
for (const [url, from] of incoming) {
  const p = pages.get(url);
  if (p.noindex || url === '/' || url === '/en/') continue;
  if (from.size < 2) orphans.push({ url, from: [...from] });
}
for (const o of orphans) warn(o.url, `входящих ссылок не из шапки/подвала: ${o.from.length} (нужно ≥ 2)`);

// ---------- итог
const indexable = [...pages.values()].filter((p) => !p.noindex).length;
console.log(`Страниц: ${pages.size}, индексируемых: ${indexable}, замечаний: ${problems.length}`);
const byMsg = new Map();
for (const pr of problems) {
  const k = pr.msg.replace(/[«:].*$/, '').trim();
  byMsg.set(k, (byMsg.get(k) || 0) + 1);
}
for (const [k, n] of [...byMsg].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)} × ${k}`);
if (args.includes('--verbose')) for (const pr of problems) console.log(`  ${pr.url}  ${pr.msg}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ pages: pages.size, indexable, problems }, null, 1));
process.exit(problems.length ? 1 : 0);
