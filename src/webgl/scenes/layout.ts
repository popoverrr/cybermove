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
/** S7: сфера в правом верхнем углу над карточками, кольца расходятся за счётчики и карточки */
const GROWTH_DESKTOP: Layout = { x: 0.8, y: 0.3, r: 0.1 };
const GROWTH_MOBILE: Layout = { x: 0.5, y: 0.22, r: 0.18 };
/** S8: форма слева, сфера справа */
const CONTACT_DESKTOP: Layout = { x: 0.82, y: 0.46, r: 0.14 };
const CONTACT_MOBILE: Layout = { x: 0.5, y: 0.24, r: 0.22 };

export const baseLayout = (): Layout => (state.mobile ? BASE_MOBILE : BASE_DESKTOP);
export const serviceLayout = (): Layout => (state.mobile ? SERVICE_MOBILE : SERVICE_DESKTOP);
export const growthLayout = (): Layout => (state.mobile ? GROWTH_MOBILE : GROWTH_DESKTOP);
export const contactLayout = (): Layout => (state.mobile ? CONTACT_MOBILE : CONTACT_DESKTOP);

/** rig.layout = from → to по mix (0..1) */
export function applyLayout(rig: Rig, to: Layout, mix = 1, from: Layout = rig.base) {
  rig.layout.x = lerp(from.x, to.x, mix);
  rig.layout.y = lerp(from.y, to.y, mix);
  rig.layout.r = lerp(from.r, to.r, mix);
}
