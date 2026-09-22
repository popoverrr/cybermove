/**
 * Пыль (BRIEF-3 §4): облако орбиталей |ψ|² (1s → 2p → 3d, медленное перетекание) как очень тонкая деталь
 * только на S1 и S8 — 8–12k точек на HIGH, 1px, ink 0.22, в 1.6 радиуса от сферы. На LOW выключена.
 * Точки прячутся за сферой (depth test).
 */
import * as THREE from 'three';
import { GLSL_HASH, GLSL_SIMPLEX } from '../shaders/noise';
import { mulberry32, orbital1s, orbital2p, orbital3d } from './orbitals';
import { INK } from './LineSet';

const VERT = /* glsl */ `
attribute vec3 aTargetA;
attribute vec3 aTargetB;
attribute vec4 aSeed;
uniform float uTime;
uniform float uMix;
uniform float uDpr;
uniform float uDrift;
varying float vAlpha;
${GLSL_HASH}
${GLSL_SIMPLEX}
void main() {
  vec3 p = mix(aTargetA, aTargetB, uMix);
  // медленный дрейф: одна октава simplex, чтобы облако жило, но не кипело
  p += uDrift * vec3(snoise(p * 0.5 + uTime * 0.05), snoise(p * 0.5 + 7.1 + uTime * 0.05), snoise(p * 0.5 - 3.3 + uTime * 0.05));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, 1.0 * uDpr);
  vAlpha = 0.6 + 0.4 * aSeed.x;
}
`;
const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float a = vAlpha * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

const CYCLE = ['1s', '2p', '3d'] as const;

export class Dust {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly count: number;
  readonly uniforms: { uTime: THREE.IUniform<number>; uMix: THREE.IUniform<number>; uDpr: THREE.IUniform<number>; uDrift: THREE.IUniform<number>; uColor: THREE.IUniform<THREE.Color>; uOpacity: THREE.IUniform<number> };
  private fields: Float32Array[];
  private targetA: THREE.BufferAttribute;
  private targetB: THREE.BufferAttribute;
  private slot = -1;

  constructor(count: number) {
    this.count = count;
    const rng = mulberry32(20260922);
    // радиус облака: 90-й процентиль ≈ 1.5 R — сосредоточено у сферы
    this.fields = [orbital1s(count, mulberry32(11), 1.45), orbital2p(count, mulberry32(12), 1.55), orbital3d(count, mulberry32(13), 1.6)];
    const g = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seeds[i] = rng();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.targetA = new THREE.BufferAttribute(new Float32Array(this.fields[0]), 3).setUsage(THREE.DynamicDrawUsage);
    this.targetB = new THREE.BufferAttribute(new Float32Array(this.fields[1]), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aTargetA', this.targetA);
    g.setAttribute('aTargetB', this.targetB);
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
    this.uniforms = { uTime: { value: 0 }, uMix: { value: 0 }, uDpr: { value: 1 }, uDrift: { value: 0.05 }, uColor: { value: INK.clone() }, uOpacity: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      premultipliedAlpha: true,
      toneMapped: false,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.points.visible = false;
  }

  /** медленное перетекание орбиталей: 6.5 с на форму */
  update(time: number, opacity: number, dpr: number) {
    this.uniforms.uTime.value = time;
    this.uniforms.uDpr.value = dpr;
    this.uniforms.uOpacity.value = opacity;
    this.points.visible = opacity > 0.003;
    const SLOT = 6.5;
    const slot = Math.floor(time / SLOT);
    const f = (time % SLOT) / SLOT;
    if (slot !== this.slot) {
      this.slot = slot;
      (this.targetA.array as Float32Array).set(this.fields[slot % CYCLE.length]);
      (this.targetB.array as Float32Array).set(this.fields[(slot + 1) % CYCLE.length]);
      this.targetA.needsUpdate = true;
      this.targetB.needsUpdate = true;
    }
    const s = THREE.MathUtils.smoothstep(f, 0.55, 0.98);
    this.uniforms.uMix.value = s;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
