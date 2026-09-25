#!/usr/bin/env node
/**
 * Lighthouse через Playwright-Chromium: node scripts/lighthouse.mjs [base] [path] [mobile|desktop] [gpu]
 * Результат: docs/lighthouse-<имя>.json и краткий вывод.
 * По умолчанию WebGL идёт через SwiftShader (программный рендер, Performance главной сильно занижен).
 * С аргументом gpu Chromium рисует на видеокарте машины (ANGLE D3D11) — ближе к реальному устройству;
 * результат пишется в docs/lighthouse-<имя>-gpu.json.
 */
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import { writeFileSync } from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:4331';
// путь без ведущего слэша (в Git Bash аргумент «/» превращается в путь к Git); "home" = /
const rawPath = process.argv[3] || 'home';
const path = rawPath === 'home' ? '/' : '/' + rawPath.replace(/^\/+/, '');
const mobile = process.argv[4] === 'mobile';
const GPU = process.argv[5] === 'gpu';
const port = 9333;
const gl = GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`, ...gl, '--ignore-gpu-blocklist', '--enable-webgl'] });
try {
  const result = await lighthouse(`${base}${path}`, {
    port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    formFactor: mobile ? 'mobile' : 'desktop',
    screenEmulation: mobile ? { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false } : { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false },
    throttlingMethod: 'simulate',
  });
  const lhr = result.lhr;
  const name = (path === '/' ? 'home' : path.replace(/\W+/g, '-').replace(/^-|-$/g, '')) + (mobile ? '-mobile' : '-desktop') + (GPU ? '-gpu' : '');
  writeFileSync(`docs/lighthouse-${name}.json`, JSON.stringify(lhr, null, 1));
  const scores = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round((v.score ?? 0) * 100)]));
  const a = lhr.audits;
  const pick = (k) => a[k]?.displayValue ?? '—';
  console.log(name, scores);
  console.log('FCP', pick('first-contentful-paint'), '| LCP', pick('largest-contentful-paint'), '| CLS', pick('cumulative-layout-shift'), '| TBT', pick('total-blocking-time'), '| SI', pick('speed-index'));
  const lcpNode = a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet;
  console.log('LCP element:', (lcpNode || '').slice(0, 140));
  const fails = Object.values(a).filter((x) => x.score !== null && x.score < 0.9 && x.scoreDisplayMode === 'binary').map((x) => x.id);
  console.log('failing binary audits:', fails.join(', ') || 'none');
} finally {
  await browser.close();
}
