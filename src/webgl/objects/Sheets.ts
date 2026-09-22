/**
 * S6 · ТЕНДЕРЫ И ПРАВО (BRIEF-3 §5): восемь листов бумаги 3:4 (толщина 0.004, цвет paper) с волосяной обводкой
 * ink 0.4 и мягкой тенью-спрайтом. Слетаются по одному и встают в кольцо вокруг сферы, слегка развёрнутые к камере;
 * потом хайрлайны соединяют их углы в многогранник; финал — кольцо-печать вокруг всего.
 * Hover тендерные: листы веером, один вперёд. Hover правовые: многогранник сжимается на 6 %, линии 0.72.
 */
import * as THREE from 'three';
import { LineSet, LEVEL, WIDTH, circle } from './LineSet';
import { pearlMaterial } from '../Environment';

export const SHEET_COUNT = 8;
const W = 0.3;
const H = 0.4;
/** кольцо картотеки ≈ 1.4 радиуса ядра (ядро на S6 — 0.86 атома), плоскость наклонена к камере ~45° (вид сверху) */
const RING_R = 1.2;
const AXIS = new THREE.Vector3(0.12, 0.72, 0.68).normalize();

export class Sheets {
  readonly group = new THREE.Group();
  readonly meshes: THREE.Mesh<THREE.BoxGeometry, THREE.MeshPhysicalMaterial>[] = [];
  readonly shadows: THREE.Sprite[] = [];
  /** обводки листов (0..7), рёбра многогранника (8..23), кольцо-печать (24) */
  readonly lines: LineSet;
  /** прилёт 0..1 на лист, веер 0..1, смыкание 0..1 */
  readonly arrive: number[] = [];
  fan = 0;
  close = 0;
  edges = 0;
  seal = 0;
  private q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), AXIS);
  private corners: THREE.Vector3[][] = [];
  private rectBuf = new Float32Array(4 * 3);
  private edgeBuf = new Float32Array(2 * 3);
  private mat: THREE.MeshPhysicalMaterial;
  private tmp = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private far: THREE.Vector3[] = [];

  constructor(resolution: THREE.Vector2, envWarm: THREE.Texture, envNight: THREE.Texture, envMix: THREE.IUniform<number>) {
    this.mat = pearlMaterial(envWarm, envNight, envMix, { color: 0xfaf8f4, roughness: 0.85, clearcoat: 0.05, sheen: 0.1, side: THREE.DoubleSide });
    const geo = new THREE.BoxGeometry(W, H, 0.004);
    const shadowTex = Sheets.shadowTexture();
    for (let i = 0; i < SHEET_COUNT; i++) {
      const m = new THREE.Mesh(geo, this.mat);
      m.renderOrder = 1;
      m.visible = false;
      this.meshes.push(m);
      this.group.add(m);
      const sm = new THREE.SpriteMaterial({ map: shadowTex, color: 0x1b1a18, transparent: true, opacity: 0.14, depthWrite: false, toneMapped: false });
      const sp = new THREE.Sprite(sm);
      sp.scale.set(W * 1.5, H * 1.4, 1);
      sp.visible = false;
      this.shadows.push(sp);
      this.group.add(sp);
      this.arrive.push(0);
      this.corners.push([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
      // стартовая точка прилёта: далеко, вразброс
      this.far.push(new THREE.Vector3(Math.cos(i * 2.3) * 5.5, 1.5 + Math.sin(i * 1.7) * 2.5, Math.sin(i * 2.3) * 4 - 1));
    }
    const specs = [];
    for (let i = 0; i < SHEET_COUNT; i++) specs.push({ points: new Float32Array(4 * 3), closed: true, opacity: LEVEL.mid, width: WIDTH.thin });
    for (let i = 0; i < SHEET_COUNT * 2; i++) specs.push({ points: new Float32Array(2 * 3), closed: false, opacity: LEVEL.mid, width: WIDTH.thin });
    specs.push({ points: circle(160, RING_R + 0.32, AXIS), closed: true, opacity: LEVEL.main, width: WIDTH.main });
    this.lines = new LineSet(specs, resolution);
    this.lines.drawAll(0, 0);
    this.group.add(this.lines.mesh);
    this.group.visible = false;
  }

  private static _shadow: THREE.Texture | null = null;
  static shadowTexture() {
    if (Sheets._shadow) return Sheets._shadow;
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    Sheets._shadow = t;
    return t;
  }

  update(time: number, o: { hoveredSheet: number }) {
    const shrink = 1 - this.close * 0.06;
    for (let i = 0; i < SHEET_COUNT; i++) {
      const a = this.arrive[i];
      const ease = a < 0.5 ? 4 * a * a * a : 1 - Math.pow(-2 * a + 2, 3) / 2;
      // слот на кольце (наклонённом), лист развёрнут к камере
      const ang = (i / SHEET_COUNT) * Math.PI * 2 + 0.35 + this.fan * 0.16 * (i % 2 ? 1 : -1);
      const r = RING_R * shrink + this.fan * 0.25;
      this.tmp.set(Math.cos(ang) * r, Math.sin(ang) * r, 0).applyQuaternion(this.q);
      const target = this.tmp.clone();
      if (o.hoveredSheet === i) target.z += 0.9 * this.fan;
      const pos = this.far[i].clone().lerp(target, ease);
      const m = this.meshes[i];
      m.position.copy(pos);
      // ориентация: лицом к камере с разворотом по кольцу и вращением при подлёте
      const face = new THREE.Vector3(0, 0, 1);
      this.tmpQ.setFromUnitVectors(face, new THREE.Vector3(Math.cos(ang) * 0.35, Math.sin(ang) * 0.15, 1).normalize());
      const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), (1 - ease) * 4 + this.fan * 0.3 * (i % 2 ? 1 : -1));
      m.quaternion.copy(this.tmpQ).multiply(spin);
      m.visible = a > 0.001;
      const shadow = this.shadows[i];
      shadow.position.copy(pos).add(new THREE.Vector3(0.05, -0.08, -0.06));
      shadow.visible = m.visible;
      (shadow.material as THREE.SpriteMaterial).opacity = 0.14 * ease;
      // углы листа в локальных координатах группы
      const hw = W / 2;
      const hh = H / 2;
      const cs = this.corners[i];
      cs[0].set(-hw, hh, 0.003).applyQuaternion(m.quaternion).add(pos);
      cs[1].set(hw, hh, 0.003).applyQuaternion(m.quaternion).add(pos);
      cs[2].set(hw, -hh, 0.003).applyQuaternion(m.quaternion).add(pos);
      cs[3].set(-hw, -hh, 0.003).applyQuaternion(m.quaternion).add(pos);
      for (let k = 0; k < 4; k++) {
        this.rectBuf[k * 3] = cs[k].x;
        this.rectBuf[k * 3 + 1] = cs[k].y;
        this.rectBuf[k * 3 + 2] = cs[k].z;
      }
      this.lines.setPoints(i, this.rectBuf);
      this.lines.draw(i, 0, ease);
      this.lines.opacity(i, LEVEL.mid + (o.hoveredSheet === i ? 0.32 : 0));
    }
    // рёбра многогранника: верхние и нижние углы соседних листов
    for (let i = 0; i < SHEET_COUNT; i++) {
      const j = (i + 1) % SHEET_COUNT;
      const pairs: Array<[THREE.Vector3, THREE.Vector3]> = [
        [this.corners[i][1], this.corners[j][0]],
        [this.corners[i][2], this.corners[j][3]],
      ];
      pairs.forEach((pr, k) => {
        this.edgeBuf[0] = pr[0].x;
        this.edgeBuf[1] = pr[0].y;
        this.edgeBuf[2] = pr[0].z;
        this.edgeBuf[3] = pr[1].x;
        this.edgeBuf[4] = pr[1].y;
        this.edgeBuf[5] = pr[1].z;
        const pi = SHEET_COUNT + i * 2 + k;
        this.lines.setPoints(pi, this.edgeBuf);
        const stagger = (i * 2 + k) / (SHEET_COUNT * 2);
        this.lines.draw(pi, 0, THREE.MathUtils.clamp((this.edges - stagger * 0.6) / 0.4, 0, 1));
        this.lines.opacity(pi, LEVEL.mid + this.close * (LEVEL.main - LEVEL.mid));
      });
    }
    // кольцо-печать
    const sealIdx = SHEET_COUNT * 3;
    this.lines.draw(sealIdx, 0, this.seal);
    this.lines.opacity(sealIdx, LEVEL.main);
    this.lines.mesh.scale.setScalar(1);
    this.lines.update(time);
  }

  dispose() {
    this.meshes[0]?.geometry.dispose();
    this.mat.dispose();
    this.shadows.forEach((s) => (s.material as THREE.SpriteMaterial).dispose());
    this.lines.dispose();
  }
}
