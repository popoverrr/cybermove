/**
 * Сценарий главной: скролл (Lenis на десктопе, нативный на тач) → цели прогресса экранов; единый rAF
 * сглаживает их (BRIEF-2 §8: сцены, фон и CSS читают только сглаженные значения), выбирает активный экран
 * с гистерезисом, ведёт пороговые твины текста (вход 0.08, выход 0.78), Rail, постер и фолбэки.
 * Snap убран; автоскролл по Rail и якорям — 1.6 с power2.inOut.
 */
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { state, SCREEN_IDS, setHover } from './state';
import { initRows, initDrawer, initAnchors, syncTheme } from './home-ui';
import { updateGrowth, initRail, updateRail, initPreloader } from './home-extra';
import { initForms } from './form';
import { initAudio } from './audio';
import type { Engine } from '../webgl/boot';

gsap.registerPlugin(SplitText);

const q = new URLSearchParams(location.search);
const STILL = q.has('still');
const FORCE_FALLBACK = q.has('nogl');
const PROGRESS = q.get('progress');
const SCREEN = q.get('screen');
const LOCAL = q.get('local');
const T = q.get('t');
const HOVER = q.get('hover');
const POSTER = q.has('poster');

/** Пороги (BRIEF-2 §8.2, §8.5): вход/выход экрана в долях его прокрутки, появление/уход текста */
export const ENTER_END = 0.2;
export const EXIT_START = 0.7;
const TEXT_IN = 0.08;
const TEXT_OUT = 0.78;
/** сглаживание: λ ≈ 7 на десктопе (~150 мс отставания), 4.5 на тач (~250 мс) */
const COARSE = matchMedia('(pointer: coarse)').matches;
const LAMBDA = COARSE ? 4.5 : 7;

let engine: Engine | null = null;
let lenis: Lenis | null = null;

function supportsWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    return Boolean(gl);
  } catch {
    return false;
  }
}

/* ---------- прогресс экранов ---------- */
interface ScreenDef {
  el: HTMLElement;
  pin: HTMLElement | null;
  /** начало и длительность в px (пересчитываются при ресайзе) */
  start: number;
  dur: number;
  inFlow: boolean;
  /** элементы текста для пороговых твинов (в порядке DOM) */
  tw: HTMLElement[];
  textIn: boolean;
  textOut: boolean;
}
const screens: ScreenDef[] = [];
const themes: string[] = [];
let stageWrap: HTMLElement | null = null;
let active = 0;
let layoutW = 0;
let layoutPortrait = false;
let layoutVh = 0;

function layoutScreens(force = false) {
  const w = window.innerWidth;
  const portrait = window.innerHeight > w;
  // тач: адресная строка меняет только высоту — раскладку не трогаем, иначе прогресс прыгает (§8.7)
  if (!force && COARSE && layoutVh && w === layoutW && portrait === layoutPortrait) return;
  layoutW = w;
  layoutPortrait = portrait;
  layoutVh = window.innerHeight;
  const vh = layoutVh;
  const mobile = w < 900;
  let acc = 0;
  for (const s of screens) {
    if (s.inFlow) continue;
    const durVh = Number((mobile && s.el.dataset.durMobile) || s.el.dataset.dur || 220);
    s.start = acc;
    s.dur = (durVh / 100) * vh;
    acc += s.dur;
  }
  if (stageWrap) stageWrap.style.height = `${acc + vh}px`;
  // экраны в потоке (S8): вход, когда верх секции доходит до низа окна
  for (const s of screens) {
    if (!s.inFlow) continue;
    s.start = s.el.offsetTop - vh;
    s.dur = vh;
  }
}

/** Скролл пишет только цели */
function measureTargets() {
  const vh = layoutVh || window.innerHeight;
  const y = window.scrollY;
  const total = document.documentElement.scrollHeight - vh;
  state.targetProgress = total > 0 ? Math.min(1, Math.max(0, y / total)) : 0;
  for (let i = 0; i < screens.length; i++) {
    const s = screens[i];
    const raw = (y - s.start) / Math.max(s.dur, 1);
    state.targets[i] = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  }
}

/** Мгновенно поставить сглаженные значения в цели (still, ?progress, reduced) */
function snapToTargets() {
  state.screens.set(state.targets);
  state.progress = state.targetProgress;
  active = pickActive(true);
  applyFrame(0);
}

/** Активный экран с гистерезисом: вперёд при > 0.03 следующего, назад при < 0.005 текущего */
function pickActive(instant = false): number {
  const s = state.screens;
  if (instant) {
    let a = 0;
    for (let i = 0; i < screens.length; i++) if (s[i] > 0) a = i;
    return a;
  }
  let a = active;
  while (a + 1 < screens.length && s[a + 1] > 0.03) a++;
  while (a > 0 && s[a] < 0.005) a--;
  return a;
}

const damp = (a: number, b: number, l: number, dt: number) => a + (b - a) * (1 - Math.exp(-l * dt));

/** Единый кадр: сглаживание целей, выбор экрана, CSS-переменные, тема, Rail, текст */
function tick(_time: number, deltaMs: number) {
  const dt = Math.min(0.1, Math.max(0, deltaMs / 1000));
  state.frame.dt = dt;
  state.frame.t = performance.now();
  let moving = false;
  for (let i = 0; i < screens.length; i++) {
    const cur = state.screens[i];
    const target = state.targets[i];
    if (Math.abs(target - cur) < 0.0004) {
      if (cur !== target) state.screens[i] = target;
      continue;
    }
    state.screens[i] = damp(cur, target, LAMBDA, dt);
    moving = true;
  }
  if (Math.abs(state.targetProgress - state.progress) < 0.0004) state.progress = state.targetProgress;
  else state.progress = damp(state.progress, state.targetProgress, LAMBDA, dt);
  const next = pickActive();
  if (next !== active) {
    active = next;
    moving = true;
  }
  if (moving || frameDirty) applyFrame(dt);
}
let frameDirty = true;

function applyFrame(dt: number) {
  frameDirty = false;
  for (let i = 0; i < screens.length; i++) {
    const s = screens[i];
    const local = state.screens[i];
    const enter = i === 0 ? 1 : Math.min(1, local / ENTER_END);
    const exit = Math.max(0, (local - EXIT_START) / (1 - EXIT_START));
    s.el.style.setProperty('--enter', enter.toFixed(4));
    s.el.style.setProperty('--exit', exit.toFixed(4));
    const isActive = i === active || (i === active + 1 && state.screens[active] > EXIT_START && !s.inFlow);
    s.el.classList.toggle('is-active', isActive);
    updateText(s, i, local, dt);
  }
  const prev = document.body.dataset.screen;
  document.body.dataset.screen = String(active);
  state.screen = active;
  if (prev !== String(active)) document.dispatchEvent(new CustomEvent('cm:screenchange', { detail: active }));
  const exitT = Math.max(0, Math.min(1, (state.screens[active] - EXIT_START) / (1 - EXIT_START)));
  syncTheme(themes, active, exitT);
  updateRail(active, state.progress);
  updatePoster();
  const growthIdx = screens.findIndex((x) => x.el.id === 'growth');
  if (growthIdx >= 0) updateGrowth(state.screens[growthIdx], state.reduced);
}

/* ---------- пороговые твины текста (§8.5) ---------- */
function updateText(s: ScreenDef, i: number, local: number, dt: number) {
  // первый экран уходит целиком (pin), остальные — по элементам data-tw
  if (!s.tw.length && !(i === 0 && s.pin)) return;
  const mobile = state.mobile || COARSE;
  const instant = dt === 0 || state.reduced;
  // гистерезис, чтобы не дёргать твины на границе
  const wantIn = i === 0 ? true : s.textIn ? local > TEXT_IN - 0.04 : local >= TEXT_IN;
  const wantOut = s.inFlow ? false : s.textOut ? local > TEXT_OUT - 0.04 : local >= TEXT_OUT;
  if (wantIn !== s.textIn) {
    s.textIn = wantIn;
    if (i === 0) return; // первый экран появляется по времени (initHeroText)
    gsap.killTweensOf(s.tw);
    if (wantIn) {
      gsap.fromTo(s.tw, { autoAlpha: 0, y: mobile ? 0 : 24 }, { autoAlpha: 1, y: 0, duration: instant ? 0 : 0.9, ease: 'expo.out', stagger: instant ? 0 : 0.06, overwrite: true });
    } else {
      gsap.to(s.tw, { autoAlpha: 0, y: mobile ? 0 : 24, duration: instant ? 0 : 0.5, ease: 'power2.out', overwrite: true });
    }
  }
  if (wantOut !== s.textOut) {
    s.textOut = wantOut;
    const targets = i === 0 && s.pin ? [s.pin] : s.tw;
    gsap.killTweensOf(targets);
    if (wantOut) {
      gsap.to(targets, { autoAlpha: 0, y: mobile ? 0 : -18, duration: instant ? 0 : 0.6, ease: 'power2.inOut', overwrite: true });
    } else {
      gsap.to(targets, { autoAlpha: 1, y: 0, duration: instant ? 0 : 0.7, ease: 'expo.out', stagger: instant || i === 0 ? 0 : 0.04, overwrite: true });
    }
  }
}

function currentScreen() {
  return active;
}

/* ---------- скролл ---------- */
function initScroll() {
  const fine = matchMedia('(pointer: fine)').matches;
  if (fine && !state.reduced && !STILL) {
    lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.85, smoothWheel: true, syncTouch: false, autoRaf: true });
    lenis.on('scroll', measureTargets);
    gsap.ticker.lagSmoothing(0);
    (window as unknown as { __cmLenis: Lenis }).__cmLenis = lenis;
    // Страховка: если первый rAF Lenis не сработал (встроенные/скрытые вкладки), запускаем цикл вручную
    const kick = () => {
      const l = lenis as unknown as { time: number; raf: (t: number) => void };
      if (l.time === 0) l.raf(performance.now());
    };
    setTimeout(kick, 800);
    window.addEventListener('load', () => setTimeout(kick, 200), { once: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) setTimeout(kick, 100);
    });
  }
  // нативный скролл (тач, reduced, still) и дубль для Lenis: цели пишутся из любого источника
  window.addEventListener('scroll', measureTargets, { passive: true });
  window.addEventListener(
    'resize',
    () => {
      layoutScreens();
      measureTargets();
      frameDirty = true;
    },
    { passive: true },
  );
  measureTargets();
  if (STILL || state.reduced) {
    snapToTargets();
  } else {
    state.screens.set(state.targets);
    state.progress = state.targetProgress;
    active = pickActive(true);
    applyFrame(0);
  }
  // единый rAF: сглаживание + DOM (сцена читает state в своём кадре)
  gsap.ticker.add(tick);
}

/* ---------- курсор в state ---------- */
function initPointer() {
  const p = state.pointer;
  window.addEventListener(
    'pointermove',
    (e) => {
      p.x = e.clientX;
      p.y = e.clientY;
      p.nx = (e.clientX / window.innerWidth) * 2 - 1;
      p.ny = -((e.clientY / window.innerHeight) * 2 - 1);
      p.active = true;
    },
    { passive: true },
  );
  document.addEventListener('mouseleave', () => (p.active = false));
  if (COARSE) p.active = false;
}

/* ---------- подписи орбит (HTML-лейблы, привязанные к 3D-точкам) ---------- */
function initOrbitLabels() {
  const labels = Array.from(document.querySelectorAll<HTMLElement>('[data-orbit-label]'));
  if (!labels.length) return;
  const targets = labels.map((l) => Number(l.dataset.orbitLabel));
  const loop = () => {
    const hov = state.orbitHover;
    labels.forEach((el, i) => {
      const info = state.orbitLabels[targets[i]];
      if (!info) return;
      const vis = info.visible > 0.5;
      const show = vis && hov === targets[i];
      el.style.transform = `translate3d(${info.x.toFixed(1)}px, ${info.y.toFixed(1)}px, 0)`;
      el.classList.toggle('is-visible', show);
      el.classList.toggle('is-hover', hov === targets[i]);
    });
    document.body.classList.toggle('orbit-hover', hov >= 0 && state.screen === 0);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // клик по орбите → экран направления
  window.addEventListener('click', (e) => {
    if (state.orbitHover < 0 || state.screen !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, textarea, select, label')) return;
    scrollToScreen(state.orbitHover + 1);
  });
  labels.forEach((el, i) => el.addEventListener('click', () => scrollToScreen(targets[i] + 1)));
}

const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Автоскролл к экрану: 1.6 с power2.inOut (Lenis на десктопе, твин window.scrollTo на тач) */
export function scrollToScreen(index: number, hold = true) {
  const s = screens[index];
  if (!s) return;
  const y = s.inFlow ? s.start + s.dur : s.start + (hold ? s.dur * (index === 0 ? 0.25 : 0.4) : 0);
  if (state.reduced) {
    window.scrollTo(0, y);
    return;
  }
  if (lenis) {
    lenis.scrollTo(y, { duration: 1.6, easing: easeInOutQuad });
  } else {
    const from = { y: window.scrollY };
    gsap.to(from, { y, duration: 1.6, ease: 'power2.inOut', overwrite: true, onUpdate: () => window.scrollTo(0, from.y) });
  }
}

/* ---------- текст первого экрана ---------- */
let heroStarted = false;
function initHeroText(delay: number) {
  if (heroStarted) return;
  heroStarted = true;
  const h1 = document.querySelector<HTMLElement>('[data-hero-title]');
  const lead = document.querySelector<HTMLElement>('[data-hero-lead]');
  const ctas = document.querySelectorAll<HTMLElement>('[data-hero-cta] > *');
  const micro = document.querySelectorAll<HTMLElement>('[data-hero-micro]');
  const ticker = document.querySelector<HTMLElement>('[data-hero-ticker]');
  if (!h1) return;

  const tl = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });
  if (state.reduced) {
    gsap.set([h1, lead, ctas, micro, ticker], { autoAlpha: 1, y: 0 });
    return;
  }
  const split = new SplitText(h1, { type: 'lines', linesClass: 'line', mask: 'lines' });
  gsap.set(h1, { autoAlpha: 1 });
  tl.from(split.lines, { yPercent: 110, duration: 1.25, stagger: 0.07 }, 0);
  if (lead) tl.fromTo(lead, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 1.0 }, 0.55);
  if (ctas.length) tl.fromTo(ctas, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.08 }, 0.8);
  if (micro.length) tl.fromTo(micro, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, stagger: 0.05 }, 0.3);
  if (ticker) tl.fromTo(ticker, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.9 }, 1.1);

  if (STILL) {
    const t = T !== null ? Number(T) : 4;
    tl.progress(1).pause();
    tl.seek(Math.max(0, t - delay));
    if (t - delay <= 0) tl.progress(0);
  } else {
    gsap.delayedCall(delay, () => tl.play());
  }
}

/* ---------- постер / фолбэк: статичные постеры экранов с кроссфейдом ---------- */
let posterLayers: HTMLElement[] = [];
let posterCurrent = '';
function showFallback(reason: string) {
  document.body.classList.add('gl-fallback');
  document.body.dataset.glFallback = reason;
  const host = document.querySelector<HTMLElement>('[data-poster]');
  if (!host) return;
  posterLayers = [0, 1].map(() => {
    const l = document.createElement('div');
    l.className = 'gl-poster__layer';
    host.appendChild(l);
    return l;
  });
  updatePoster(true);
}
function updatePoster(force = false) {
  if (!posterLayers.length) return;
  const cur = currentScreen();
  const mobile = window.innerWidth < 900 && window.innerHeight > window.innerWidth;
  const name = `s${cur + 1}${mobile ? '-m' : ''}`;
  if (name === posterCurrent && !force) return;
  posterCurrent = name;
  const on = posterLayers.find((l) => !l.classList.contains('is-on')) || posterLayers[0];
  const off = posterLayers.find((l) => l !== on)!;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  on.style.backgroundImage = `url(${base}/posters/${name}.webp)`;
  on.style.backgroundImage = `image-set(url(${base}/posters/${name}.avif) type("image/avif"), url(${base}/posters/${name}.webp) type("image/webp"))`;
  if (!on.style.backgroundImage) on.style.backgroundImage = `url(${base}/posters/${name}.webp)`;
  on.classList.add('is-on');
  off.classList.remove('is-on');
}

async function loadEngine(canvas: HTMLCanvasElement) {
  try {
    const mod = await import('../webgl/boot');
    engine = mod.boot(canvas, () => {
      document.body.classList.add('gl-ready');
    });
    canvas.dataset.tier = engine.tier.name;
  } catch (err) {
    console.error('[cybermove] WebGL init failed', err);
    showFallback('error');
  }
}

/* ---------- ?progress: поставить страницу в точку ---------- */
function applyProgressParam() {
  if (PROGRESS === null && SCREEN === null) return;
  let y = 0;
  if (SCREEN !== null) {
    // ?screen=2&local=0.4 — точка внутри экрана
    const s = screens[Number(SCREEN)];
    if (!s) return;
    y = Math.round(s.start + s.dur * Math.min(1, Math.max(0, Number(LOCAL ?? 0.4))));
  } else {
    const p = Math.min(1, Math.max(0, Number(PROGRESS)));
    const total = document.documentElement.scrollHeight - window.innerHeight;
    y = Math.round(p * total);
  }
  if (lenis) lenis.scrollTo(y, { immediate: true });
  window.scrollTo(0, y);
  measureTargets();
  snapToTargets();
}

export function initHome() {
  state.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (POSTER) document.body.classList.add('is-poster'); // только канвас — для генерации постеров
  stageWrap = document.querySelector<HTMLElement>('[data-stage-wrap]');
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-screen]'))) {
    const first = screens.length === 0;
    const inFlow = !el.closest('[data-stage]');
    const tw = Array.from(el.querySelectorAll<HTMLElement>('[data-tw]'));
    screens.push({ el, pin: el.querySelector('.screen__pin'), start: 0, dur: 1, inFlow, tw, textIn: first || inFlow, textOut: false });
    // до входа текст скрыт (первый экран и S8 — видимы)
    if (!first && !inFlow && tw.length && !state.reduced) gsap.set(tw, { autoAlpha: 0 });
  }
  layoutScreens(true);
  themes.push(...screens.map((s) => s.el.dataset.theme || 'ivory'));
  initRows();
  initDrawer();
  initAnchors();
  initRail((i) => scrollToScreen(i));
  initPreloader(STILL);
  initForms();
  initAudio();
  const canvas = document.querySelector<HTMLCanvasElement>('#gl');
  // якоря #audit и т.п. → плавный скролл к экрану
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href')!.slice(1);
    const idx = screens.findIndex((s) => s.el.id === id);
    if (idx < 0) return;
    e.preventDefault();
    scrollToScreen(idx);
  });

  initPointer();
  initScroll();
  initOrbitLabels();

  const canGl = canvas && supportsWebGL2() && !state.reduced && !FORCE_FALLBACK;
  if (!canGl) {
    showFallback(state.reduced ? 'reduced-motion' : 'no-webgl2');
    initHeroText(0.2);
  } else {
    // текст появляется синхронно со сборкой ядра (~1.1 с после первого кадра сцены)
    state.events.on('ready', () => initHeroText(1.05));
    const start = () => loadEngine(canvas!);
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', () => setTimeout(start, 60), { once: true });
    // LCP — заголовок: не ждём движок дольше 1.4 с
    setTimeout(() => initHeroText(0), 1400);
  }

  // ?progress — после раскладки
  requestAnimationFrame(() => {
    applyProgressParam();
    setTimeout(applyProgressParam, 300);
  });

  if (HOVER) {
    // отладка: ?hover=<id услуги> — активная строка и реакция сцены
    setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`[data-service="${HOVER}"]`)?.closest<HTMLElement>('[data-row]');
      row?.classList.add('is-active');
      setHover(HOVER);
    }, 400);
  }
  document.body.classList.add('home-ready');
  (window as unknown as { __cmScrollTo: typeof scrollToScreen }).__cmScrollTo = scrollToScreen;
}
