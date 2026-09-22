/**
 * Сценарий главной (BRIEF-3 §6–7): «время решает, скролл выбирает».
 * Один цикл (gsap.ticker): lenis.raf → цели из скролла → сглаживание с лимитом скорости и очередью экранов →
 * DOM (только изменившееся) → engine.frame(). Дискретные события (текст, счётчики, сцены) идут по времени
 * при смене фазы экрана; непрерывные величины читают сглаженный прогресс. Snap нет; автоскролл 1.8 с.
 */
import gsap from 'gsap';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { state, setHover } from './state';
import { initRows, initDrawer, initAnchors, updateAnchors } from './home-ui';
import { runCounters, measureRibbon, updateRibbon, initRail, updateRail, initPreloader } from './home-extra';
import { initForms } from './form';
import { initAudio } from './audio';
import type { Engine } from '../webgl/boot';

const q = new URLSearchParams(location.search);
const STILL = q.has('still');
const FORCE_FALLBACK = q.has('nogl');
const PROGRESS = q.get('progress');
const SCREEN = q.get('screen');
const LOCAL = q.get('local');
const T = q.get('t');
const HOVER = q.get('hover');
const POSTER = q.has('poster');
const STATS = q.has('stats');

/** Фазы экрана (BRIEF-3 §6): вход [0, 0.3), удержание [0.3, 0.7), выход [0.7, 1]; текст: вход 0.08, выход 0.78 */
export const ENTER_END = 0.3;
export const EXIT_START = 0.7;
const TEXT_IN = 0.08;
const TEXT_OUT = 0.78;
const COARSE = matchMedia('(pointer: coarse)').matches;
/**
 * Сглаживание λ и лимит скорости (единиц прогресса экрана в секунду): переход (выход 0.3 + вход 0.3) занимает
 * не меньше 0.6 / 0.42 ≈ 1.4 с при любой резкости прокрутки, а Δ прогресса за кадр 60 fps не выходит за 0.008
 * (критерий §6.7c). Очередь экранов (см. smoothStep) делает флик через два экрана двумя переходами подряд.
 */
const LAMBDA = COARSE ? 4.5 : 7;
const VMAX = COARSE ? 0.35 : 0.42;
/** гистерезис смены активного экрана */
const HYST = COARSE ? 0.06 : 0.03;

type Phase = 'enter' | 'hold' | 'exit';
const phaseOf = (l: number): Phase => (l < ENTER_END ? 'enter' : l < EXIT_START ? 'hold' : 'exit');

let engine: Engine | null = null;
let lenis: Lenis | null = null;
let autoScrolling = false;
let autoTimer = 0;
let engineDone = false;

function supportsWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2', { failIfMajorPerformanceCaveat: false }));
  } catch {
    return false;
  }
}

/* ---------- экраны ---------- */
interface ScreenDef {
  el: HTMLElement;
  pin: HTMLElement | null;
  start: number;
  dur: number;
  inFlow: boolean;
  tw: HTMLElement[];
  textIn: boolean;
  textOut: boolean;
  enterVar: number;
  exitVar: number;
  active: boolean;
  theme: string;
}
const screens: ScreenDef[] = [];
/** секции в потоке после стейджа со своей темой (блок «О компании», S8, футер): верх и тема для шапки */
const flowBands: Array<{ top: number; theme: string }> = [];
let stageWrap: HTMLElement | null = null;
let growthIdx = -1;
let active = 0;
let activePhase: Phase | null = null;
let layoutW = 0;
let layoutPortrait = false;
let layoutVh = 0;
let themeNow = '';
let railKey = '';
let scrollYNow = 0;
let countersRan = false;
let pastStage = false;
let rushFwd = false;
let rushBack = false;

function layoutScreens(force = false) {
  const w = window.innerWidth;
  const portrait = window.innerHeight > w;
  // тач: адресная строка меняет только высоту — раскладку не трогаем (§7.4: без layout-чтений в кадре)
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
  // BRIEF-4 §1.4: хвост стейджа 0.4 vh (сфера доигрывает состояние S7), дальше сразу «О компании»
  if (stageWrap) stageWrap.style.height = `${acc + vh * 0.4}px`;
  for (const s of screens) {
    if (!s.inFlow) continue;
    s.start = s.el.offsetTop - vh;
    s.dur = vh;
  }
  // секции после стейджа (блок «О компании», S8, футер); шапка, меню и drawer — фиксированные, их не считаем
  flowBands.length = 0;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('section[data-theme], section[data-theme-band], footer[data-theme]'))) {
    if (el.closest('[data-stage]') || el.offsetTop < acc) continue;
    flowBands.push({ top: el.offsetTop, theme: el.dataset.themeBand || el.dataset.theme || 'ivory' });
  }
  flowBands.sort((a, b) => a.top - b.top);
  // геометрия для сцены S8 и масок шапки/футера: меряем только здесь, в кадре — арифметика (BRIEF-3 §7.4)
  // абсолютные координаты в документе: offsetTop у футера считается от пина, поэтому берём rect + scrollY
  const y0 = window.scrollY;
  const contact = document.querySelector<HTMLElement>('[data-screen="contact"]');
  const footer = document.querySelector<HTMLElement>('.footer');
  const cRect = contact?.getBoundingClientRect();
  const fRect = footer?.getBoundingClientRect();
  contactTop = cRect ? cRect.top + y0 : 1e6;
  contactH = cRect ? cRect.height : 0;
  footerTop = fRect ? fRect.top + y0 : 1e6;
  stageEnd = acc + vh * 0.4;
  state.layout.header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72;
  state.layout.vh = vh;
  measureRibbon();
  totalScroll = document.documentElement.scrollHeight - vh;
}
let contactTop = 1e6;
let contactH = 0;
let footerTop = 1e6;
let stageEnd = 0;
let totalScroll = 1;

/** Скролл пишет только цели */
function measureTargets() {
  const y = window.scrollY;
  scrollYNow = y;
  state.layout.contactTop = contactTop - y;
  state.layout.contactH = contactH;
  state.layout.footerTop = footerTop - y;
  state.targetProgress = totalScroll > 0 ? Math.min(1, Math.max(0, y / totalScroll)) : 0;
  for (let i = 0; i < screens.length; i++) {
    const s = screens[i];
    const raw = (y - s.start) / Math.max(s.dur, 1);
    state.targets[i] = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  }
}

function snapToTargets() {
  state.screens.set(state.targets);
  state.progress = state.targetProgress;
  active = pickActive(true);
  applyFrame(0, true);
}

function pickActive(instant = false): number {
  const s = state.screens;
  if (instant) {
    let a = 0;
    for (let i = 0; i < screens.length; i++) if (s[i] > 0) a = i;
    return a;
  }
  let a = active;
  while (a + 1 < screens.length && s[a + 1] > HYST) a++;
  while (a > 0 && s[a] < HYST * 0.15) a--;
  return a;
}

/**
 * Сглаживание с лимитом скорости и очередью экранов (BRIEF-3 §6.2, §6.5): двигается активный экран;
 * следующие ждут, пока он дойдёт до 1, предыдущие — пока он вернётся к 0. Так флик через два экрана
 * даёт два последовательных перехода, а не один прыжок. Во время автоскролла лимит не действует.
 */
function smoothStep(dt: number): boolean {
  const s = state.screens;
  const t = state.targets;
  let moving = false;
  // BRIEF-4 §1.5: при прыжке дальше соседнего экрана промежуточные пролистываются почти мгновенно, а последний
  // доезжает с обычным лимитом на последних 0.3 прогресса — суммарное отставание от скролла ≤ 1.6 с.
  // (В брифе предложено ×3, но при пяти экранах это 4+ с — держим измеримое требование, а не множитель.)
  let far = 0;
  for (let i = 0; i < screens.length; i++) if (t[i] > 0.001 && i > far) far = i;
  let near = screens.length - 1;
  for (let i = screens.length - 1; i >= 0; i--) if (t[i] < 0.999 && i < near) near = i;
  // прыжок через два экрана и больше: режим догона включается и держится, пока промежуточные не пролистаются
  // (флик через два экрана остаётся двумя честными переходами — BRIEF-3 §6.5)
  if (far > active + 2) rushFwd = true;
  if (near < active - 2) rushBack = true;
  if (rushFwd && s[far] >= t[far] - 0.3) rushFwd = false;
  if (rushBack && s[near] <= t[near] + 0.3) rushBack = false;
  const forward = rushFwd;
  const backward = rushBack;
  for (let i = 0; i < screens.length; i++) {
    const cur = s[i];
    let target = t[i];
    // очередь: экран i входит, только когда все экраны между активным и им дошли до 1; возвращается, когда все после него ушли в 0
    if (i > active) {
      for (let j = active; j < i; j++) {
        if (s[j] < 0.985) {
          target = Math.min(target, cur);
          break;
        }
      }
    } else if (i < active) {
      for (let j = i + 1; j <= active; j++) {
        if (s[j] > 0.015) {
          target = Math.max(target, cur);
          break;
        }
      }
    }
    // в режиме догона летят все экраны до целевого включительно, пока до цели больше 0.3; последние 0.3 — обычный ход
    const rush = (forward && i <= far && cur < target - 0.3) || (forward && i < far) || (backward && i >= near && cur > target + 0.3) || (backward && i > near);
    if (Math.abs(target - cur) < (rush ? 0.02 : 0.0004)) {
      if (cur !== target) s[i] = target;
      continue;
    }
    let step = (target - cur) * (1 - Math.exp(-LAMBDA * dt));
    const limit = autoScrolling ? Infinity : VMAX * (rush ? 16 : 1) * dt;
    if (rush) step = target - cur;
    if (Math.abs(step) > limit) step = Math.sign(step) * limit;
    s[i] = cur + step;
    moving = true;
  }
  // за пределами стейджа прогресс экранов не «доигрывает» под потоковыми секциями (BRIEF-4 §1.5)
  const past = scrollYNow > stageEnd - layoutVh * 0.2;
  const before = scrollYNow < screens[0].start;
  if (past !== pastStage) {
    pastStage = past;
    document.body.classList.toggle('past-stage', past);
  }
  if (past || before) {
    const v = past ? 1 : 0;
    for (let i = 0; i < screens.length; i++) {
      if (screens[i].inFlow) continue;
      if (s[i] !== v) {
        s[i] = v;
        moving = true;
      }
    }
  }
  if (Math.abs(state.targetProgress - state.progress) < 0.0004) state.progress = state.targetProgress;
  else state.progress += (state.targetProgress - state.progress) * (1 - Math.exp(-LAMBDA * dt));
  return moving;
}

/* ---------- единый кадр ---------- */
let frameDirty = true;
let fpsCount = 0;
let fpsAt = 0;
let fpsNow = 0;
let statsEl: HTMLElement | null = null;

function tick(_time: number, deltaMs: number) {
  const now = performance.now();
  const dt = Math.min(0.1, Math.max(0, deltaMs / 1000));
  state.frame.dt = dt;
  state.frame.t = now;
  if (lenis) lenis.raf(now);
  const moving = smoothStep(dt);
  const next = pickActive();
  if (next !== active) {
    active = next;
    frameDirty = true;
  }
  if (moving || frameDirty) applyFrame(dt, false);
  updateAnchors();
  if (engine && !engineDone) {
    if (!engine.frame(now)) engineDone = true;
  }
  fpsCount++;
  if (now - fpsAt >= 500) {
    fpsNow = Math.round((fpsCount * 1000) / (now - fpsAt));
    fpsCount = 0;
    fpsAt = now;
    if (statsEl) {
      const e = engine;
      statsEl.textContent = `${fpsNow} FPS · ${e ? e.stats.frameMs.toFixed(1) : '—'} MS · ${e ? e.tier.name.toUpperCase() : 'NO GL'} · DPR ${(e ? e.renderer.getPixelRatio() : window.devicePixelRatio).toFixed(2)} · CALLS ${e ? e.stats.calls : 0} · S${active + 1} ${state.screens[active].toFixed(2)}`;
    }
  }
}

function applyFrame(dt: number, instant: boolean) {
  frameDirty = false;
  const localA = state.screens[active];
  const phase = phaseOf(localA);
  for (let i = 0; i < screens.length; i++) {
    const s = screens[i];
    const local = state.screens[i];
    const near = i === active || i === active + 1 || i === active - 1;
    // --enter/--exit пишем только активному и соседям и только при изменении > 0.004 (§6.4)
    if (near) {
      const enter = i === 0 ? 1 : Math.min(1, local / ENTER_END);
      const exit = Math.max(0, (local - EXIT_START) / (1 - EXIT_START));
      if (Math.abs(enter - s.enterVar) > 0.004 || instant) {
        s.enterVar = enter;
        s.el.style.setProperty('--enter', enter.toFixed(3));
      }
      if (Math.abs(exit - s.exitVar) > 0.004 || instant) {
        s.exitVar = exit;
        s.el.style.setProperty('--exit', exit.toFixed(3));
      }
    }
    const isActive = i === active || (i === active + 1 && localA > EXIT_START && !s.inFlow);
    if (isActive !== s.active) {
      s.active = isActive;
      s.el.classList.toggle('is-active', isActive);
    }
    updateText(s, i, local, dt);
  }
  // смена экрана и фазы активного экрана: дискретные события по времени (счётчики S7, cm:phase)
  const prev = document.body.dataset.screen;
  const cur = String(active);
  if (prev !== cur) {
    document.body.dataset.screen = cur;
    state.screen = active;
    document.dispatchEvent(new CustomEvent('cm:screenchange', { detail: active }));
  }
  if (phase !== activePhase || prev !== cur) {
    activePhase = phase;
    document.dispatchEvent(new CustomEvent('cm:phase', { detail: { screen: active, phase } }));
    if (active === growthIdx && (phase === 'enter' || !countersRan)) {
      countersRan = true;
      runCounters(instant || state.reduced ? 0 : 1.4);
    }
  }
  state.screen = active;
  if (growthIdx >= 0) updateRibbon(state.screens[growthIdx], state.reduced);
  // тема по порогу (§6.4): за серединой выхода — тема следующего экрана; после стейджа — тема секции под шапкой;
  // CSS transition 900 мс делает переход
  const nextScreen = screens[active + 1];
  let nextTheme = localA > 0.85 && nextScreen && !nextScreen.inFlow ? nextScreen.theme : screens[active].theme;
  const headY = scrollYNow + 64;
  for (const b of flowBands) if (headY >= b.top) nextTheme = b.theme;
  if (nextTheme !== themeNow) {
    themeNow = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.dataset.themeNow = nextTheme;
  }
  const rk = `${active}|${state.progress.toFixed(3)}|${localA.toFixed(2)}`;
  if (rk !== railKey) {
    railKey = rk;
    updateRail(active, state.progress);
  }
  updatePoster();
}

/* ---------- пороговые твины текста ---------- */
function updateText(s: ScreenDef, i: number, local: number, dt: number) {
  if (!s.tw.length && !(i === 0 && s.pin)) return;
  const mobile = state.mobile || COARSE;
  const instant = dt === 0 || state.reduced;
  const wantIn = i === 0 ? true : s.textIn ? local > TEXT_IN - 0.04 : local >= TEXT_IN;
  const wantOut = s.inFlow ? false : s.textOut ? local > TEXT_OUT - 0.04 : local >= TEXT_OUT;
  if (wantIn !== s.textIn) {
    s.textIn = wantIn;
    if (i !== 0) {
      gsap.killTweensOf(s.tw);
      if (wantIn) gsap.fromTo(s.tw, { autoAlpha: 0, y: mobile ? 0 : 24 }, { autoAlpha: 1, y: 0, duration: instant ? 0 : 0.9, ease: 'expo.out', stagger: instant ? 0 : 0.06, overwrite: true });
      else gsap.to(s.tw, { autoAlpha: 0, y: mobile ? 0 : 24, duration: instant ? 0 : 0.5, ease: 'power2.out', overwrite: true });
    }
  }
  if (wantOut !== s.textOut) {
    s.textOut = wantOut;
    const targets = i === 0 && s.pin ? [s.pin] : s.tw;
    gsap.killTweensOf(targets);
    if (wantOut) gsap.to(targets, { autoAlpha: 0, y: mobile ? 0 : -18, duration: instant ? 0 : 0.6, ease: 'power2.inOut', overwrite: true });
    else gsap.to(targets, { autoAlpha: 1, y: 0, duration: instant ? 0 : 0.7, ease: 'expo.out', stagger: instant || i === 0 ? 0 : 0.04, overwrite: true });
  }
}

/* ---------- скролл ---------- */
function initScroll() {
  const fine = matchMedia('(pointer: fine)').matches;
  if (fine && !state.reduced && !STILL) {
    lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.85, smoothWheel: true, syncTouch: false, autoRaf: false });
    lenis.on('scroll', measureTargets);
    (window as unknown as { __cmLenis: Lenis }).__cmLenis = lenis;
  }
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
  snapToTargets();
  gsap.ticker.lagSmoothing(0);
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

/* ---------- орбиты-ссылки: hover (курсор) и клик → экран направления ---------- */
function initOrbitLinks() {
  let was = false;
  document.addEventListener('cm:screenchange', () => document.body.classList.toggle('orbit-hover', false));
  gsap.ticker.add(() => {
    const on = state.orbitHover >= 0 && state.screen === 0;
    if (on !== was) {
      was = on;
      document.body.classList.toggle('orbit-hover', on);
    }
  });
  window.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest<HTMLElement>('[data-orbit-link]');
    if (link) {
      scrollToScreen(Number(link.dataset.orbitLink));
      return;
    }
    if (state.orbitHover < 0 || state.screen !== 0) return;
    if (target.closest('a, button, input, textarea, select, label')) return;
    scrollToScreen(state.orbitHover + 1);
  });
}

const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Автоскролл к экрану: 1.8 с power2.inOut, лимит скорости на это время не действует (§6.6) */
export function scrollToScreen(index: number, hold = true) {
  const s = screens[index];
  if (!s) return;
  const y = s.inFlow ? s.start + s.dur : s.start + (hold ? s.dur * (index === 0 ? 0.3 : 0.45) : 0);
  if (state.reduced) {
    window.scrollTo(0, y);
    return;
  }
  autoScrolling = true;
  clearTimeout(autoTimer);
  autoTimer = window.setTimeout(() => (autoScrolling = false), 2000);
  if (lenis) lenis.scrollTo(y, { duration: 1.8, easing: easeInOutQuad, onComplete: () => (autoScrolling = false) });
  else {
    const from = { y: window.scrollY };
    gsap.to(from, { y, duration: 1.8, ease: 'power2.inOut', overwrite: true, onUpdate: () => window.scrollTo(0, from.y), onComplete: () => (autoScrolling = false) });
  }
}

/* ---------- текст первого экрана: уже на месте (BRIEF-3 §5), короткое проявление ---------- */
let heroStarted = false;
function initHeroText() {
  if (heroStarted) return;
  heroStarted = true;
  const h1 = document.querySelector<HTMLElement>('[data-hero-title]');
  const rest = document.querySelectorAll<HTMLElement>('[data-hero-lead], [data-hero-cta] > *, [data-hero-micro], [data-hero-ticker]');
  if (!h1) return;
  if (state.reduced || STILL) {
    gsap.set([h1, rest], { autoAlpha: 1, y: 0 });
    return;
  }
  gsap.set(h1, { autoAlpha: 1 });
  gsap.fromTo(h1, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.7, ease: 'power2.out' });
  gsap.fromTo(rest, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.7, ease: 'power2.out', stagger: 0.04, delay: 0.15 });
}

/* ---------- постер / фолбэк ---------- */
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
  const mobile = layoutW < 900 && layoutPortrait;
  const name = `s${active + 1}${mobile ? '-m' : ''}`;
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
    // кадры рисует единый тикер страницы (tick), собственный rAF движка не запускаем
    engine = mod.create(canvas, () => document.body.classList.add('gl-ready'));
    canvas.dataset.tier = engine.tier.name;
  } catch (err) {
    console.error('[cybermove] WebGL init failed', err);
    showFallback('error');
  }
}

/* ---------- ?progress / ?screen: поставить страницу в точку ---------- */
function applyProgressParam() {
  if (PROGRESS === null && SCREEN === null) return;
  let y = 0;
  if (SCREEN !== null) {
    const s = screens[Number(SCREEN)];
    if (!s) return;
    y = Math.round(s.start + s.dur * Math.min(1, Math.max(0, Number(LOCAL ?? 0.45))));
  } else {
    y = Math.round(Math.min(1, Math.max(0, Number(PROGRESS))) * totalScroll);
  }
  if (lenis) lenis.scrollTo(y, { immediate: true });
  window.scrollTo(0, y);
  measureTargets();
  snapToTargets();
}

export function initHome() {
  state.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (POSTER) document.body.classList.add('is-poster');
  stageWrap = document.querySelector<HTMLElement>('[data-stage-wrap]');
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-screen]'))) {
    const first = screens.length === 0;
    const inFlow = !el.closest('[data-stage]');
    const tw = Array.from(el.querySelectorAll<HTMLElement>('[data-tw]'));
    screens.push({ el, pin: el.querySelector('.screen__pin'), start: 0, dur: 1, inFlow, tw, textIn: first || inFlow, textOut: false, enterVar: -1, exitVar: -1, active: false, theme: el.dataset.themeBand || el.dataset.theme || 'ivory' });
    if (!first && !inFlow && tw.length && !state.reduced) gsap.set(tw, { autoAlpha: 0 });
  }
  growthIdx = screens.findIndex((s) => s.el.id === 'growth');
  layoutScreens(true);
  initRows();
  initDrawer();
  initAnchors();
  initRail((i) => scrollToScreen(i));
  initPreloader(STILL);
  initForms();
  initAudio();
  if (STATS) {
    statsEl = document.createElement('p');
    statsEl.className = 'stats t-micro';
    document.body.appendChild(statsEl);
  }
  const canvas = document.querySelector<HTMLCanvasElement>('#gl');
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
  initOrbitLinks();

  const canGl = canvas && supportsWebGL2() && !state.reduced && !FORCE_FALLBACK;
  if (!canGl) {
    showFallback(state.reduced ? 'reduced-motion' : 'no-webgl2');
    initHeroText();
  } else {
    initHeroText();
    const start = () => loadEngine(canvas!);
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', () => setTimeout(start, 60), { once: true });
  }

  requestAnimationFrame(() => {
    applyProgressParam();
    setTimeout(applyProgressParam, 300);
  });

  if (HOVER) {
    setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`[data-service="${HOVER}"]`)?.closest<HTMLElement>('[data-row]');
      row?.classList.add('is-active');
      setHover(HOVER);
    }, 400);
  }
  document.body.classList.add('home-ready');
  (window as unknown as { __cmScrollTo: typeof scrollToScreen }).__cmScrollTo = scrollToScreen;
}
