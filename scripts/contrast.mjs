#!/usr/bin/env node
/**
 * Контраст текста по темам (BRIEF-2 §3): читает src/styles/tokens.css, для каждой [data-theme] считает
 * WCAG-контраст --fg, --fg-2 (порог 4.5:1) и --fg-3 (порог 3:1) относительно --bg.
 *   node scripts/contrast.mjs
 */
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles/tokens.css', 'utf8');
const rootVars = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2].toLowerCase()]));
const resolve = (v) => {
  const m = v.match(/var\(--([a-z0-9-]+)\)/i);
  return m ? rootVars[m[1]] : v.toLowerCase();
};
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
    x /= 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

let ok = true;
for (const m of css.matchAll(/\[data-theme='([a-z]+)'\]\s*\{([^}]+)\}/g)) {
  const vars = Object.fromEntries([...m[2].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((x) => [x[1], resolve(x[2].trim())]));
  const bg = vars.bg;
  const rows = [
    ['fg', vars.fg, 4.5],
    ['fg-2', vars['fg-2'], 4.5],
    ['fg-3', vars['fg-3'], 3],
  ];
  const line = rows.map(([k, c, min]) => {
    const r = ratio(c, bg);
    if (r < min) ok = false;
    return `${k} ${c} ${r.toFixed(2)}:1 ${r >= min ? 'ok' : 'FAIL'}`;
  });
  console.log(`${m[1].padEnd(6)} bg ${bg}  ${line.join('  ')}`);
}
process.exit(ok ? 0 : 1);
