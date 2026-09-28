/**
 * BRIEF-7 §1: снап главной — остановка возможна только на экране, никогда между.
 *
 * Точки покоя (rests) — положения прокрутки документа, где экран стоит целиком: S1 — верх страницы, S2–S6 — фаза
 * удержания (local 0.45, туда же ведут якоря), S7 — одна или две точки (верх и низ, если содержимое выше экрана),
 * последняя — выход в поток (начало блока «О компании»). В этой модели local 0/1 — середина перехода между экранами,
 * а переход между соседними точками покоя — около двух высот окна прокрутки. Правило брифа «< 0.5 перехода — назад»
 * в буквальном виде требовало бы ~1000 px колеса или долгого свайпа на каждый экран, поэтому решает намерение:
 * сдвиг от точки покоя ≥ 6 % высоты окна (не меньше 48 px, на таче 40 px) — вперёд в сторону жеста, меньше — назад.
 * Если жест начался не в точке покоя (прерванная доводка, полоса прокрутки) — к ближайшей точке (середина отрезка).
 *
 * Всё идёт через ту же модель: снап меняет положение прокрутки (lenis.scrollTo / window.scrollTo), из него
 * measureTargets → сглаживание → сцена, кольца и тексты. Зона — от верха страницы до выхода в поток; «О компании»,
 * форма и подвал прокручиваются обычно.
 *
 *   колесо / трекпад — накопленная дельта жеста не выводит дальше соседней точки покоя, лишнее отбрасывается до конца снапа;
 *   тач — ведёт Lenis (syncTouch), после touchend доводка с учётом скорости (быстрый свайп: вперёд уже с 0.4 перехода);
 *   клавиатура — ↓ PageDown Пробел: следующая точка, ↑ PageUp Shift+Пробел: предыдущая, Home — верх, End — низ страницы;
 *   ввод прекратился на 120 мс, а положение не в точке покоя (допуск 2 % перехода) — доводка 0.55–0.75 с, power2.out;
 *   новый ввод отменяет доводку; prefers-reduced-motion — доводка мгновенная.
 */
import gsap from 'gsap';
import type Lenis from 'lenis';

export interface SnapOptions {
  lenis: () => Lenis | null;
  /** точки покоя по возрастанию; последняя — выход в поток */
  rests: () => number[];
  reduced: boolean;
  /** занято: автоскролл к экрану, открыт drawer или меню */
  busy: () => boolean;
}

const IDLE_MS = 120;
/** пауза в потоке событий колеса, после которой начинается новый жест */
const GESTURE_GAP_MS = 180;
/** жест упёрся в соседнюю точку покоя или идёт доводка: остаток серии отбрасывается, новый жест — после 400 мс тишины */
const GESTURE_GAP_FULL_MS = 400;
const EASE = (t: number) => 1 - (1 - t) * (1 - t); // power2.out

export interface SnapState {
  snapping: boolean;
  dir: number;
  enabled: boolean;
}

export function createSnap(opt: SnapOptions) {
  const st: SnapState = { snapping: false, dir: 0, enabled: true };
  let lastInputAt = 0;
  let lastWheelAt = -1e9;
  /** пределы текущего жеста, откуда он начался и с какой точки покоя (null — не с точки) */
  let gesture: { lo: number; hi: number; from: number; startRest: number | null; touch: boolean; full?: boolean } | null = null;
  let touching = false;
  let nativeTouch = false;
  let touchFast = 0; // направление быстрого свайпа (±1) для порога 0.4
  let scrollbarDrag = false;
  let settledAt = -1;
  let tween: gsap.core.Tween | null = null;

  const scrollY = () => {
    const l = opt.lenis();
    return l ? l.targetScroll : window.scrollY;
  };
  const zoneEnd = () => {
    const r = opt.rests();
    return r[r.length - 1];
  };

  /** индекс ближайшей точки покоя и расстояние до неё */
  function nearest(y: number) {
    const r = opt.rests();
    let k = 0;
    for (let i = 1; i < r.length; i++) if (Math.abs(r[i] - y) < Math.abs(r[k] - y)) k = i;
    return { k, d: Math.abs(r[k] - y) };
  }

  /** отрезок [r[i], r[i+1]], в котором лежит y */
  function segment(y: number) {
    const r = opt.rests();
    let i = 0;
    while (i < r.length - 2 && y > r[i + 1]) i++;
    return i;
  }

  /** пределы жеста: не дальше соседней точки покоя (в середине перехода — края текущего отрезка) */
  function makeGesture(y: number, touch = false, dir = 0) {
    const r = opt.rests();
    const z = r[r.length - 1];
    if (y >= z - 1) return { lo: r[r.length - 2], hi: Infinity, from: y, startRest: null as number | null, touch }; // из потока вверх — не дальше нижней точки S7
    const { k, d } = nearest(y);
    if (d < 8) return { lo: r[Math.max(0, k - 1)], hi: r[Math.min(r.length - 1, k + 1)], from: y, startRest: r[k] as number | null, touch };
    // середина перехода (прерванная доводка): опора — точка позади по направлению жеста, предел — края отрезка
    const i = segment(y);
    const startRest = dir > 0 ? r[i] : dir < 0 ? r[i + 1] : null;
    return { lo: r[i], hi: r[i + 1], from: y, startRest, touch };
  }
  /** после доводки остаток того же жеста (инерция) не двигает страницу */
  function lockAt(y: number) {
    gesture = { lo: y, hi: y, from: y, startRest: y, touch: false, full: true };
  }

  function cancelSnap() {
    if (!st.snapping) return;
    st.snapping = false;
    tween?.kill();
    tween = null;
  }

  function snapTo(y: number) {
    const l = opt.lenis();
    const from = scrollY();
    if (Math.abs(y - from) < 1) return;
    st.dir = Math.sign(y - from);
    st.snapping = true;
    settledAt = -1;
    const done = () => {
      st.snapping = false;
      tween = null;
      settledAt = y;
      lockAt(y);
    };
    if (opt.reduced) {
      if (l) l.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo(0, y);
      done();
      return;
    }
    const span = Math.abs(y - from) / Math.max(window.innerHeight, 1);
    const duration = Math.min(0.75, 0.55 + 0.2 * Math.min(1, span));
    if (l) {
      l.scrollTo(y, { duration, easing: EASE, force: true, onComplete: done });
    } else {
      const o = { y: from };
      tween = gsap.to(o, { y, duration, ease: 'power2.out', overwrite: true, onUpdate: () => window.scrollTo(0, o.y), onComplete: done });
    }
  }

  /** куда доводить из положения y */
  function chooseRest(y: number) {
    const r = opt.rests();
    const g = gesture;
    if (g && g.startRest !== null && y >= g.lo - 1 && y <= g.hi + 1) {
      // жест начался в точке покоя: намерение — сдвиг в сторону больше порога
      const intent = Math.max(g.touch ? 40 : 48, window.innerHeight * (g.touch ? 0.05 : 0.06));
      const d = y - g.startRest;
      if (Math.abs(d) < intent && !(touchFast && Math.sign(touchFast) === Math.sign(d) && d !== 0)) return g.startRest;
      const { k } = nearest(g.startRest);
      return d > 0 ? r[Math.min(r.length - 1, k + 1)] : r[Math.max(0, k - 1)];
    }
    // иначе — к ближайшей точке (середина отрезка)
    const i = segment(y);
    const a = r[i];
    const b = r[i + 1];
    return (y - a) / Math.max(1, b - a) < 0.5 ? a : b;
  }

  function inputNow() {
    lastInputAt = performance.now();
    settledAt = -1;
  }

  /** Lenis: колесо и тач до того, как Lenis применит дельту (data.deltaY можно поправить) */
  function virtualScroll(data: { deltaX: number; deltaY: number; event: WheelEvent | TouchEvent }) {
    const e = data.event;
    const type = e.type;
    if (!st.enabled) return true;
    const now = performance.now();
    if (type === 'wheel') {
      if ((e as WheelEvent).ctrlKey) return true;
      if (Math.abs(data.deltaX) > Math.abs(data.deltaY)) return true; // горизонтальный жест (лента S7)
      const fresh = now - lastWheelAt > (gesture?.full || st.snapping ? GESTURE_GAP_FULL_MS : GESTURE_GAP_MS);
      lastWheelAt = now;
      inputNow();
      if (opt.busy()) return true;
      if (fresh) {
        cancelSnap();
        const y = scrollY();
        gesture = y >= zoneEnd() - 1 && data.deltaY > 0 ? null : makeGesture(y, false, Math.sign(data.deltaY));
      } else if (st.snapping) {
        return false; // хвост того же жеста (инерция трекпада) — отбрасываем до конца снапа
      }
      if (!gesture) return true;
      const y = scrollY();
      // цель — целые пиксели: при дробной цели Lenis не завершает сглаживание (isScrolling остаётся 'smooth')
      const want = y + data.deltaY;
      const next = Math.round(Math.min(gesture.hi, Math.max(gesture.lo, want)));
      st.dir = Math.sign(data.deltaY);
      if (want > gesture.hi || want < gesture.lo) gesture.full = true;
      if (Math.abs(next - y) < 0.5) return false;
      data.deltaY = next - y;
      return true;
    }
    // тач (Lenis syncTouch)
    if (type === 'touchstart') {
      cancelSnap();
      touching = true;
      touchFast = 0;
      inputNow();
      const y = scrollY();
      nativeTouch = opt.busy() || y >= zoneEnd() - 1;
      gesture = makeGesture(y, true);
      return !nativeTouch;
    }
    if (type === 'touchmove') {
      inputNow();
      if (nativeTouch || !gesture) return false;
      // тач начался в середине перехода: опора определяется первым движением
      if (gesture.startRest === null && data.deltaY !== 0) {
        const r = opt.rests();
        const i = segment(scrollY());
        gesture.startRest = data.deltaY > 0 ? r[i] : r[i + 1];
      }
      const y = scrollY();
      const next = Math.round(Math.min(gesture.hi, Math.max(gesture.lo, y + data.deltaY)));
      st.dir = Math.sign(data.deltaY) || st.dir;
      data.deltaY = next - y;
      return true;
    }
    if (type === 'touchend' || type === 'touchcancel') {
      touching = false;
      inputNow();
      if (nativeTouch) return false;
      // скорость Lenis — px за кадр; быстрый свайп задаёт порог 0.4 в своём направлении, инерцию Lenis не применяем
      const l = opt.lenis();
      const v = l ? l.velocity : 0;
      touchFast = Math.abs(v) > 3 ? Math.sign(v) : 0;
      const y = scrollY();
      if (y < zoneEnd() - 1) snapTo(chooseRest(y));
      return false;
    }
    return true;
  }

  function onScroll() {
    if (st.snapping) return;
    inputNow();
    // жест из потока вверх (нативный тач): не дальше нижней точки S7
    if (nativeTouch && gesture && window.scrollY < gesture.lo - 1) {
      window.scrollTo(0, gesture.lo);
      opt.lenis()?.scrollTo(gesture.lo, { immediate: true, force: true });
    }
  }

  function onKey(e: KeyboardEvent) {
    if (!st.enabled || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || opt.busy()) return;
    const t = e.target as HTMLElement | null;
    if (t && t.closest('input, textarea, select, [contenteditable="true"], [data-rail]')) return;
    if (e.key === ' ' && t && t.closest('button, a, summary')) return;
    const r = opt.rests();
    const z = r[r.length - 1];
    const y = scrollY();
    const inZone = y < z - 1;
    const atZoneEdge = !inZone && y <= z + 4;
    let target: number | null = null;
    const down = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
    const up = e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
    if (inZone) {
      const { k, d } = nearest(y);
      const at = d < 8 ? k : null;
      if (down) target = at !== null ? r[Math.min(r.length - 1, at + 1)] : r[segment(y) + 1];
      else if (up) target = at !== null ? r[Math.max(0, at - 1)] : r[segment(y)];
      else if (e.key === 'Home') target = 0;
      else if (e.key === 'End') target = document.documentElement.scrollHeight - window.innerHeight;
    } else if (atZoneEdge && up) {
      target = r[r.length - 2];
    }
    if (target === null) return;
    e.preventDefault();
    inputNow();
    snapTo(target);
  }

  /** кадр: ввод стих 120 мс, Lenis не анимирует — доводка до ближайшей точки покоя */
  function tick() {
    if (!st.enabled || st.snapping || touching || scrollbarDrag || opt.busy()) return;
    const now = performance.now();
    if (now - lastInputAt < IDLE_MS) return;
    const l = opt.lenis();
    if (l && l.isScrolling === 'smooth' && Math.abs(l.animatedScroll - l.targetScroll) > 1) return;
    const y = scrollY();
    if (y === settledAt) return;
    const r = opt.rests();
    if (r.length < 2 || y >= r[r.length - 1] - 1) {
      settledAt = y;
      nativeTouch = false;
      return;
    }
    const target = chooseRest(y);
    // допуск в пикселях: 2 % перехода в этой модели — десятки пикселей, заметный недоезд сцены
    const tol = 2;
    touchFast = 0;
    nativeTouch = false;
    if (Math.abs(target - y) <= tol) {
      settledAt = y;
      return;
    }
    snapTo(target);
  }

  function init() {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    // нативный тач (без Lenis или из потока): держим «жест идёт», пока палец на экране
    window.addEventListener('touchstart', () => {
      if (opt.lenis()) return;
      touching = true;
      nativeTouch = true;
      gesture = makeGesture(scrollY(), true);
      inputNow();
    }, { passive: true });
    window.addEventListener('touchend', () => {
      if (opt.lenis()) return;
      touching = false;
      inputNow();
    }, { passive: true });
    // ползунок полосы прокрутки: пока кнопка зажата, не доводим
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.clientX >= document.documentElement.clientWidth) {
        scrollbarDrag = true;
        gesture = null;
      }
    });
    window.addEventListener('pointerup', () => {
      if (scrollbarDrag) {
        scrollbarDrag = false;
        inputNow();
      }
    });
    // колесо без Lenis (reduced-motion): один жест — одна точка покоя, мгновенно
    window.addEventListener(
      'wheel',
      (e) => {
        if (opt.lenis() || !st.enabled || opt.busy() || e.ctrlKey) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        const now = performance.now();
        const fresh = now - lastWheelAt > GESTURE_GAP_MS;
        lastWheelAt = now;
        const y = window.scrollY;
        const r = opt.rests();
        if (y >= r[r.length - 1] - 1 && e.deltaY > 0) return;
        e.preventDefault();
        inputNow();
        if (!fresh) return;
        const g = makeGesture(y);
        if (!g) return;
        const target = e.deltaY > 0 ? Math.min(g.hi, r[r.length - 1]) : g.lo;
        snapTo(Math.max(0, target));
      },
      { passive: false },
    );
  }

  /** снимок для проверок (?stats, scripts/test-snap.mjs) */
  const debug = () => ({ gesture, settledAt, idleMs: Math.round(performance.now() - lastInputAt), touching, nativeTouch });
  return { state: st, virtualScroll, tick, init, snapTo, cancel: cancelSnap, debug };
}
