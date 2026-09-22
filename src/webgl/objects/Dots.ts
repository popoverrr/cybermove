/**
 * Dots — точки туши (электроны, спутники, узлы, импульсы) одним draw call (BRIEF-3 §4): плотные круги
 * `--ink` 5–6px постоянного экранного размера с мягкой кромкой, без свечения, прячутся за сферой (depth test).
 * Позиции и непрозрачности обновляются каждый кадр — точек мало (≤ 64 на экран).
 */
import * as THREE from 'three';
import { INK } from './LineSet';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aOpacity;
uniform float uDpr;
varying float vOpacity;
varying float vSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // размер в px без перспективы; +2px на мягкую кромку
  vSize = aSize;
  gl_PointSize = (aSize + 2.0) * uDpr;
  vOpacity = aOpacity;
}
`;
const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uGlobal;
uniform vec2 uFade;      // экранная полоса видимости в device px (низ, верх): ниже и выше линии гаснут (BRIEF-4 §1.2, §1.3)
varying float vOpacity;
varying float vSize;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // расстояние до центра в px относительно радиуса точки, переход 1px
  float dpx = length(c) * (vSize + 2.0);
  float cov = clamp(vSize * 0.5 - dpx + 0.5, 0.0, 1.0);
  // шапка и футер: сцена в их полосы не заходит
  float fade = smoothstep(uFade.x - 24.0, uFade.x, gl_FragCoord.y) * smoothstep(uFade.y + 24.0, uFade.y, gl_FragCoord.y);
  float a = cov * vOpacity * uGlobal * fade;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

export class Dots {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly count: number;
  readonly uniforms: { uDpr: THREE.IUniform<number>; uColor: THREE.IUniform<THREE.Color>; uGlobal: THREE.IUniform<number>; uFade: THREE.IUniform<THREE.Vector2> };
  private pos: THREE.BufferAttribute;
  private size: THREE.BufferAttribute;
  private opacity: THREE.BufferAttribute;

  constructor(count: number, opts: { size?: number; opacity?: number; color?: THREE.ColorRepresentation; fade?: THREE.IUniform<THREE.Vector2> } = {}) {
    this.count = count;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.BufferAttribute(new Float32Array(count).fill(opts.size ?? 5.5), 1).setUsage(THREE.DynamicDrawUsage);
    this.opacity = new THREE.BufferAttribute(new Float32Array(count).fill(opts.opacity ?? 0), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('aSize', this.size);
    g.setAttribute('aOpacity', this.opacity);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
    this.uniforms = { uDpr: { value: 1 }, uColor: { value: new THREE.Color(opts.color ?? INK) }, uGlobal: { value: 1 }, uFade: opts.fade ?? { value: new THREE.Vector2(-1e4, 1e4) } };
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
    this.points.renderOrder = 3;
  }

  set(i: number, x: number, y: number, z: number) {
    const a = this.pos.array as Float32Array;
    a[i * 3] = x;
    a[i * 3 + 1] = y;
    a[i * 3 + 2] = z;
    this.pos.needsUpdate = true;
  }
  setV(i: number, v: THREE.Vector3) {
    this.set(i, v.x, v.y, v.z);
  }
  setOpacity(i: number, v: number) {
    (this.opacity.array as Float32Array)[i] = v;
    this.opacity.needsUpdate = true;
  }
  setSize(i: number, v: number) {
    (this.size.array as Float32Array)[i] = v;
    this.size.needsUpdate = true;
  }
  getOpacity(i: number) {
    return (this.opacity.array as Float32Array)[i];
  }
  setDpr(dpr: number) {
    this.uniforms.uDpr.value = dpr;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
