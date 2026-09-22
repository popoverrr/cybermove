/**
 * S2 · АУДИТ (BRIEF-3 §5): скан-плоскость идёт сверху вниз; под ней на сфере — чертёжная сетка широт и долгот
 * (18 × 36, 0.4) с точками на пересечениях каждой третьей линии. Кромка скана — кольцо 0.72 с рисками через 8 %.
 * Шесть точек данных с подписями-анкорами. Hover: гистограмма (12 столбиков вдоль нижней дуги), траектория
 * (линия вправо-вверх с 4 рисками), инвестиции (точки делятся на две группы), аудит (три слоя сетки расходятся).
 */
import * as THREE from 'three';
import { LineSet, LEVEL, WIDTH, sampleLoop, samplePath } from './LineSet';
import { Dots } from './Dots';

const R = 1.02;
const LATS = 18;
const LONS = 36;
const TICKS = 12;
const BARS = 12;

/** точки данных на сетке (широта, долгота в градусах) — CAC, LTV, ROMI, CASH FLOW, МАРЖА, CR */
export const DATA_NODES: Array<[number, number]> = [
  [40, -30],
  [20, 35],
  [-5, -55],
  [-25, 20],
  [55, 15],
  [-45, -15],
];

function onSphere(latDeg: number, lonDeg: number, r: number, out: THREE.Vector3) {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  return out.set(r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon));
}

export class Grid {
  readonly group = new THREE.Group();
  /** сетка: широты (0..17), долготы (18..53) */
  readonly grid: LineSet;
  /** дополнительные слои сетки для hover «аудит» */
  readonly layers: LineSet[] = [];
  /** кромка скана: кольцо (0) и риски (1..12) */
  readonly scan: LineSet;
  /** гистограмма (0..11) и траектория (12) с рисками (13..16) */
  readonly extras: LineSet;
  /** точки: узлы сетки (0..71), точки данных (72..77) */
  readonly dots: Dots;
  readonly dataDotStart = LATS / 3 * (LONS / 3);
  scanY = 1.2;
  private tmp = new THREE.Vector3();
  private ringBuf = new Float32Array(72 * 3);
  private tickBuf = new Float32Array(2 * 3);

  constructor(resolution: THREE.Vector2) {
    const specs = [];
    for (let i = 0; i < LATS; i++) {
      const lat = -80 + (160 * i) / (LATS - 1);
      specs.push({ points: sampleLoop(96, (t, v) => onSphere(lat, t * 360, R, v)), closed: true, opacity: LEVEL.mid, width: WIDTH.thin });
    }
    for (let j = 0; j < LONS; j++) {
      const lon = (360 * j) / LONS;
      specs.push({ points: samplePath(48, (t, v) => onSphere(-90 + 180 * t, lon, R, v)), closed: false, opacity: LEVEL.mid, width: WIDTH.thin });
    }
    this.grid = new LineSet(specs, resolution);
    this.grid.drawAll(0, 0);
    for (const k of [1.04, 1.08]) {
      const layer = new LineSet(specs, resolution);
      layer.mesh.scale.setScalar(k);
      layer.opacityAll(0);
      layer.mesh.visible = false;
      this.layers.push(layer);
      this.group.add(layer.mesh);
    }

    const scanSpecs = [{ points: new Float32Array(72 * 3), closed: true, opacity: LEVEL.main, width: WIDTH.main }];
    for (let k = 0; k < TICKS; k++) scanSpecs.push({ points: new Float32Array(2 * 3), closed: false, opacity: LEVEL.main, width: WIDTH.thin });
    this.scan = new LineSet(scanSpecs, resolution);
    this.scan.opacityAll(0);

    const extraSpecs = [];
    for (let k = 0; k < BARS; k++) extraSpecs.push({ points: new Float32Array(2 * 3), closed: false, opacity: LEVEL.main, width: WIDTH.thin });
    const traj = samplePath(40, (t, v) => {
      const x = 0.62 + t * 1.9;
      v.set(x, 0.58 + Math.pow(t, 1.4) * 1.6 + Math.sin(t * 7.0) * 0.04 * t, 0.35 - t * 0.2);
    });
    extraSpecs.push({ points: traj, closed: false, opacity: LEVEL.main, width: WIDTH.main });
    for (let k = 0; k < 4; k++) {
      const t = (k + 1) / 5;
      const i = Math.floor(t * 39);
      const px = traj[i * 3];
      const py = traj[i * 3 + 1];
      const pz = traj[i * 3 + 2];
      extraSpecs.push({ points: new Float32Array([px, py - 0.06, pz, px, py + 0.06, pz]), closed: false, opacity: LEVEL.main, width: WIDTH.thin });
    }
    this.extras = new LineSet(extraSpecs, resolution);
    this.extras.opacityAll(0);

    this.dots = new Dots(this.dataDotStart + DATA_NODES.length);
    let d = 0;
    for (let i = 0; i < LATS; i += 3) {
      const lat = -80 + (160 * i) / (LATS - 1);
      for (let j = 0; j < LONS; j += 3) {
        onSphere(lat, (360 * j) / LONS, R + 0.004, this.tmp);
        this.dots.setV(d, this.tmp);
        this.dots.setSize(d, 3);
        d++;
      }
    }
    DATA_NODES.forEach((n, i) => {
      onSphere(n[0], n[1], R + 0.01, this.tmp);
      this.dots.setV(this.dataDotStart + i, this.tmp);
      this.dots.setSize(this.dataDotStart + i, 6);
    });
    this.group.add(this.grid.mesh, this.scan.mesh, this.extras.mesh, this.dots.points);
    this.group.visible = false;
  }

  /** позиция точки данных i в локальных координатах атома */
  dataPoint(i: number, out: THREE.Vector3, spread = 1) {
    const n = DATA_NODES[i];
    return onSphere(n[0], n[1], (R + 0.01) * spread, out);
  }

  /**
   * scan — положение плоскости 0..1 (0 — над сферой, 1 — под), scanOn — видимость кромки,
   * grid — рисование сетки 0..1, hist/traj/split/layers — hover-реакции 0..1
   */
  update(time: number, dpr: number, o: { scan: number; scanOn: number; grid: number; hist: number; traj: number; split: number; layers: number; dotsOn: number }) {
    this.dots.setDpr(dpr);
    this.scanY = 1.15 - o.scan * 2.3;
    // сетка видна там, где скан уже прошёл (выше плоскости); ниже — сфера как есть
    this.grid.uniforms.uClipY.value = this.scanY;
    this.grid.uniforms.uClipDir.value = -1;
    for (let i = 0; i < LATS + LONS; i++) this.grid.draw(i, 0, o.grid);
    // кромка скана: кольцо на высоте scanY и риски
    const y = THREE.MathUtils.clamp(this.scanY, -0.999, 0.999);
    const r = Math.sqrt(1 - y * y) * (R + 0.02);
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      this.ringBuf[k * 3] = r * Math.sin(a);
      this.ringBuf[k * 3 + 1] = y;
      this.ringBuf[k * 3 + 2] = r * Math.cos(a);
    }
    this.scan.setPoints(0, this.ringBuf);
    const edgeOn = o.scanOn * (Math.abs(this.scanY) < 0.999 ? 1 : 0);
    this.scan.opacity(0, LEVEL.main * edgeOn);
    for (let k = 0; k < TICKS; k++) {
      const a = (k / TICKS) * Math.PI * 2 + time * 0.05;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      this.tickBuf[0] = r * sx;
      this.tickBuf[1] = y;
      this.tickBuf[2] = r * sz;
      this.tickBuf[3] = (r + 0.07) * sx;
      this.tickBuf[4] = y;
      this.tickBuf[5] = (r + 0.07) * sz;
      this.scan.setPoints(1 + k, this.tickBuf);
      this.scan.opacity(1 + k, LEVEL.main * edgeOn);
    }
    // точки: узлы сетки и точки данных проявляются там, где скан прошёл (выше плоскости)
    for (let i = 0; i < this.dataDotStart; i++) {
      const py = (this.dots.points.geometry.attributes.position.array as Float32Array)[i * 3 + 1];
      const above = py > this.scanY ? 1 : 0;
      this.dots.setOpacity(i, LEVEL.mid * above * o.grid * o.dotsOn);
    }
    for (let i = 0; i < DATA_NODES.length; i++) {
      const di = this.dataDotStart + i;
      this.dataPoint(i, this.tmp, 1 + (i % 2 === 0 ? o.split * 0.12 : o.split * 0.35));
      this.dots.setV(di, this.tmp);
      const above = this.tmp.y / (1 + (i % 2 === 0 ? o.split * 0.12 : o.split * 0.35)) > this.scanY ? 1 : 0;
      const lvl = i % 2 === 0 ? LEVEL.main : LEVEL.main * (1 - o.split * 0.75);
      this.dots.setOpacity(di, lvl * above * o.dotsOn);
      this.dots.setSize(di, 6 + (i % 2 === 0 ? o.split * 2 : -o.split * 2));
    }
    // гистограмма вдоль нижней дуги (спереди)
    for (let k = 0; k < BARS; k++) {
      const a = -0.9 + (1.8 * k) / (BARS - 1);
      const base = 1.08;
      const h = (0.12 + 0.28 * (0.5 + 0.5 * Math.sin(k * 1.7 + time * 0.6))) * o.hist;
      const px = Math.sin(a) * base;
      const pz = Math.cos(a) * base;
      this.tickBuf[0] = px;
      this.tickBuf[1] = -0.72;
      this.tickBuf[2] = pz;
      this.tickBuf[3] = px;
      this.tickBuf[4] = -0.72 + h;
      this.tickBuf[5] = pz;
      this.extras.setPoints(k, this.tickBuf);
      this.extras.opacity(k, LEVEL.main * o.hist);
    }
    // траектория: рисуется по hover
    this.extras.draw(BARS, 0, o.traj);
    this.extras.opacity(BARS, LEVEL.main * (o.traj > 0.001 ? 1 : 0));
    for (let k = 0; k < 4; k++) {
      const shown = o.traj > (k + 1) / 5 ? 1 : 0;
      this.extras.opacity(BARS + 1 + k, LEVEL.main * shown);
    }
    // слои сетки (hover «аудит»)
    this.layers.forEach((l, li) => {
      const k = 1 + 0.04 * (li + 1) * o.layers;
      l.mesh.scale.setScalar(k);
      l.mesh.visible = o.layers > 0.01;
      l.uniforms.uClipY.value = this.scanY * k;
      l.uniforms.uClipDir.value = -1;
      for (let i = 0; i < LATS + LONS; i++) {
        l.draw(i, 0, o.grid);
        l.opacity(i, LEVEL.faint * o.layers);
      }
      l.update(time);
    });
    this.grid.update(time);
    this.scan.update(time);
    this.extras.update(time);
  }

  dispose() {
    this.grid.dispose();
    this.layers.forEach((l) => l.dispose());
    this.scan.dispose();
    this.extras.dispose();
    this.dots.dispose();
  }
}
