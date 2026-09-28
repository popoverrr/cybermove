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

/* ---------- S7: сдвиг блока внутри pin; размеры меряются только в layoutScreens (BRIEF-3 §7.4) ---------- */
let growthEl: HTMLElement | null = null;
/** на сколько содержимое S7 выше пина (заголовок, карточки, счётчики, ссылка) */
let growthOverflow = 0;
let growthY = 1e9;
/**
 * BRIEF-7 §2: если содержимое S7 выше экрана, оно доезжает вверх в фазе удержания (local 0.35 → 0.65), до выхода текста.
 * Точки покоя снапа у S7 — начало и конец этого доезда (GROWTH_REST), иначе одна — удержание 0.45.
 */
export const GROWTH_SLIDE: [number, number] = [0.35, 0.65];
export function growthRests(): number[] {
  return growthOverflow > 24 ? [GROWTH_SLIDE[0] - 0.01, GROWTH_SLIDE[1] + 0.01] : [0.45];
}
export function measureRibbon() {
  growthEl = document.querySelector<HTMLElement>('[data-growth]');
  if (growthEl) {
    growthEl.style.transform = '';
    const pin = growthEl.parentElement as HTMLElement;
    growthOverflow = Math.max(0, growthEl.offsetHeight - pin.clientHeight);
    growthY = 1e9;
  }
}
export function updateRibbon(local: number, reduced: boolean) {
  if (growthEl && growthOverflow > 1) {
    const [a, b] = GROWTH_SLIDE;
    const k = reduced ? (local >= (a + b) / 2 ? 1 : 0) : smooth((local - a) / (b - a));
    const y = -growthOverflow * k;
    if (Math.abs(y - growthY) >= 0.5) {
      growthY = y;
      growthEl.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    }
  }
}

/**
 * BRIEF-7 §2: лента кейсов S7 — нативная горизонтальная прокрутка со снапом карточек (свайп, трекпад),
 * перетаскивание мышью, кнопки и индикатор «последняя видимая / всего». Вертикальное колесо листает экраны.
 */
export function initRibbon() {
  const ribbon = document.querySelector<HTMLElement>('[data-ribbon]');
  if (!ribbon) return;
  const items = Array.from(ribbon.querySelectorAll<HTMLElement>('[data-ribbon-item]'));
  const pos = document.querySelector<HTMLElement>('[data-ribbon-pos]');
  const prev = document.querySelector<HTMLButtonElement>('[data-ribbon-prev]');
  const next = document.querySelector<HTMLButtonElement>('[data-ribbon-next]');
  const step = () => (items[1] ? items[1].offsetLeft - items[0].offsetLeft : ribbon.clientWidth);
  const update = () => {
    const edge = ribbon.scrollLeft + ribbon.clientWidth + 2;
    let last = 0;
    items.forEach((it, i) => {
      if (it.offsetLeft - items[0].offsetLeft + it.offsetWidth <= edge) last = i + 1;
    });
    if (pos) pos.textContent = String(Math.max(1, last)).padStart(2, '0');
    if (prev) prev.disabled = ribbon.scrollLeft <= 2;
    if (next) next.disabled = ribbon.scrollLeft + ribbon.clientWidth >= ribbon.scrollWidth - 2;
  };
  prev?.addEventListener('click', () => ribbon.scrollBy({ left: -step(), behavior: 'smooth' }));
  next?.addEventListener('click', () => ribbon.scrollBy({ left: step(), behavior: 'smooth' }));
  ribbon.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();

  // перетаскивание мышью (на таче работает нативная прокрутка)
  let down = false;
  let moved = 0;
  let x0 = 0;
  let s0 = 0;
  ribbon.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true;
    moved = 0;
    x0 = e.clientX;
    s0 = ribbon.scrollLeft;
  });
  window.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - x0;
    moved = Math.max(moved, Math.abs(dx));
    if (moved > 4) {
      ribbon.classList.add('is-dragging');
      ribbon.scrollLeft = s0 - dx;
    }
  });
  const up = () => {
    if (!down) return;
    down = false;
    if (ribbon.classList.contains('is-dragging')) {
      ribbon.classList.remove('is-dragging');
      // доводка до ближайшей карточки
      const w = step();
      ribbon.scrollTo({ left: Math.round(ribbon.scrollLeft / w) * w, behavior: 'smooth' });
    }
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  // клик после перетаскивания не открывает кейс
  ribbon.addEventListener(
    'click',
    (e) => {
      if (moved > 4) {
        e.preventDefault();
        e.stopPropagation();
        moved = 0;
      }
    },
    true,
  );
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
