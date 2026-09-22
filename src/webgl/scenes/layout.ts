/**
 * Раскладка сферы в долях вьюпорта (BRIEF-3 §3.7): центр x — доля ширины, y — доля высоты, r — радиус сферы
 * в долях ширины. Story переводит доли в мировые координаты под текущую камеру, поэтому наезд камеры меняет
 * только перспективу, а не место и размер сферы. Сцены выбирают пресет и смешивают его с базовым по прогрессу.
 */
import type { Rig } from '../Story';
import { state } from '../../lib/state';
import { lerp } from '../math';

export interface Layout {
  x: number;
  y: number;
  r: number;
}

/** S1: десктоп — центр 63 % ширины, 45 % высоты, радиус 18 % ширины; мобильный — верхняя треть (низ сферы над заголовком), радиус 26 % */
export const BASE_DESKTOP: Layout = { x: 0.63, y: 0.45, r: 0.18 };
export const BASE_MOBILE: Layout = { x: 0.5, y: 0.26, r: 0.26 };
/** S2–S6: правая колонка свободна от текста — сфера чуть правее и меньше, линиям есть место */
const SERVICE_DESKTOP: Layout = { x: 0.69, y: 0.47, r: 0.14 };
const SERVICE_MOBILE: Layout = { x: 0.5, y: 0.27, r: 0.23 };
/**
 * S7 (BRIEF-4 §1.2): внешнее кольцо ≤ 22 vw на десктопе и ≤ 44 vw на портрете — радиус сферы = внешний / 2.6;
 * центр на десктопе в правой трети (78 % ширины, 36 % высоты), на телефоне — 31 % высоты.
 */
const GROWTH_DESKTOP: Layout = { x: 0.78, y: 0.36, r: 0.084 };
/**
 * Телефон: кольца те же 44 vw, но сам шар вдвое меньше (0.09 ширины) — он непрозрачный и иначе ложится
 * на счётчики; масштаб шара внутри атома GROWTH_CORE_MOBILE держит кольца на прежнем радиусе.
 */
const GROWTH_MOBILE: Layout = { x: 0.5, y: 0.31, r: 0.09 };
export const GROWTH_CORE_MOBILE = 0.53;
/** внешний радиус фигуры S7 в радиусах сферы (Rings 1.15…2.6) — для подгонки под шапку */
export const GROWTH_OUTER = 2.6;
/** S8: форма слева, сфера справа; на телефоне — верхняя треть секции (позиция уточняется по секции в Contact.ts) */
const CONTACT_DESKTOP: Layout = { x: 0.82, y: 0.46, r: 0.14 };
const CONTACT_MOBILE: Layout = { x: 0.5, y: 0.26, r: 0.16 };

export const baseLayout = (): Layout => (state.mobile ? BASE_MOBILE : BASE_DESKTOP);
export const serviceLayout = (): Layout => (state.mobile ? SERVICE_MOBILE : SERVICE_DESKTOP);
export const growthLayout = (): Layout => (state.mobile ? GROWTH_MOBILE : GROWTH_DESKTOP);
export const contactLayout = (): Layout => (state.mobile ? CONTACT_MOBILE : CONTACT_DESKTOP);

/**
 * Фигура не заходит в полосу шапки (BRIEF-4 §1.2): если верх фигуры выше `header + 8`, сначала опускаем центр
 * (не ниже `maxY`), потом уменьшаем радиус. Вызывать после applyLayout, с множителем внешнего радиуса фигуры.
 */
export function fitBelowHeader(rig: Rig, outerMult: number, maxY = 0.5) {
  const w = window.innerWidth;
  const h = state.layout.vh || window.innerHeight;
  const limit = state.layout.header + 8;
  const outerPx = () => outerMult * rig.layout.r * w;
  let topPx = rig.layout.y * h - outerPx();
  if (topPx >= limit) return;
  const wantY = (limit + outerPx()) / h;
  rig.layout.y = Math.min(maxY, wantY);
  topPx = rig.layout.y * h - outerPx();
  if (topPx >= limit) return;
  rig.layout.r = Math.max(0.04, (rig.layout.y * h - limit) / (outerMult * w));
}

/**
 * Вписать фигуру в экранную полосу [topPx, bottomPx] вокруг желаемого центра: сначала двигаем центр,
 * если не влезает — уменьшаем радиус (BRIEF-4 §1.2, §1.3). Возвращает итоговый радиус в px.
 */
export function fitBand(rig: Rig, wantCenterPx: number, topPx: number, bottomPx: number, outerMult = 1) {
  const w = window.innerWidth;
  const h = state.layout.vh || window.innerHeight;
  const band = Math.max(0, bottomPx - topPx);
  let rPx = rig.layout.r * w * outerMult;
  if (rPx * 2 > band) rPx = band / 2;
  const centerPx = Math.min(Math.max(wantCenterPx, topPx + rPx), bottomPx - rPx);
  rig.layout.r = rPx / (w * outerMult);
  rig.layout.y = centerPx / h;
  return rPx;
}

/** rig.layout = from → to по mix (0..1) */
export function applyLayout(rig: Rig, to: Layout, mix = 1, from: Layout = rig.base) {
  rig.layout.x = lerp(from.x, to.x, mix);
  rig.layout.y = lerp(from.y, to.y, mix);
  rig.layout.r = lerp(from.r, to.r, mix);
}
