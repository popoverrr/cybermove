/**
 * S5 · ТРАФИК (BRIEF-3 §5): четыре ленты по 9 параллельных линий (0.4 внутри, 0.72 крайние) приходят из
 * четырёх углов экрана и сворачиваются в вихрь к сфере (как Nike Fluid Force на ref-01, но тушью).
 * Рисуются 2.4 с со stagger 0.3; по линиям бегут точки, одна на линию, 12 с на путь.
 * Пути считаются в локальных координатах атома от углов экрана (положение сферы и камера известны Story).
 */
import * as THREE from 'three';
import { LineSet, LEVEL, WIDTH } from './LineSet';

export const STREAM_IDS = ['targeting', 'google-ads', 'tiktok-ads', 'seo'] as const;
const LINES = 9;
const POINTS = 90;

export class Ribbons {
  readonly group = new THREE.Group();
  readonly lines: LineSet;
  /** прогресс рисования лент 0..1 и hover 0..1 */
  readonly draw: number[] = [0, 0, 0, 0];
  readonly hover: number[] = [0, 0, 0, 0];
  /** точки входа лент (локальные координаты атома) — для подписей */
  readonly entries: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private buf = new Float32Array(POINTS * 3);
  private layoutKey = '';

  constructor(resolution: THREE.Vector2) {
    const specs = [];
    for (let s = 0; s < 4; s++) {
      for (let k = 0; k < LINES; k++) {
        const outer = k === 0 || k === LINES - 1;
        specs.push({ points: new Float32Array(POINTS * 3), closed: false, opacity: outer ? LEVEL.main : LEVEL.mid, width: outer ? WIDTH.main : WIDTH.thin });
      }
    }
    this.lines = new LineSet(specs, resolution);
    this.lines.drawAll(0, 0);
    this.group.add(this.lines.mesh);
    this.group.visible = false;
  }

  /**
   * Пересчёт путей от углов экрана. corners — четыре угла в локальных координатах атома (z = 0):
   * лента s стартует в углу s и по спирали приходит к сфере.
   */
  layout(corners: THREE.Vector3[]) {
    const key = corners.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join('|');
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    for (let s = 0; s < 4; s++) {
      const c = corners[s];
      this.entries[s].copy(c);
      const startAng = Math.atan2(c.y, c.x);
      const startR = c.length();
      // ленты сворачиваются в свободную сторону: верхние — по часовой, нижние — против (левая половина занята текстом)
      const dir = s < 2 ? -1 : 1;
      for (let k = 0; k < LINES; k++) {
        const u = (k / (LINES - 1) - 0.5) * 2;
        for (let i = 0; i < POINTS; i++) {
          const t = i / (POINTS - 1);
          // радиус: от угла к сфере, спираль +2.4 рад к концу; ширина ленты сужается к сфере
          const r = startR * (1 - t) * (1 - t) + 0.72 * (1 - (1 - t) * (1 - t)) + 0.04;
          const ang = startAng + dir * t * t * 2.4;
          const width = (0.32 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * (1 - t * 0.7) + 0.03;
          const twist = t * 3.6 + s;
          const ox = Math.cos(twist) * u * width;
          const oy = Math.sin(twist) * 0.7 * u * width;
          const oz = Math.sin(twist * 0.8) * u * width * 0.6;
          this.buf[i * 3] = Math.cos(ang) * r + ox;
          this.buf[i * 3 + 1] = Math.sin(ang) * r + oy;
          this.buf[i * 3 + 2] = 0.15 * (1 - t) + oz;
        }
        this.lines.setPoints(s * LINES + k, this.buf);
      }
    }
  }

  /** maxDots — бюджет точек-импульсов на экран (LOW: 8 → только крайние линии лент) */
  update(time: number, o: { hovered: number; dots: boolean; freeze: number; maxDots: number }) {
    const perRibbon = Math.max(0, Math.floor(o.maxDots / 4));
    for (let s = 0; s < 4; s++) {
      const h = this.hover[s];
      const dim = o.hovered >= 0 && o.hovered !== s ? 0.3 : 1;
      for (let k = 0; k < LINES; k++) {
        const i = s * LINES + k;
        const outer = k === 0 || k === LINES - 1;
        const stagger = (k / (LINES - 1)) * 0.25;
        this.lines.draw(i, 0, THREE.MathUtils.clamp((this.draw[s] - stagger) / 0.75, 0, 1));
        this.lines.opacity(i, (outer ? LEVEL.main : LEVEL.mid + h * 0.2) * dim);
        this.lines.width(i, (outer ? WIDTH.main : WIDTH.thin) + h * 0.3);
        // точки: сначала крайние линии, затем внутренние по бюджету
        const rank = outer ? (k === 0 ? 0 : 1) : 1 + k;
        this.lines.dots(i, o.dots && rank < perRibbon ? 1 : 0, ((1 / 12) * (1 + h * 1.5)) * (1 - o.freeze), LEVEL.main);
      }
    }
    this.lines.update(time);
  }

  dispose() {
    this.lines.dispose();
  }
}
