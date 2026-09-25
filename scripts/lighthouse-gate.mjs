#!/usr/bin/env node
/**
 * Гейт BRIEF-SEO §8: Lighthouse по шести типам страниц, mobile и desktop, N прогонов, медианы.
 *   node scripts/lighthouse-gate.mjs [base] [runs] [gpu]
 *   node scripts/lighthouse-gate.mjs https://cybermove.asia 3 gpu
 * Результат: docs/lighthouse-gate.json (все прогоны + медианы) и таблица в консоли.
 * gpu — Chromium рисует на видеокарте (ANGLE D3D11); без него WebGL главной идёт через SwiftShader и сильно занижен.
 */
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import { writeFileSync } from 'node:fs';

const base = (process.argv[2] || 'http://127.0.0.1:4331').replace(/\/+$/, '');
const RUNS = Number(process.argv[3] || 3);
const GPU = process.argv[4] === 'gpu';
const PAGES = [
  ['главная', '/'],
  ['направление', '/services/audit/'],
  ['услуга', '/services/audit/business-audit/'],
  ['статья', '/insights/audit/business-audit-before-ads/'],
  ['кейс', '/cases/usyk/'],
  ['контакты', '/contact/'],
];
const port = 9334;
const gl = GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const out = { base, runs: RUNS, gpu: GPU, date: new Date().toISOString(), pages: [] };
for (const [label, path] of PAGES) {
  for (const form of ['mobile', 'desktop']) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`, ...gl, '--ignore-gpu-blocklist', '--enable-webgl'] });
      try {
        const { lhr } = await lighthouse(`${base}${path}`, {
          port,
          output: 'json',
          logLevel: 'error',
          onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
          formFactor: form,
          screenEmulation: form === 'mobile' ? { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false } : { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false },
          throttlingMethod: 'simulate',
        });
        const s = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round((v.score ?? 0) * 100)]));
        const a = lhr.audits;
        runs.push({
          ...s,
          lcp: Math.round(a['largest-contentful-paint']?.numericValue ?? 0),
          tbt: Math.round(a['total-blocking-time']?.numericValue ?? 0),
          cls: Number((a['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)),
          fails: Object.values(a).filter((x) => x.score !== null && x.score < 0.9 && x.scoreDisplayMode === 'binary').map((x) => x.id),
        });
      } catch (e) {
        runs.push({ error: String(e?.message || e) });
      } finally {
        await browser.close();
      }
    }
    const ok = runs.filter((r) => !r.error);
    const med = ok.length
      ? Object.fromEntries(['performance', 'accessibility', 'best-practices', 'seo', 'lcp', 'tbt'].map((k) => [k, median(ok.map((r) => r[k]))]).concat([['cls', median(ok.map((r) => Math.round(r.cls * 1000))) / 1000]]))
      : null;
    out.pages.push({ label, path, form, median: med, runs });
    console.log(
      `${label.padEnd(12)} ${form.padEnd(8)}`,
      med ? `P ${med.performance} · A ${med.accessibility} · BP ${med['best-practices']} · SEO ${med.seo} · LCP ${med.lcp} мс · TBT ${med.tbt} мс · CLS ${med.cls}` : 'ошибка',
      ok[0]?.fails?.length ? `· не пройдено: ${[...new Set(ok.flatMap((r) => r.fails))].join(', ')}` : '',
    );
    writeFileSync('docs/lighthouse-gate.json', JSON.stringify(out, null, 1));
  }
}
