/**
 * Дополнительная логика главной: счётчики S7 (по времени, BRIEF-3 §5), лента кейсов S7 (по сглаженному
 * скроллу, размеры меряются только в layout), Rail (прогресс, клики, клавиатура), прелоадер (≤ 1.5 с).
 */
import gsap from 'gsap';
import { state, SCREEN_IDS } from './state';

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/* ---------- S7: счётчики идут по времени при входе на экран: 1.4 с, power3.out ---------- */
let counterEls: HTMLElement[] | null = null;
export function runCounters(duration: number) {
  if (!counterEls) counterEls = Array.from(document.querySelectorAll<HTMLElement>('[data-count]'));
  for (const el of counterEls) {
    const target = Number(el.dataset.count || 0);
    const obj = { v: 0 };
    gsap.killTweensOf(obj);
    if (duration <= 0) {
      el.textContent = String(target);
      continue;
    }
    el.textContent = '0';
    gsap.to(obj, {
      v: target,
      duration,
      ease: 'power3.out',
      onUpdate: () => {
        const s = String(Math.round(obj.v));
        if (el.textContent !== s) el.textContent = s;
      },
    });
  }
}

/* ---------- S7: лента кейсов и сдвиг блока; размеры меряются только в layoutScreens (BRIEF-3 §7.4) ---------- */
let ribbonEl: HTMLElement | null = null;
let ribbonMax = 0;
let ribbonX = 1e9;
let growthEl: HTMLElement | null = null;
/** на сколько содержимое S7 выше пина (телефон с короткой высотой) и максимум сдвига */
let growthOverflow = 0;
let growthY = 1e9;
export function measureRibbon() {
  ribbonEl = document.querySelector<HTMLElement>('[data-ribbon]');
  growthEl = document.querySelector<HTMLElement>('[data-growth]');
  if (growthEl) {
    growthEl.style.transform = '';
    // BRIEF-4 §1.1: если содержимое выше пина — во второй половине экрана блок уезжает вверх, но не больше 40 vh
    growthOverflow = Math.min(Math.max(0, growthEl.scrollHeight - growthEl.clientHeight), window.innerHeight * 0.4);
    growthY = 1e9;
  }
  if (!ribbonEl) return;
  const wrap = ribbonEl.parentElement as HTMLElement;
  ribbonMax = Math.max(0, ribbonEl.scrollWidth - wrap.clientWidth + 48);
  ribbonX = 1e9;
}
export function updateRibbon(local: number, reduced: boolean) {
  if (ribbonEl) {
    // на входе лента стоит на нуле: первая карточка видна целиком (BRIEF-4 §1.1)
    const t = reduced ? 0 : smooth((local - 0.45) / 0.45);
    const x = -ribbonMax * t;
    if (Math.abs(x - ribbonX) >= 0.5) {
      ribbonX = x;
      ribbonEl.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
    }
  }
  if (growthEl && growthOverflow > 1) {
    const y = -growthOverflow * (reduced ? 1 : smooth((local - 0.45) / 0.35));
    if (Math.abs(y - growthY) >= 0.5) {
      growthY = y;
      growthEl.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    }
  }
}

/* ---------- Rail ---------- */
const STAGE_OF_SCREEN = ['CHAOS', 'CORE', 'SYSTEM', 'SYSTEM', 'SYSTEM', 'SYSTEM', 'GROWTH', 'GROWTH'];

export function initRail(scrollTo: (i: number) => void) {
  const rail = document.querySelector<HTMLElement>('[data-rail]');
  if (!rail) return;
  const btns = Array.from(rail.querySelectorAll<HTMLButtonElement>('[data-rail-go]'));
  btns.forEach((b) => b.addEventListener('click', () => scrollTo(Number(b.dataset.railGo))));
  rail.addEventListener('keydown', (e) => {
    const idx = btns.findIndex((b) => b === document.activeElement);
    if (idx < 0) return;
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = Math.min(btns.length - 1, idx + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = Math.max(0, idx - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = btns.length - 1;
    if (next >= 0) {
      e.preventDefault();
      btns[next].focus();
      scrollTo(next);
    }
  });
}

export function updateRail(active: number, progress: number) {
  const rail = document.querySelector<HTMLElement>('[data-rail]');
  if (!rail) return;
  const bar = rail.querySelector<HTMLElement>('[data-rail-progress]');
  const n = SCREEN_IDS.length;
  // прогресс по шкале: позиция активного экрана + локальный прогресс внутри него
  const local = state.screens[active] ?? 0;
  const p = Math.min(1, (active + Math.min(local, 0.999)) / (n - 1));
  if (bar) {
    if (matchMedia('(max-width: 899px), (max-height: 560px)').matches) bar.style.width = `${(progress * 100).toFixed(2)}%`;
    else bar.style.height = `${(p * 100).toFixed(2)}%`;
  }
  rail.querySelectorAll<HTMLButtonElement>('[data-rail-go]').forEach((b, i) => {
    if (i === active) b.setAttribute('aria-current', 'step');
    else b.removeAttribute('aria-current');
  });
  const stage = STAGE_OF_SCREEN[active];
  rail.querySelectorAll<HTMLElement>('[data-rail-stage]').forEach((el) => el.classList.toggle('is-active', el.dataset.railStage === stage));
}

/* ---------- Прелоадер ---------- */
export function initPreloader(still: boolean) {
  const el = document.querySelector<HTMLElement>('[data-preloader]');
  if (!el) return;
  const count = el.querySelector<HTMLElement>('[data-preloader-count]');
  const bar = el.querySelector<HTMLElement>('[data-preloader-bar]');
  const start = performance.now();
  const MAX = 1500;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (count) count.textContent = '100';
    if (bar) bar.style.width = '100%';
    window.setTimeout(() => el.classList.add('is-done'), 120);
    document.body.classList.add('loaded');
  };
  if (new URLSearchParams(location.search).has('preloader')) {
    // отладка: заморозить прелоадер на 62 %
    if (count) count.textContent = '62';
    if (bar) bar.style.width = '62%';
    return;
  }
  if (still || state.reduced) {
    finish();
    return;
  }
  const tick = () => {
    if (done) return;
    const t = Math.min(1, (performance.now() - start) / MAX);
    // счётчик идёт быстро в начале и притормаживает к концу, но всегда завершается к MAX
    const v = Math.round(100 * (1 - Math.pow(1 - t, 2.2)));
    if (count) count.textContent = String(v).padStart(2, '0');
    if (bar) bar.style.width = `${v}%`;
    if (t >= 1) finish();
    else window.setTimeout(tick, 33);
  };
  tick();
  // если сцена готова раньше — завершаем раньше, но не быстрее 500 мс
  state.events.on('ready', () => {
    const elapsed = performance.now() - start;
    window.setTimeout(finish, Math.max(0, 500 - elapsed));
  });
}
