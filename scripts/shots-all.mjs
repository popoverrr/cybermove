#!/usr/bin/env node
/**
 * Полный комплект скриншотов (главная по экранам + все страницы, desktop и mobile) — обёртка над shots.mjs.
 *   node scripts/shots-all.mjs --out docs/screens/v2/a [--base http://127.0.0.1:4331]
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const get = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const out = get('--out', 'docs/screens/v2/tmp');
const base = get('--base', 'http://127.0.0.1:4331');
const T = 'still&t=8&tier=high';
const SHOTS = [
  [`/?still&t=1.6&tier=high`, 'home-01-s1-intro'],
  [`/?${T}`, 'home-02-s1'],
  [`/?${T}&screen=1&local=0.45`, 'home-03-s2'],
  [`/?${T}&screen=2&local=0.5`, 'home-04-s3'],
  [`/?${T}&screen=3&local=0.14`, 'home-05-s4'],
  [`/?${T}&screen=4&local=0.5`, 'home-06-s5'],
  [`/?${T}&screen=5&local=0.78`, 'home-07-s6'],
  [`/?${T}&screen=6&local=0.6`, 'home-08-s7'],
  [`/?${T}&screen=7&local=1`, 'home-09-s8'],
  [`/?${T}&screen=1&local=0.45&service=financial-audit`, 'home-10-drawer'],
  [`/en/?${T}`, 'home-en-s1'],
  ['/nope/', 'page-404'],
  ['/about/', 'page-about'],
  ['/cases/', 'page-cases'],
  ['/contact/', 'page-contact'],
  ['/privacy/', 'page-privacy'],
  ['/services/', 'page-services'],
  ['/services/audit/', 'page-services-audit'],
  ['/services/systems/', 'page-services-systems'],
  ['/services/brand-content/', 'page-services-brand-content'],
  ['/services/traffic/', 'page-services-traffic'],
  ['/services/tenders-legal/', 'page-services-tenders-legal'],
  ['/en/about/', 'page-en-about'],
  ['/en/cases/', 'page-en-cases'],
  ['/en/contact/', 'page-en-contact'],
  ['/en/services/', 'page-en-services'],
  ['/en/services/traffic/', 'page-en-services-traffic'],
];
// главная — кадр окна (экраны pinned), страницы — во всю высоту
const home = SHOTS.filter(([, n]) => n.startsWith('home')).map(([p, n]) => `${p}:${n}`);
const pages = SHOTS.filter(([, n]) => n.startsWith('page')).map(([p, n]) => `${p}:${n}`);
const run = (extra, list) => spawnSync(process.execPath, ['scripts/shots.mjs', '--out', out, '--base', base, '--sizes', 'desktop,mobile', '--wait', '3500', ...extra, ...list], { stdio: 'inherit' });
const r1 = run([], home);
const r2 = run(['--full'], pages);
process.exit(r1.status || r2.status || 0);
