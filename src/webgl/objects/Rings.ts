/**
 * Кольца (BRIEF-3 §5): S7 «Рост» — 12 колец в плоскости камеры расходятся из сферы (0.18 → 0.72 к внешнему),
 * S8 «Контакт» — одно кольцо расходится от сферы при отправке формы и растворяется.
 */
import * as THREE from 'three';
import { LineSet, LEVEL, WIDTH } from './LineSet';

export class Rings {
  readonly group = new THREE.Group();
  readonly lines: LineSet;
  readonly count: number;
  /** прогресс рисования каждого кольца 0..1 */
  readonly draw: number[] = [];
  /** радиус каждого кольца (единицы сферы) */
  readonly radius: number[] = [];
  /** множитель непрозрачности каждого кольца */
  readonly alpha: number[] = [];
  private buf = new Float32Array(120 * 3);

  constructor(resolution: THREE.Vector2, count: number, r0 = 1.1, r1 = 3.2) {
    this.count = count;
    const specs = [];
    for (let i = 0; i < count; i++) {
      const k = count === 1 ? 1 : i / (count - 1);
      this.draw.push(0);
      this.radius.push(count === 1 ? r0 : r0 + (r1 - r0) * k);
      this.alpha.push(1);
      specs.push({ points: new Float32Array(120 * 3), closed: true, opacity: LEVEL.faint + (LEVEL.main - LEVEL.faint) * k, width: k > 0.7 ? WIDTH.main : WIDTH.thin });
    }
    this.lines = new LineSet(specs, resolution);
    this.lines.drawAll(0, 0);
    this.group.add(this.lines.mesh);
    this.group.visible = false;
  }

  update(time: number) {
    for (let i = 0; i < this.count; i++) {
      const r = this.radius[i];
      for (let k = 0; k < 120; k++) {
        const a = (k / 120) * Math.PI * 2;
        this.buf[k * 3] = r * Math.cos(a);
        this.buf[k * 3 + 1] = r * Math.sin(a);
        this.buf[k * 3 + 2] = 0.1;
      }
      this.lines.setPoints(i, this.buf);
      this.lines.draw(i, 0, this.draw[i]);
      const kk = this.count === 1 ? 1 : i / (this.count - 1);
      this.lines.opacity(i, (LEVEL.faint + (LEVEL.main - LEVEL.faint) * kk) * this.alpha[i]);
    }
    this.lines.update(time);
  }

  dispose() {
    this.lines.dispose();
  }
}
