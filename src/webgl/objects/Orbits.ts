/**
 * Орбиты S1/S8 (BRIEF-3 §4): пять эллипсов с иерархией — две основные (0.72, наклоны 12° и 68°), одна почти
 * горизонтальная вторичная (0.4), две фоновые (0.18) с большим эксцентриситетом. У каждой электрон (5.5px);
 * у основных диаметрально — точка-спутник 3px. Периоды 26 / 34 / 41 / 55 / 70 с. Линии рисуются
 * (окно draw), прячутся за сферой; шлейф 6 % орбиты, 0.25 — только на hover (S1) или всегда (S8).
 */
import * as THREE from 'three';
import { LineSet, LEVEL, WIDTH, ellipse, ellipsePoint } from './LineSet';
import { Dots } from './Dots';

export interface OrbitParams {
  a: number;
  b: number;
  /** наклон к плоскости экрана (град.) и поворот в плоскости экрана (град.) */
  tilt: number;
  roll: number;
  /** фаза электрона (обороты) */
  phase: number;
  /** период оборота, с */
  period: number;
  level: number;
  width: number;
  satellite: boolean;
}

/** Композиция референса: основная орбита O1 проходит перед сферой, её электрон при t=4 с — справа сверху */
export const ORBITS: OrbitParams[] = [
  { a: 1.55, b: 1.22, tilt: 68, roll: -22, phase: 0.095, period: 26, level: LEVEL.main, width: WIDTH.main, satellite: true },
  { a: 1.7, b: 0.95, tilt: 12, roll: 28, phase: 0.62, period: 34, level: LEVEL.main, width: WIDTH.main, satellite: true },
  { a: 1.85, b: 0.32, tilt: 4, roll: -6, phase: 0.3, period: 41, level: LEVEL.mid, width: WIDTH.thin, satellite: false },
  { a: 2.0, b: 0.7, tilt: 42, roll: -58, phase: 0.8, period: 55, level: LEVEL.faint, width: WIDTH.thin, satellite: false },
  { a: 2.15, b: 0.78, tilt: 56, roll: 66, phase: 0.45, period: 70, level: LEVEL.faint, width: WIDTH.thin, satellite: false },
];

const TRAIL_POINTS = 18;
const TRAIL_LEN = 0.06;

export class OrbitSystem {
  readonly group = new THREE.Group();
  readonly lines: LineSet;
  readonly dots: Dots;
  readonly orients: THREE.Matrix3[] = [];
  readonly spin: number[] = [];
  /** видимость электронов 0..1 (появляются, когда орбита дорисована) */
  readonly electron: number[] = [];
  /** подсветка hover 0..1 */
  readonly highlight: number[] = [];
  /** множитель уровня линий (0..1) на орбиту */
  readonly level: number[] = [];
  /** общий множитель (растворение на выходе) */
  global = 1;
  private tmp = new THREE.Vector3();
  private trailBuf = new Float32Array(TRAIL_POINTS * 3);
  private satIndex: number[] = [];

  constructor(resolution: THREE.Vector2) {
    const specs = ORBITS.map((o) => {
      const e = new THREE.Euler(THREE.MathUtils.degToRad(o.tilt), 0, THREE.MathUtils.degToRad(o.roll), 'ZXY');
      const m = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
      this.orients.push(m);
      this.spin.push(0);
      this.electron.push(0);
      this.highlight.push(0);
      this.level.push(1);
      return { points: ellipse(180, o.a, o.b, m), closed: true, opacity: o.level, width: o.width };
    });
    // шлейфы — открытые пути, обновляются каждый кадр
    for (let i = 0; i < ORBITS.length; i++) specs.push({ points: new Float32Array(TRAIL_POINTS * 3), closed: false, opacity: 0, width: WIDTH.main });
    this.lines = new LineSet(specs, resolution);
    this.lines.drawAll(0, 0);
    let nSat = 0;
    ORBITS.forEach((o) => {
      if (o.satellite) nSat++;
    });
    this.dots = new Dots(ORBITS.length + nSat);
    let k = ORBITS.length;
    ORBITS.forEach((o) => {
      this.satIndex.push(o.satellite ? k++ : -1);
    });
    for (let i = 0; i < ORBITS.length; i++) {
      this.dots.setSize(i, 5.5);
      if (this.satIndex[i] >= 0) this.dots.setSize(this.satIndex[i], 3);
    }
    this.group.add(this.lines.mesh, this.dots.points);
  }

  /** прогресс рисования орбиты i (0..1) */
  draw(i: number, t: number) {
    this.lines.draw(i, 0, t);
  }
  /** стирание с начала (t → 1) */
  erase(i: number, t: number) {
    this.lines.draw(i, t, 1);
  }

  pointAt(i: number, t: number, out: THREE.Vector3) {
    const o = ORBITS[i];
    return ellipsePoint(t, o.a, o.b, this.orients[i], o.phase, out);
  }

  update(dt: number, time: number, opts: { speedMul: number; trails: boolean; dpr: number }) {
    this.dots.setDpr(opts.dpr);
    this.dots.uniforms.uGlobal.value = this.global;
    this.lines.uniforms.uGlobal.value = this.global;
    for (let i = 0; i < ORBITS.length; i++) {
      const o = ORBITS[i];
      this.spin[i] += (dt * opts.speedMul) / o.period;
      const h = this.highlight[i];
      this.lines.opacity(i, o.level * this.level[i] * (1 + h * (1 / o.level - 1) * 0.8));
      this.lines.width(i, o.width + h * 0.35);
      const t = this.spin[i];
      this.pointAt(i, t, this.tmp);
      this.dots.setV(i, this.tmp);
      this.dots.setOpacity(i, this.electron[i]);
      this.dots.setSize(i, 5.5 + h * 1.5);
      const si = this.satIndex[i];
      if (si >= 0) {
        this.pointAt(i, t + 0.5, this.tmp);
        this.dots.setV(si, this.tmp);
        this.dots.setOpacity(si, this.electron[i] * 0.85);
      }
      // шлейф: 6 % орбиты позади электрона
      const trailOn = (opts.trails || h > 0.02) && this.electron[i] > 0.02;
      const ti = ORBITS.length + i;
      if (trailOn) {
        for (let k = 0; k < TRAIL_POINTS; k++) {
          const tt = t - TRAIL_LEN * (1 - k / (TRAIL_POINTS - 1));
          this.pointAt(i, tt, this.tmp);
          this.trailBuf[k * 3] = this.tmp.x;
          this.trailBuf[k * 3 + 1] = this.tmp.y;
          this.trailBuf[k * 3 + 2] = this.tmp.z;
        }
        this.lines.setPoints(ti, this.trailBuf);
        this.lines.draw(ti, 0, 1);
        this.lines.opacity(ti, 0.25 * this.electron[i] * (opts.trails ? 1 : h));
      } else {
        this.lines.opacity(ti, 0);
      }
    }
    this.lines.update(time);
  }

  dispose() {
    this.lines.dispose();
    this.dots.dispose();
  }
}
