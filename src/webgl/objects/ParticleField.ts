/**
 * ParticleField — THREE.Points со своим шейдером (BRIEF-2 §4.4): тонкая тёмная пыль.
 * У частицы текущая (aTargetA) и следующая (aTargetB) цели плюс seed. Смена цели — подмена буфера.
 * Между целями curl-noise. Цвет umber → ink по глубине (ближе — темнее), размер 1–1.5px,
 * обычное альфа-смешивание (premultiplied), без additive, без дымки и искр.
 */
import * as THREE from 'three';
import { GLSL_HASH, GLSL_SIMPLEX, GLSL_CURL } from '../shaders/noise';

const VERT = /* glsl */ `
attribute vec3 aTargetA;
attribute vec3 aTargetB;
attribute vec4 aSeed;
uniform float uTime;
uniform float uMix;
uniform float uCurlAmp;
uniform float uCurlFreq;
uniform float uCurlSpeed;
uniform float uSize;
uniform float uDpr;
uniform float uJitter;
uniform float uDepthNear;
uniform float uDepthFar;
uniform vec3 uColorNear;
uniform vec3 uColorFar;
uniform float uSwirl;
varying float vAlpha;
varying vec3 vColor;
${GLSL_HASH}
${GLSL_SIMPLEX}
${GLSL_CURL}

void main() {
  vec3 p = mix(aTargetA, aTargetB, uMix);
  float ph = aSeed.z * 6.2831853;
  #ifdef CM_CURL
    vec3 c = curlNoise(p * uCurlFreq + vec3(uTime * uCurlSpeed) + aSeed.xyz * 2.0);
    p += c * uCurlAmp * (0.5 + aSeed.w);
  #else
    p += uCurlAmp * 0.5 * vec3(snoise(p * uCurlFreq + uTime * uCurlSpeed), snoise(p * uCurlFreq + 7.1 + uTime * uCurlSpeed), snoise(p * uCurlFreq - 3.3 + uTime * uCurlSpeed));
  #endif
  // медленное закручивание вокруг оси y (орбитальное «дыхание»)
  float sw = uSwirl * uTime * (0.6 + 0.8 * aSeed.y);
  float cs = cos(sw); float sn = sin(sw);
  p.xz = mat2(cs, -sn, sn, cs) * p.xz;
  p += uJitter * vec3(sin(uTime * 0.9 + ph), cos(uTime * 0.7 + ph * 1.3), sin(uTime * 0.8 + ph * 0.7));

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = -mv.z;
  float near = smoothstep(uDepthFar, uDepthNear, depth);
  // 1–1.5 px: лёгкий разброс по seed, чуть крупнее ближе к камере
  float size = uSize * (0.8 + 0.5 * aSeed.y) * (0.75 + 0.5 * near);
  gl_PointSize = clamp(size * uDpr, 1.0, 2.2 * uDpr);
  vAlpha = mix(0.45, 1.0, near) * (0.55 + 0.45 * aSeed.x);
  vColor = mix(uColorFar, uColorNear, near);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uOpacity;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.18, d) * vAlpha * uOpacity;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface ParticleUniforms {
  uTime: THREE.IUniform<number>;
  uMix: THREE.IUniform<number>;
  uCurlAmp: THREE.IUniform<number>;
  uCurlFreq: THREE.IUniform<number>;
  uCurlSpeed: THREE.IUniform<number>;
  uSize: THREE.IUniform<number>;
  uDpr: THREE.IUniform<number>;
  uJitter: THREE.IUniform<number>;
  uDepthNear: THREE.IUniform<number>;
  uDepthFar: THREE.IUniform<number>;
  uColorNear: THREE.IUniform<THREE.Color>;
  uColorFar: THREE.IUniform<THREE.Color>;
  uSwirl: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
}

export class ParticleField {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
  readonly uniforms: ParticleUniforms;
  readonly count: number;
  private targetA: THREE.BufferAttribute;
  private targetB: THREE.BufferAttribute;
  private nameA = '';
  private nameB = '';

  constructor(count: number, seedRng: () => number, opts: { curl: boolean; dpr: number }) {
    this.count = count;
    const geo = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = seedRng();
      seeds[i * 4 + 1] = seedRng();
      seeds[i * 4 + 2] = seedRng();
      seeds[i * 4 + 3] = seedRng();
    }
    const pos = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.targetA = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    this.targetB = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    this.targetA.setUsage(THREE.DynamicDrawUsage);
    this.targetB.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aTargetA', this.targetA);
    geo.setAttribute('aTargetB', this.targetB);
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);
    this.geometry = geo;

    this.uniforms = {
      uTime: { value: 0 },
      uMix: { value: 0 },
      uCurlAmp: { value: 0.0 },
      uCurlFreq: { value: 0.35 },
      uCurlSpeed: { value: 0.12 },
      uSize: { value: 1.2 },
      uDpr: { value: opts.dpr },
      uJitter: { value: 0.012 },
      uDepthNear: { value: 4.0 },
      uDepthFar: { value: 12.0 },
      uColorNear: { value: new THREE.Color(0x1b1a18) }, // --ink
      uColorFar: { value: new THREE.Color(0x8a8177) }, // --umber
      uSwirl: { value: 0.02 },
      uOpacity: { value: 0.35 },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      premultipliedAlpha: true,
      defines: opts.curl ? { CM_CURL: '' } : {},
    });
    this.material = mat;
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.name = 'particles';
  }

  /** Заменить цель A или B новым буфером (длина ≥ count*3). name — для дедупликации. */
  setTarget(slot: 'A' | 'B', data: Float32Array, name: string) {
    const attr = slot === 'A' ? this.targetA : this.targetB;
    const cur = slot === 'A' ? this.nameA : this.nameB;
    if (cur === name) return;
    (attr.array as Float32Array).set(data.subarray(0, this.count * 3));
    attr.needsUpdate = true;
    if (slot === 'A') this.nameA = name;
    else this.nameB = name;
  }

  get targets() {
    return { a: this.nameA, b: this.nameB };
  }

  /** Сделать B текущей (A := B) — вызывать при uMix = 1 перед назначением новой B. */
  commit() {
    if (this.nameA === this.nameB) return;
    (this.targetA.array as Float32Array).set(this.targetB.array as Float32Array);
    this.targetA.needsUpdate = true;
    this.nameA = this.nameB;
    this.uniforms.uMix.value = 0;
  }

  setDrawCount(n: number) {
    this.geometry.setDrawRange(0, Math.min(n, this.count));
  }

  update(time: number) {
    this.uniforms.uTime.value = time;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
