// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE_URL, LANGS, DEFAULT_LANG } from './site.config.ts';

const LABS = process.env.CYBERMOVE_LABS === '1';

export default defineConfig({
  site: SITE_URL,
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
      rollupOptions: {
        output: {
          manualChunks(id) {
            const p = id.split('\\').join('/');
            if (p.includes('vite/preload-helper')) return 'preload';
            // Весь 3D — отдельный чанк, грузится динамически после первой отрисовки.
            if (/node_modules\/(tweakpane|@tweakpane)\//.test(p) || p.includes('/src/webgl/debug')) return 'debug';
            if (/node_modules\/(three|postprocessing)\//.test(p) || p.includes('/src/webgl/')) return 'three';
            if (/node_modules\/(gsap|lenis)\//.test(p)) return 'motion';
          },
        },
      },
    },
  },
});
