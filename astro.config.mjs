// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE_URL, LANGS, DEFAULT_LANG } from './site.config.ts';

import fs from 'node:fs';
import path from 'node:path';

const LABS = process.env.CYBERMOVE_LABS === '1';

// Превью на GitHub Pages: CYBERMOVE_SITE=https://<логин>.github.io CYBERMOVE_BASE=/<репозиторий>/ (см. .github/workflows/pages.yml)
const SITE = process.env.CYBERMOVE_SITE || SITE_URL;
const BASE = process.env.CYBERMOVE_BASE || '/';

/** BRIEF-SEO §6: lastmod в sitemap у статей — из frontmatter (updated или date) */
function insightDates() {
  const map = new Map();
  const root = path.resolve('src/content/insights');
  if (!fs.existsSync(root)) return map;
  for (const l of LANGS) {
    const dir = path.join(root, l.code);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const fm = fs.readFileSync(path.join(dir, f), 'utf8').split(/^---\s*$/m)[1] || '';
      const get = (k) => (fm.match(new RegExp(`^${k}:[ \\t]*['"]?([^'"\\r\\n]+)`, 'm')) || [])[1]?.trim();
      const direction = get('direction');
      const date = get('updated') || get('date');
      if (!direction || !date) continue;
      const prefix = l.prefix ? `/${l.prefix}` : '';
      map.set(`${prefix}/insights/${direction}/${f.replace(/\.md$/, '')}/`, new Date(date).toISOString());
    }
  }
  return map;
}
const INSIGHT_DATES = insightDates();

export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  devToolbar: { enabled: false },
  trailingSlash: 'always',
  build: {
    format: 'directory',
    assets: '_astro',
    inlineStylesheets: 'auto',
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: DEFAULT_LANG,
        locales: Object.fromEntries(LANGS.map((l) => [l.code, l.hreflang])),
      },
      filter: (page) => !page.includes('/404') && !page.includes('/dev/'),
      serialize(item) {
        const u = new URL(item.url);
        const p = BASE !== '/' ? u.pathname.replace(BASE.replace(/\/+$/, ''), '') : u.pathname;
        const lastmod = INSIGHT_DATES.get(p);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  vite: {
    define: {
      __CYBERMOVE_LABS__: JSON.stringify(LABS),
    },
    build: {
      // Скрипты всегда внешние, шрифты не превращаются в data: URI.
      assetsInlineLimit: 0,
      cssCodeSplit: true,
      // Vite 8 = Rolldown: группы чанков через advancedChunks (manualChunks-совместимость сливала
      // state.ts с чанком Tweakpane, и three-чанк тянул панель отладки на каждую страницу).
      rolldownOptions: {
        output: {
          advancedChunks: {
            groups: [
              // Хелпер динамических импортов Vite — отдельно, иначе утянет тяжёлый чанк в статический граф
              { name: 'preload', test: /vite[\/]dist[\/]client[\/]modulepreload|preload-helper/, priority: 200 },
              // Общее состояние DOM↔WebGL и аналитика — отдельный маленький чанк
              { name: 'state', test: /[\/]src[\/]lib[\/](state|analytics)\.ts/, priority: 150 },
              // Панель отладки (Tweakpane) — ленивый чанк, только при ?debug
              { name: 'debug', test: /node_modules[\\/](tweakpane|@tweakpane)[\\/]|[\\/]src[\\/]webgl[\\/]debug/, priority: 100 },
              // Лёгкий фон внутренних страниц и GLSL-строки — без three
              { name: 'litebg', test: /[\\/]src[\\/]webgl[\\/](backgrounds[\\/](lite-bg|bgShader)|shaders[\\/]noise)/, priority: 90 },
              // Весь 3D — отдельный чанк, грузится динамически после первой отрисовки
              { name: 'three', test: /node_modules[\\/](three|postprocessing)[\\/]|[\\/]src[\\/]webgl[\\/]/, priority: 80 },
              { name: 'motion', test: /node_modules[\\/](gsap|lenis)[\\/]/, priority: 70 },
            ],
          },
        },
      },
    },
  },
});
