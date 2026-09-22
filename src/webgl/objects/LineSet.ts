/**
 * LineSet — пачка линий туши одним draw call (BRIEF-3 §4). Линии постоянной экранной ширины с мягкой
 * кромкой, три уровня непрозрачности (0.72 / 0.4 / 0.18), прячутся за сферой (depth test), рисуются
 * и стираются окном [draw0, draw1] по длине, по ним могут бежать точки-импульсы.
 * Состояние каждого пути (окно рисования, непрозрачность, ширина, точки) лежит в DataTexture:
 * 2 текселя RGBA на путь, обновляется целиком раз в кадр.
 */
import * as THREE from 'three';

export const INK = new THREE.Color(0x1b1a18);
/** тушь в теме night: светлая, чуть теплее paper, чтобы уровни 0.72/0.4/0.18 читались на графите */
export const INK_NIGHT = new THREE.Color(0xe4ded4);
export const LEVEL: { main: number; mid: number; faint: number } = { main: 0.72, mid: 0.4, faint: 0.18 };
export const WIDTH: { main: number; thin: number } = { main: 1.25, thin: 1.0 };

const VERT = /* glsl */ `
attribute vec3 aPrev;
attribute vec3 aNext;
attribute float aSide;
attribute float aT;
attribute float aPath;
uniform vec2 uResolution;
uniform sampler2D uPathTex;
uniform float uPathTexW;
varying float vT;
varying float vSide;
varying float vPx;
varying float vOpacity;
varying float vDraw0;
varying float vDraw1;
varying vec3 vDots; // count, speed, opacity
varying vec3 vLocal;
vec4 texel(float i) { return texture2D(uPathTex, vec2((i + 0.5) / uPathTexW, 0.5)); }
void main() {
  vLocal = position;
  vec4 a = texel(aPath * 2.0);
  vec4 b = texel(aPath * 2.0 + 1.0);
  vDraw0 = a.x; vDraw1 = a.y; vOpacity = a.z; float w = a.w;
  vDots = b.xyz;
  vec4 cur = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 nxt = projectionMatrix * modelViewMatrix * vec4(aNext, 1.0);
  vec4 prv = projectionMatrix * modelViewMatrix * vec4(aPrev, 1.0);
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 sc = cur.xy / cur.w * aspect;
  vec2 sn = nxt.xy / nxt.w * aspect;
  vec2 sp = prv.xy / prv.w * aspect;
  vec2 d1 = sn - sc;
  vec2 d2 = sc - sp;
  vec2 dir = normalize(length(d1) > 1e-6 && length(d2) > 1e-6 ? normalize(d1) + normalize(d2) : (length(d1) > 1e-6 ? d1 : d2));
  vec2 nrm = vec2(-dir.y, dir.x);
  // геометрия на 1px шире с каждой стороны, покрытие считает фрагмент
  vec2 off = nrm * aSide * (w + 2.0) / uResolution.y;
  off /= aspect;
  cur.xy += off * cur.w;
  gl_Position = cur;
  vT = aT;
  vSide = aSide;
  vPx = w;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uTime;
uniform float uGlobal;
uniform float uClipY;   // срез по локальному y (скан S2): uClipDir 1 — скрыто выше, -1 — скрыто ниже
uniform float uClipDir;
varying vec3 vLocal;
varying float vT;
varying float vSide;
varying float vPx;
varying float vOpacity;
varying float vDraw0;
varying float vDraw1;
varying vec3 vDots;
void main() {
  if (vT < vDraw0 || vT > vDraw1) discard;
  if ((vLocal.y - uClipY) * uClipDir > 0.0) discard;
  float dpx = abs(vSide) * (vPx * 0.5 + 1.0);
  float cov = clamp(vPx * 0.5 - dpx + 0.5, 0.0, 1.0);
  float a = vOpacity;
  // кончик рисования чуть плотнее, конец окна — мягкий
  a *= smoothstep(vDraw0, vDraw0 + 0.01, vT) * smoothstep(vDraw1, vDraw1 - 0.01, vT);
  if (vDots.x > 0.0) {
    float d = fract(vT * vDots.x - uTime * vDots.y);
    float dot_ = smoothstep(0.09, 0.0, min(d, 1.0 - d));
    a = mix(a, vDots.z, dot_);
  }
  a *= cov * uGlobal;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

export interface PathSpec {
  points: Float32Array;
  closed?: boolean;
  opacity?: number;
  width?: number;
}

interface PathState {
  offset: number; // первая вершина (в точках)
  count: number; // точек в пути (с повтором первой для замкнутых)
  closed: boolean;
  draw0: number;
  draw1: number;
  opacity: number;
  width: number;
  dotCount: number;
  dotSpeed: number;
  dotOpacity: number;
}

export class LineSet {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly paths: PathState[] = [];
  readonly uniforms: { uResolution: THREE.IUniform<THREE.Vector2>; uPathTex: THREE.IUniform<THREE.DataTexture>; uPathTexW: THREE.IUniform<number>; uColor: THREE.IUniform<THREE.Color>; uTime: THREE.IUniform<number>; uGlobal: THREE.IUniform<number>; uClipY: THREE.IUniform<number>; uClipDir: THREE.IUniform<number> };
  private posAttr: THREE.BufferAttribute;
  private prevAttr: THREE.BufferAttribute;
  private nextAttr: THREE.BufferAttribute;
  private tex: THREE.DataTexture;
  private texData: Float32Array;
  private dirty = true;

  constructor(specs: PathSpec[], resolution: THREE.Vector2, opts: { color?: THREE.ColorRepresentation } = {}) {
    let total = 0;
    for (const s of specs) total += s.points.length / 3 + (s.closed ? 1 : 0);
    const pos = new Float32Array(total * 2 * 3);
    const prev = new Float32Array(total * 2 * 3);
    const next = new Float32Array(total * 2 * 3);
    const side = new Float32Array(total * 2);
    const t = new Float32Array(total * 2);
    const pathIdx = new Float32Array(total * 2);
    const idx: number[] = [];
    let o = 0;
    specs.forEach((s, pi) => {
      const n = s.points.length / 3 + (s.closed ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const v = o + i;
        side[v * 2] = 1;
        side[v * 2 + 1] = -1;
        t[v * 2] = t[v * 2 + 1] = i / (n - 1);
        pathIdx[v * 2] = pathIdx[v * 2 + 1] = pi;
        if (i < n - 1) {
          const a = v * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      this.paths.push({ offset: o, count: n, closed: Boolean(s.closed), draw0: 0, draw1: 1, opacity: s.opacity ?? LEVEL.mid, width: s.width ?? WIDTH.thin, dotCount: 0, dotSpeed: 0, dotOpacity: LEVEL.main });
      o += n;
    });
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.prevAttr = new THREE.BufferAttribute(prev, 3).setUsage(THREE.DynamicDrawUsage);
    this.nextAttr = new THREE.BufferAttribute(next, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aPrev', this.prevAttr);
    g.setAttribute('aNext', this.nextAttr);
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    g.setAttribute('aPath', new THREE.BufferAttribute(pathIdx, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

    const texW = Math.max(2, specs.length * 2);
    this.texData = new Float32Array(texW * 4);
    this.tex = new THREE.DataTexture(this.texData, texW, 1, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.uniforms = {
      uResolution: { value: resolution },
      uPathTex: { value: this.tex },
      uPathTexW: { value: texW },
      uColor: { value: new THREE.Color(opts.color ?? INK) },
      uTime: { value: 0 },
      uGlobal: { value: 1 },
      uClipY: { value: 1e9 },
      uClipDir: { value: 1 },
    };
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    specs.forEach((s, i) => this.setPoints(i, s.points));
  }

  /** Обновить точки пути (длина = точек пути × 3, без повтора первой для замкнутых) */
  setPoints(i: number, points: Float32Array) {
    const p = this.paths[i];
    const n = points.length / 3;
    const pos = this.posAttr.array as Float32Array;
    const prev = this.prevAttr.array as Float32Array;
    const next = this.nextAttr.array as Float32Array;
    const total = p.count;
    for (let k = 0; k < total; k++) {
      const src = p.closed ? k % n : k;
      const ip = p.closed ? (src - 1 + n) % n : Math.max(0, src - 1);
      const inx = p.closed ? (src + 1) % n : Math.min(n - 1, src + 1);
      for (let s = 0; s < 2; s++) {
        const o = ((p.offset + k) * 2 + s) * 3;
        pos[o] = points[src * 3];
        pos[o + 1] = points[src * 3 + 1];
        pos[o + 2] = points[src * 3 + 2];
        prev[o] = points[ip * 3];
        prev[o + 1] = points[ip * 3 + 1];
        prev[o + 2] = points[ip * 3 + 2];
        next[o] = points[inx * 3];
        next[o + 1] = points[inx * 3 + 1];
        next[o + 2] = points[inx * 3 + 2];
      }
    }
    this.posAttr.needsUpdate = true;
    this.prevAttr.needsUpdate = true;
    this.nextAttr.needsUpdate = true;
  }

  /** окно рисования 0..1 по длине: draw(i, 0, t) — рисуется, draw(i, t, 1) — стирается с начала */
  draw(i: number, a: number, b: number) {
    const p = this.paths[i];
    p.draw0 = a;
    p.draw1 = b;
    this.dirty = true;
  }
  opacity(i: number, v: number) {
    this.paths[i].opacity = v;
    this.dirty = true;
  }
  width(i: number, v: number) {
    this.paths[i].width = v;
    this.dirty = true;
  }
  /** бегущие точки: count — точек на путь, speed — путей в секунду, opacity точек */
  dots(i: number, count: number, speed: number, opacity = LEVEL.main) {
    const p = this.paths[i];
    p.dotCount = count;
    p.dotSpeed = speed;
    p.dotOpacity = opacity;
    this.dirty = true;
  }
  drawAll(a: number, b: number) {
    for (let i = 0; i < this.paths.length; i++) this.draw(i, a, b);
  }
  opacityAll(v: number) {
    for (let i = 0; i < this.paths.length; i++) this.opacity(i, v);
  }

  update(time: number) {
    this.uniforms.uTime.value = time;
    if (!this.dirty) return;
    this.dirty = false;
    const d = this.texData;
    for (let i = 0; i < this.paths.length; i++) {
      const p = this.paths[i];
      const o = i * 8;
      d[o] = p.draw0;
      d[o + 1] = p.draw1;
      d[o + 2] = p.opacity;
      d[o + 3] = p.width;
      d[o + 4] = p.dotCount;
      d[o + 5] = p.dotSpeed;
      d[o + 6] = p.dotOpacity;
      d[o + 7] = 0;
    }
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.tex.dispose();
  }
}

/* ---------- генераторы точек ---------- */

/** Точки вдоль функции f(t), t ∈ [0,1] */
export function samplePath(n: number, f: (t: number, out: THREE.Vector3) => void): Float32Array {
  const out = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    f(i / (n - 1), v);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

/** Замкнутая кривая: n точек без повтора первой (для closed-путей) */
export function sampleLoop(n: number, f: (t: number, out: THREE.Vector3) => void): Float32Array {
  const out = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    f(i / n, v);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

/** Эллипс a×b в плоскости xy, повёрнутый матрицей orient */
export function ellipse(n: number, a: number, b: number, orient: THREE.Matrix3, phase = 0): Float32Array {
  return sampleLoop(n, (t, v) => {
    const ang = (t + phase) * Math.PI * 2;
    v.set(a * Math.cos(ang), b * Math.sin(ang), 0).applyMatrix3(orient);
  });
}

/** Точка эллипса по параметру t (обороты) */
export function ellipsePoint(t: number, a: number, b: number, orient: THREE.Matrix3, phase: number, out: THREE.Vector3) {
  const ang = (t + phase) * Math.PI * 2;
  return out.set(a * Math.cos(ang), b * Math.sin(ang), 0).applyMatrix3(orient);
}

/** Окружность радиуса r вокруг оси axis (единичный вектор), центр c */
export function circle(n: number, r: number, axis: THREE.Vector3, c = new THREE.Vector3()): Float32Array {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.clone().normalize());
  return sampleLoop(n, (t, v) => {
    const ang = t * Math.PI * 2;
    v.set(r * Math.cos(ang), r * Math.sin(ang), 0).applyQuaternion(q).add(c);
  });
}
