/**
 * S3 · СИСТЕМЫ (BRIEF-3 §5): пять малых жемчужных сфер (r 0.14 ядра) на общем кольце вокруг ядра
 * (кольцо 0.4, наклон 20°), у каждой своё кольцо-экватор и подпись SITE / CRM / VOIP / AI / AUTO.
 * Появляются выездом из-за ядра по кольцу; связи ядро–спутник рисуются после; по связям бегут точки-импульсы
 * (одна на связь раз в 2.5 с). Hover: спутник подсвечивается (кольцо 0.72, подпись ink), остальные 0.25.
 */
import * as THREE from 'three';
import { LineSet, LEVEL, WIDTH, circle, samplePath } from './LineSet';
import { pearlMaterial } from '../Environment';

export const NODE_IDS = ['websites', 'crm', 'telephony', 'ai', 'automation'] as const;
/** масштаб ядра внутри атома на S3 (Systems.ts): кольцо и спутники считаются в единицах атома */
export const CORE_SCALE = 0.72;
/** радиус кольца ≈ 1.67 радиуса ядра, спутник 0.14 ядра */
const RING_R = 1.2;
const SAT_R = 0.1;
/** плоскость кольца наклонена к камере на 40° (эллипс читается), повёрнута в экране на −12° */
const RING_EULER = new THREE.Euler(THREE.MathUtils.degToRad(-40), 0, THREE.MathUtils.degToRad(-12), 'XYZ');

export class Satellites {
  readonly group = new THREE.Group();
  readonly meshes: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>[] = [];
  /** кольцо (0), экваторы спутников (1..5), связи (6..10) */
  readonly lines: LineSet;
  readonly axis = new THREE.Vector3(0, 1, 0).applyEuler(RING_EULER).normalize();
  readonly positions: THREE.Vector3[] = [];
  /** угол спутника на кольце (обороты); слот — конечное место */
  readonly slot: number[] = [];
  readonly along: number[] = [];
  /** видимость 0..1 и hover 0..1 */
  readonly show: number[] = [];
  readonly hover: number[] = [];
  private q = new THREE.Quaternion();
  private tmp = new THREE.Vector3();
  private eqBuf = new Float32Array(40 * 3);
  private linkBuf = new Float32Array(24 * 3);
  private mat: THREE.MeshPhysicalMaterial;

  constructor(resolution: THREE.Vector2, envWarm: THREE.Texture, envNight: THREE.Texture, envMix: THREE.IUniform<number>) {
    this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.axis);
    const specs = [{ points: circle(120, RING_R, this.axis), closed: true, opacity: LEVEL.mid, width: WIDTH.thin }];
    for (let i = 0; i < 5; i++) specs.push({ points: new Float32Array(40 * 3), closed: true, opacity: LEVEL.mid, width: WIDTH.thin });
    for (let i = 0; i < 5; i++) specs.push({ points: new Float32Array(24 * 3), closed: false, opacity: LEVEL.mid, width: WIDTH.thin });
    this.lines = new LineSet(specs, resolution);
    this.lines.drawAll(0, 0);
    this.mat = pearlMaterial(envWarm, envNight, envMix, { transparent: true, opacity: 1 });
    const geo = new THREE.SphereGeometry(SAT_R, 40, 28);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(geo, this.mat);
      m.renderOrder = 1;
      m.visible = false;
      this.meshes.push(m);
      this.group.add(m);
      // слоты: спереди-сверху, по кольцу; старт — за ядром (сзади)
      this.slot.push(0.06 + i * 0.2);
      this.along.push(this.slot[i] - 0.5);
      this.show.push(0);
      this.hover.push(0);
      this.positions.push(new THREE.Vector3());
    }
    this.group.add(this.lines.mesh);
    this.group.visible = false;
  }

  /** точка кольца по параметру t (обороты) */
  ringPoint(t: number, out: THREE.Vector3, r = RING_R) {
    const a = t * Math.PI * 2;
    return out.set(r * Math.cos(a), r * Math.sin(a), 0).applyQuaternion(this.q);
  }

  update(time: number, o: { ring: number; links: number; impulses: boolean; hovered: number }) {
    this.lines.draw(0, 0, o.ring);
    this.lines.opacity(0, LEVEL.mid);
    for (let i = 0; i < 5; i++) {
      const h = this.hover[i];
      const dim = o.hovered >= 0 && o.hovered !== i ? 0.25 : 1;
      const p = this.ringPoint(this.along[i], this.positions[i]);
      // спутник чуть выше кольца и вперёд при hover
      p.addScaledVector(this.axis, 0.02).multiplyScalar(1 + h * 0.06);
      const m = this.meshes[i];
      m.position.copy(p);
      m.visible = this.show[i] > 0.01;
      m.scale.setScalar(Math.max(0.001, this.show[i]) * (1 + h * 0.15));
      // экватор спутника: окружность вокруг оси кольца
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        this.tmp.set(Math.cos(a) * (SAT_R + 0.03), Math.sin(a) * (SAT_R + 0.03), 0).applyQuaternion(this.q).add(p);
        this.eqBuf[k * 3] = this.tmp.x;
        this.eqBuf[k * 3 + 1] = this.tmp.y;
        this.eqBuf[k * 3 + 2] = this.tmp.z;
      }
      this.lines.setPoints(1 + i, this.eqBuf);
      this.lines.draw(1 + i, 0, this.show[i]);
      this.lines.opacity(1 + i, (LEVEL.mid + h * (LEVEL.main - LEVEL.mid)) * dim);
      // связь ядро–спутник: от поверхности сферы к спутнику, лёгкий прогиб
      const dir = this.tmp.copy(p).normalize();
      const start = dir.clone().multiplyScalar(CORE_SCALE + 0.03);
      const end = p.clone().sub(dir.clone().multiplyScalar(SAT_R + 0.03));
      const mid = start.clone().lerp(end, 0.5).addScaledVector(this.axis, 0.08 * (i % 2 ? -1 : 1));
      const pts = samplePath(24, (t, v) => {
        v.copy(start).multiplyScalar((1 - t) * (1 - t)).addScaledVector(mid, 2 * (1 - t) * t).addScaledVector(end, t * t);
      });
      this.linkBuf.set(pts);
      this.lines.setPoints(6 + i, this.linkBuf);
      this.lines.draw(6 + i, 0, o.links);
      this.lines.opacity(6 + i, (LEVEL.mid + h * 0.32) * dim);
      // импульс: одна точка на связь раз в 2.5 с (на hover чаще)
      this.lines.dots(6 + i, o.impulses ? 1 : 0, (1 / 2.5) * (1 + h * 1.5), LEVEL.main);
    }
    this.lines.update(time);
  }

  dispose() {
    this.meshes[0]?.geometry.dispose();
    this.mat.dispose();
    this.lines.dispose();
  }
}
