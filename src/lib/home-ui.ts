/**
 * UI главной: строки услуг (hover → сцена, клик → Drawer), Drawer (a11y), HTML-лейблы к 3D-точкам,
 * синхронная интерполяция CSS-переменных темы с переходами фона.
 */
import { state, setHover } from './state';
import { track } from './analytics';

/* ---------- строки услуг ---------- */
export function initRows() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-row]'));
  let activeRow: HTMLElement | null = null;

  const activate = (row: HTMLElement | null) => {
    if (activeRow && activeRow !== row) activeRow.classList.remove('is-active');
    activeRow = row;
    if (row) row.classList.add('is-active');
    setHover(row ? row.querySelector<HTMLElement>('[data-service]')!.dataset.service! : null);
  };

  rows.forEach((row) => {
    const btn = row.querySelector<HTMLButtonElement>('[data-service]')!;
    if (!coarse) {
      row.addEventListener('pointerenter', () => {
        activate(row);
        document.body.classList.add('row-hover');
      });
      row.addEventListener('pointerleave', () => {
        document.body.classList.remove('row-hover');
        if (!state.open) activate(null);
      });
      btn.addEventListener('focus', () => activate(row));
      btn.addEventListener('blur', () => {
        if (!state.open) activate(null);
      });
      btn.addEventListener('click', () => openDrawer(btn.dataset.service!, btn));
    } else {
      // тач: первый тап — активная строка (реакция сцены), второй по той же — Drawer
      btn.addEventListener('click', () => {
        if (activeRow === row) openDrawer(btn.dataset.service!, btn);
        else activate(row);
      });
    }
  });
  // при уходе с экрана — сброс hover (если Drawer закрыт)
  document.addEventListener('cm:screenchange', () => {
    if (!state.open) activate(null);
  });
  document.addEventListener('cm:drawerclose', () => activate(null));
}

/* ---------- Drawer ---------- */
let drawer: HTMLElement | null = null;
let backdrop: HTMLElement | null = null;
let lastFocus: HTMLElement | null = null;

export function openDrawer(serviceId: string, trigger?: HTMLElement) {
  drawer = drawer || document.querySelector<HTMLElement>('[data-drawer]');
  backdrop = backdrop || document.querySelector<HTMLElement>('[data-drawer-backdrop]');
  if (!drawer || !backdrop) return;
  const items = drawer.querySelectorAll<HTMLElement>('[data-drawer-item]');
  let found: HTMLElement | null = null;
  items.forEach((it) => {
    const on = it.dataset.drawerItem === serviceId;
    it.hidden = !on;
    if (on) found = it;
  });
  if (!found) return;
  const crumb = drawer.querySelector<HTMLElement>('[data-drawer-crumb]');
  if (crumb) crumb.textContent = (found as HTMLElement).dataset.drawerCrumbText || '';
  const title = (found as HTMLElement).querySelector<HTMLElement>('[data-drawer-title]');
  if (title) title.id = 'drawer-title';

  lastFocus = trigger || (document.activeElement as HTMLElement);
  drawer.hidden = false;
  backdrop.hidden = false;
  // следующий тик, чтобы сработал transition (без rAF: во встроенных браузерах он может не прийти)
  window.setTimeout(() => {
    document.body.classList.add('drawer-open');
    drawer!.querySelector<HTMLElement>('.drawer__scroll')!.scrollTop = 0;
    drawer!.querySelector<HTMLElement>('[data-drawer-close]')?.focus();
  }, 20);
  document.querySelectorAll<HTMLElement>('[data-service]').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.service === serviceId)));
  state.open = serviceId;
  setHover(serviceId);
  track('service_open', { service: serviceId, page: location.pathname });
}

export function closeDrawer() {
  if (!drawer || drawer.hidden) return;
  document.body.classList.remove('drawer-open');
  document.querySelectorAll<HTMLElement>('[data-service]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  state.open = null;
  setHover(null);
  document.dispatchEvent(new CustomEvent('cm:drawerclose'));
  const d = drawer;
  const b = backdrop;
  window.setTimeout(() => {
    if (!document.body.classList.contains('drawer-open')) {
      d.hidden = true;
      if (b) b.hidden = true;
    }
  }, 600);
  lastFocus?.focus();
}

export function initDrawer() {
  drawer = document.querySelector<HTMLElement>('[data-drawer]');
  backdrop = document.querySelector<HTMLElement>('[data-drawer-backdrop]');
  if (!drawer) return;
  drawer.querySelector('[data-drawer-close]')?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (drawer!.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDrawer();
      return;
    }
    if (e.key === 'Tab') {
      // фокус-ловушка
      const focusables = Array.from(drawer!.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  // открытие по хэшу ?service=id (ссылки со внутренних страниц)
  const q = new URLSearchParams(location.search).get('service');
  if (q) setTimeout(() => openDrawer(q), 800);
}

/* ---------- HTML-лейблы, привязанные к 3D-точкам; вызывается из единого кадра (home.ts) ---------- */
let anchorEls: HTMLElement[] = [];
let contactLayer: HTMLElement | null = null;
let contactClip = '';
let statusEl: HTMLElement | null = null;
let statusText = '';
let figureNow = -1;
export function initAnchors() {
  anchorEls = Array.from(document.querySelectorAll<HTMLElement>('[data-anchor]'));
  contactLayer = document.querySelector<HTMLElement>('[data-anchor-layer="contact"]');
  statusEl = document.querySelector<HTMLElement>('[data-status]');
}
export function updateAnchors() {
  const vh = state.layout.vh || window.innerHeight;
  // слой S8: виден, только когда секция #contact занимает больше 40 % вьюпорта; клип — по прямоугольнику секции;
  // на телефоне анкоров S8 нет вовсе (BRIEF-4 §1.3)
  if (contactLayer) {
    const cTop = state.layout.contactTop;
    const cBottom = cTop + state.layout.contactH;
    const covered = Math.min(vh, cBottom) - Math.max(0, cTop);
    const on = !state.mobile && covered > vh * 0.4;
    const clip = on ? `inset(${Math.max(0, cTop).toFixed(0)}px 0px ${Math.max(0, vh - cBottom).toFixed(0)}px 0px)` : 'inset(0 0 100% 0)';
    if (clip !== contactClip) {
      contactClip = clip;
      contactLayer.style.clipPath = clip;
    }
  }
  // подписи не заходят под шапку и нижнюю строку (кейсы/тикер), на мобильном — только в зоне сферы над текстом
  const top = state.layout.header + 16;
  const bottom = state.mobile ? vh * 0.4 : vh - 72;
  for (const el of anchorEls) {
    const a = state.anchors[el.dataset.anchor!];
    if (!a) continue;
    const edge = Math.min(1, Math.max(0, (a.y - top) / 24)) * Math.min(1, Math.max(0, (bottom - a.y) / 24)) * Math.min(1, Math.max(0, (window.innerWidth - 96 - a.x) / 24)) * Math.min(1, Math.max(0, (a.x - 8) / 16));
    const v = a.visible * edge;
    const vis = v > 0.02;
    if (!vis && el.dataset.hidden === '1') continue;
    el.dataset.hidden = vis ? '0' : '1';
    el.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0)`;
    el.style.opacity = v.toFixed(3);
    el.classList.toggle('is-visible', vis);
    el.classList.toggle('is-hot', a.hot > 0.5);
  }
  if (statusEl && state.status !== statusText) {
    statusText = state.status;
    statusEl.textContent = statusText;
  }
  if (state.figureIndex !== figureNow) {
    figureNow = state.figureIndex;
    document.querySelectorAll<HTMLElement>('[data-figure]').forEach((el) => el.classList.toggle('is-on', Number(el.dataset.figure) === figureNow));
  }
}

/* ---------- синхронная интерполяция темы ---------- */
type ThemeVars = Record<string, string>;
const THEMES: Record<string, ThemeVars> = {
  ivory: { '--fg': '#1b1a18', '--fg-2': '#5a544d', '--fg-3': '#8a8177', '--hair': 'rgba(27,26,24,0.14)', '--hair-strong': 'rgba(27,26,24,0.32)', '--accent': '#1b1a18', '--btn-fill': '#1b1a18', '--btn-fill-fg': '#faf8f4', '--bg': '#f2efe9' },
  sand: { '--fg': '#1b1a18', '--fg-2': '#5a544d', '--fg-3': '#8a8177', '--hair': 'rgba(27,26,24,0.14)', '--hair-strong': 'rgba(27,26,24,0.32)', '--accent': '#1b1a18', '--btn-fill': '#1b1a18', '--btn-fill-fg': '#faf8f4', '--bg': '#e9e4dc' },
  stone: { '--fg': '#1b1a18', '--fg-2': '#5a544d', '--fg-3': '#5a544d', '--hair': 'rgba(27,26,24,0.16)', '--hair-strong': 'rgba(27,26,24,0.36)', '--accent': '#1b1a18', '--btn-fill': '#1b1a18', '--btn-fill-fg': '#faf8f4', '--bg': '#ddd7ce' },
  clay: { '--fg': '#1b1a18', '--fg-2': '#4a453f', '--fg-3': '#5a544d', '--hair': 'rgba(27,26,24,0.18)', '--hair-strong': 'rgba(27,26,24,0.4)', '--accent': '#1b1a18', '--btn-fill': '#1b1a18', '--btn-fill-fg': '#faf8f4', '--bg': '#cfc7bb' },
};

function parseColor(c: string): [number, number, number, number] {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return [0, 0, 0, 1];
  const p = m[1].split(',').map((x) => parseFloat(x));
  return [p[0], p[1], p[2], p[3] ?? 1];
}
function mixColor(a: string, b: string, t: number) {
  const A = parseColor(a);
  const B = parseColor(b);
  const r = A.map((v, i) => v + (B[i] - v) * t);
  return `rgba(${r[0].toFixed(0)},${r[1].toFixed(0)},${r[2].toFixed(0)},${r[3].toFixed(3)})`;
}

let lastKey = '';
/** Вызывается из measure(): тема = тема активного экрана, в фазе выхода смешивается со следующей */
export function syncTheme(themes: string[], active: number, exitT: number) {
  const a = THEMES[themes[active]] || THEMES.ivory;
  const b = THEMES[themes[Math.min(active + 1, themes.length - 1)]] || a;
  const t = a === b ? 0 : exitT;
  const key = `${themes[active]}|${themes[active + 1]}|${t.toFixed(2)}`;
  if (key === lastKey) return;
  lastKey = key;
  const root = document.documentElement.style;
  for (const k of Object.keys(a)) root.setProperty(k, t <= 0 ? a[k] : t >= 1 ? b[k] : mixColor(a[k], b[k], t));
  document.documentElement.dataset.themeNow = t < 0.5 ? themes[active] : themes[active + 1] || themes[active];
}
