/**
 * S4 · БРЕНД И КОНТЕНТ (BRIEF-3 §5): сфера не деформируется; вокруг неё рисуются и стираются пять линейных
 * фигур в порядке строк: звезда из четырёх дуг (астроида, касается сферы), кольцо-объектив (два концентрических
 * кольца с рисками диафрагмы), рамка 9:16 с уголками, концентрические волны (4 кольца, непрозрачность падает
 * наружу), вертикальный луч (две почти параллельные линии позади сферы). Все фигуры в плоскости камеры.
 */
import * as THREE from 'three';
import { LineSet, LEVEL, WIDTH, sampleLoop, samplePath } from './LineSet';

export const FIGURE_IDS = ['brand-core', 'production', 'smm', 'pr', 'personal-brand'] as const;

interface Figure {
  /** индексы путей в общем LineSet */
  paths: number[];
  /** длительности рисования каждого пути в долях общего времени фигуры (для stagger) */
  order: number[];
}

export class Figures {
  readonly group = new THREE.Group();
  readonly lines: LineSet;
  readonly figures: Figure[] = [];
  /** прогресс рисования каждой фигуры 0..1 и стирания 0..1 */
  readonly draw: number[] = [0, 0, 0, 0, 0];
  readonly erase: number[] = [0, 0, 0, 0, 0];
  /** радиус волн 0..1 (анимируется во время удержания) */
  wave = 0;
  private waveBuf = new Float32Array(120 * 3);
  private specs: Array<{ points: Float32Array; closed?: boolean; opacity?: number; width?: number }> = [];

  constructor(resolution: THREE.Vector2) {
    const add = (points: Float32Array, closed: boolean, opacity: number, width: number) => {
      this.specs.push({ points, closed, opacity, width });
      return this.specs.length - 1;
    };
    // 1. звезда: астроида x = a cos³θ, y = a sin³θ, a = 1.85 — вогнутые дуги касаются сферы в четырёх точках
    const star: number[] = [];
    for (let k = 0; k < 4; k++) {
      const pts = samplePath(40, (t, v) => {
        const th = ((k + t) * Math.PI) / 2;
        v.set(1.85 * Math.pow(Math.cos(th), 3), 1.85 * Math.pow(Math.sin(th), 3), 0.2);
      });
      star.push(add(pts, false, LEVEL.main, WIDTH.main));
    }
    this.figures.push({ paths: star, order: [0, 0.25, 0.5, 0.75] });
    // 2. объектив: два кольца в плоскости камеры и 16 рисок диафрагмы между ними
    const lens: number[] = [];
    lens.push(add(sampleLoop(120, (t, v) => v.set(1.28 * Math.cos(t * Math.PI * 2), 1.28 * Math.sin(t * Math.PI * 2), 0.2)), true, LEVEL.main, WIDTH.main));
    lens.push(add(sampleLoop(120, (t, v) => v.set(1.5 * Math.cos(t * Math.PI * 2), 1.5 * Math.sin(t * Math.PI * 2), 0.2)), true, LEVEL.mid, WIDTH.thin));
    const order = [0, 0.15];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + 0.1;
      const pts = new Float32Array([1.31 * Math.cos(a), 1.31 * Math.sin(a), 0.2, 1.47 * Math.cos(a + 0.08), 1.47 * Math.sin(a + 0.08), 0.2]);
      lens.push(add(pts, false, LEVEL.mid, WIDTH.thin));
      order.push(0.3 + (k / 16) * 0.7);
    }
    this.figures.push({ paths: lens, order });
    // 3. рамка 9:16 позади сферы (портретный кадр: сфера выходит за боковые стороны), просветы у углов и уголки
    const w = 0.8;
    const h = 1.42;
    const g = 0.18;
    const frame: number[] = [];
    const side = (x0: number, y0: number, x1: number, y1: number) => add(new Float32Array([x0, y0, 0.2, x1, y1, 0.2]), false, LEVEL.main, WIDTH.main);
    frame.push(side(-w + g, h, w - g, h), side(w, h - g, w, -h + g), side(w - g, -h, -w + g, -h), side(-w, -h + g, -w, h - g));
    const corner = (cx: number, cy: number, sx: number, sy: number) => add(new Float32Array([cx, cy + sy * 0.12, 0.2, cx, cy, 0.2, cx + sx * 0.12, cy, 0.2]), false, LEVEL.main, WIDTH.thin);
    frame.push(corner(-w, h, 1, -1), corner(w, h, -1, -1), corner(w, -h, -1, 1), corner(-w, -h, 1, 1));
    this.figures.push({ paths: frame, order: [0, 0.2, 0.4, 0.6, 0.8, 0.85, 0.9, 0.95] });
    // 4. волны: четыре кольца, радиус задаётся в update (расходятся из сферы)
    const waves: number[] = [];
    for (let k = 0; k < 4; k++) waves.push(add(new Float32Array(120 * 3), true, LEVEL.main - k * 0.16, WIDTH.thin));
    this.figures.push({ paths: waves, order: [0, 0.2, 0.4, 0.6] });
    // 5. луч: две почти параллельные линии сверху вниз позади сферы
    const beam: number[] = [];
    beam.push(add(new Float32Array([-0.42, 3.2, -0.6, -0.36, -3.2, -0.6]), false, LEVEL.main, WIDTH.thin), add(new Float32Array([0.42, 3.2, -0.6, 0.36, -3.2, -0.6]), false, LEVEL.main, WIDTH.thin));
    this.figures.push({ paths: beam, order: [0, 0.1] });

    this.lines = new LineSet(this.specs, resolution);
    this.lines.drawAll(0, 0);
    this.group.add(this.lines.mesh);
    this.group.visible = false;
  }

  /** hovered — индекс зафиксированной фигуры или -1 */
  update(time: number, hovered: number) {
    const buf = this.waveBuf;
    for (let f = 0; f < this.figures.length; f++) {
      const fig = this.figures[f];
      const d = this.draw[f];
      const e = this.erase[f];
      const dim = hovered >= 0 && hovered !== f ? 0.25 : 1;
      fig.paths.forEach((pi, k) => {
        const o = fig.order[k];
        // каждый путь рисуется в своём окне общего прогресса
        const span = 1 - o;
        const local = THREE.MathUtils.clamp((d - o) / Math.max(span, 0.05), 0, 1);
        const localErase = THREE.MathUtils.clamp((e - o * 0.5) / 0.6, 0, 1);
        this.lines.draw(pi, localErase, local);
        const base = this.specs[pi].opacity ?? LEVEL.mid;
        this.lines.opacity(pi, base * dim);
      });
      if (f === 3) {
        // волны расходятся: радиусы 1.05..2.0, внешние прозрачнее
        fig.paths.forEach((pi, k) => {
          const r = 1.05 + ((k + this.wave) % 4) * 0.24 + 0.04;
          for (let i = 0; i < 120; i++) {
            const a = (i / 120) * Math.PI * 2;
            buf[i * 3] = r * Math.cos(a);
            buf[i * 3 + 1] = r * Math.sin(a);
            buf[i * 3 + 2] = 0.2;
          }
          this.lines.setPoints(pi, buf);
          const fade = 1 - ((r - 1.05) / 1.0) * 0.75;
          this.lines.opacity(pi, LEVEL.main * fade * dim);
        });
      }
    }
    this.lines.update(time);
  }

  dispose() {
    this.lines.dispose();
  }
}
