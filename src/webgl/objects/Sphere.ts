/**
 * Sphere — жемчужная сфера, единственный объёмный объект сюжета (BRIEF-3 §3).
 * Icosphere с UV (шов сзади), MeshPhysicalMaterial «жемчуг» (clearcoat + sheen), процедурные карты нормалей
 * и шероховатости, считаются на GPU при старте; мягкое дыхание вершин (simplex, нормали конечными разностями)
 * на HIGH/MID, на LOW геометрия статична. Фальшивое затенение низа: diffuse × mix(1, 0.78, …) по мировой нормали.
 * Сфера никогда не деформируется в фигуры.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL_SIMPLEX } from '../shaders/noise';
import { patchEnvBlend, patchNeutralToneMap } from '../Environment';

export interface SphereUniforms {
  uTime: THREE.IUniform<number>;
  uNoiseAmp: THREE.IUniform<number>;
  uNoiseFreq: THREE.IUniform<number>;
  uNoiseSpeed: THREE.IUniform<number>;
  uPointerDir: THREE.IUniform<THREE.Vector3>;
  uPointerAmt: THREE.IUniform<number>;
  uEnvMix: THREE.IUniform<number>;
  /** множитель фальшивого затенения низа (0.78 по BRIEF-3 §3.5) */
  uFloorShade: THREE.IUniform<number>;
  /** осветление к paper (S5, импульс формы) 0..1 */
  uLift: THREE.IUniform<number>;
}

/** Стартовые параметры материала (BRIEF-3 §3.1); доводка — в DECISIONS.md и ?debug */
export const PEARL_MATERIAL = {
  color: 0xcfcac2,
  metalness: 0,
  roughness: 1, // × карта шероховатости 0.32–0.46
  clearcoat: 0.7,
  clearcoatRoughness: 0.08,
  sheen: 0.45,
  sheenRoughness: 0.5,
  sheenColor: 0xfdfbf8,
  ior: 1.45,
  envMapIntensity: 1.0,
  specularIntensity: 0.9,
  normalScale: 0.06,
};

export const SPHERE_VERTEX_PARS = /* glsl */ `
uniform float uTime;
uniform float uNoiseAmp;
uniform float uNoiseFreq;
uniform float uNoiseSpeed;
uniform vec3 uPointerDir;
uniform float uPointerAmt;
varying float vWorldNy;
${GLSL_SIMPLEX}

float cmHeight(vec3 p, vec3 n) {
  float h = snoise(p * uNoiseFreq + vec3(0.0, uTime * uNoiseSpeed, uTime * 0.37 * uNoiseSpeed)) * uNoiseAmp;
  h += uPointerAmt * pow(max(dot(n, uPointerDir), 0.0), 4.0);
  return h;
}

// Смещённая поверхность и нормаль конечными разностями (касательная от фиксированной иррациональной оси)
void cmSurface(vec3 bp, vec3 bn, out vec3 P, out vec3 N) {
  vec3 up = vec3(0.3182, 0.6118, 0.7243);
  if (abs(dot(bn, up)) > 0.995) up = vec3(1.0, 0.0, 0.0);
  vec3 tng = normalize(cross(bn, up));
  vec3 btg = cross(bn, tng);
  const float e = 0.02;
  vec3 p1 = bp + tng * e;
  vec3 p2 = bp + btg * e;
  vec3 P0 = bp + bn * cmHeight(bp, bn);
  vec3 P1 = p1 + bn * cmHeight(p1, bn);
  vec3 P2 = p2 + bn * cmHeight(p2, bn);
  P = P0;
  N = normalize(cross(P1 - P0, P2 - P0));
}
`;

const SPHERE_BEGINNORMAL = /* glsl */ `
vec3 cmP; vec3 cmN;
#ifdef CM_DISPLACE
  cmSurface(position, normalize(normal), cmP, cmN);
#else
  cmP = position; cmN = normalize(normal);
#endif
vec3 objectNormal = cmN;
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif
vWorldNy = normalize(mat3(modelMatrix) * cmN).y;
`;

const SPHERE_BEGIN_VERTEX = /* glsl */ `
vec3 transformed = cmP;
#ifdef USE_ALPHAHASH
  vPosition = vec3( position );
#endif
`;

/** Карты поверхности на GPU: нормали из 3 октав simplex (тайлятся по u), шероховатость — мягкие пятна 0.32–0.46 */
const MAP_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const MAP_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uMode; // 0 — нормали, 1 — шероховатость
${GLSL_SIMPLEX}
// шум на цилиндре: бесшовный по u
float field(vec2 uv, float freq, float seed) {
  float a = uv.x * 6.2831853;
  vec3 p = vec3(cos(a), sin(a), uv.y * 2.0) * freq + seed;
  return snoise(p);
}
float height(vec2 uv) {
  return field(uv, 10.0, 1.7) * 0.5 + field(uv, 22.0, 5.1) * 0.32 + field(uv, 48.0, 9.3) * 0.18;
}
void main() {
  if (uMode < 0.5) {
    float e = 1.0 / 1024.0;
    float hx = height(vUv + vec2(e, 0.0)) - height(vUv - vec2(e, 0.0));
    float hy = height(vUv + vec2(0.0, e)) - height(vUv - vec2(0.0, e));
    // мягкая фактура: маленький наклон
    vec3 n = normalize(vec3(-hx * 3.0, -hy * 3.0, 1.0));
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  } else {
    float s = field(vUv, 3.5, 21.0) * 0.5 + 0.5;
    float r = mix(0.32, 0.46, smoothstep(0.2, 0.8, s));
    gl_FragColor = vec4(r, r, r, 1.0);
  }
}
`;

export function makeSurfaceMaps(renderer: THREE.WebGLRenderer, size: number): { normalMap: THREE.Texture; roughnessMap: THREE.Texture; dispose(): void } {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = { uMode: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: MAP_VERT, fragmentShader: MAP_FRAG, uniforms, depthTest: false, depthWrite: false });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const make = (mode: number) => {
    const rt = new THREE.WebGLRenderTarget(size, size, { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, colorSpace: THREE.NoColorSpace });
    uniforms.uMode.value = mode;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    return rt;
  };
  const nrt = make(0);
  const rrt = make(1);
  mat.dispose();
  return {
    normalMap: nrt.texture,
    roughnessMap: rrt.texture,
    dispose() {
      nrt.dispose();
      rrt.dispose();
    },
  };
}

export interface SphereOptions {
  /** detail для IcosahedronGeometry three: граней = 20·(detail+1)²; 63 → ~41k вершин, 31 → ~10k */
  detail: number;
  /** смещение вершин (дыхание); на LOW выключено */
  displace: boolean;
  envWarm: THREE.Texture;
  envNight: THREE.Texture;
  maps: { normalMap: THREE.Texture; roughnessMap: THREE.Texture };
}

export class Sphere {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshPhysicalMaterial;
  readonly uniforms: SphereUniforms;
  readonly vertexCount: number;

  constructor(opts: SphereOptions) {
    let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, opts.detail);
    geo.deleteAttribute('uv');
    geo = mergeVertices(geo);
    geo.computeVertexNormals();
    // сферические UV, шов — сзади (z < 0)
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      uv[i * 2] = Math.atan2(x, z) / (Math.PI * 2) + 0.5;
      uv[i * 2 + 1] = Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI + 0.5;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.1);
    this.geometry = geo;
    this.vertexCount = pos.count;

    this.uniforms = {
      uTime: { value: 0 },
      uNoiseAmp: { value: 0.005 },
      uNoiseFreq: { value: 0.9 },
      uNoiseSpeed: { value: 0.06 },
      uPointerDir: { value: new THREE.Vector3(0, 0, 1) },
      uPointerAmt: { value: 0 },
      uEnvMix: { value: 0 },
      uFloorShade: { value: 0.72 },
      uLift: { value: 0 },
    };

    const P = PEARL_MATERIAL;
    const mat = new THREE.MeshPhysicalMaterial({
      color: P.color,
      metalness: P.metalness,
      roughness: P.roughness,
      roughnessMap: opts.maps.roughnessMap,
      normalMap: opts.maps.normalMap,
      normalScale: new THREE.Vector2(P.normalScale, P.normalScale),
      clearcoat: P.clearcoat,
      clearcoatRoughness: P.clearcoatRoughness,
      sheen: P.sheen,
      sheenRoughness: P.sheenRoughness,
      sheenColor: new THREE.Color(P.sheenColor),
      ior: P.ior,
      specularIntensity: P.specularIntensity,
      envMap: opts.envWarm,
      envMapIntensity: P.envMapIntensity,
      emissive: new THREE.Color(0xfaf8f4),
      emissiveIntensity: 0,
    });
    mat.defines = { ...(mat.defines || {}) };
    if (opts.displace) mat.defines.CM_DISPLACE = '';
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { uTime: u.uTime, uNoiseAmp: u.uNoiseAmp, uNoiseFreq: u.uNoiseFreq, uNoiseSpeed: u.uNoiseSpeed, uPointerDir: u.uPointerDir, uPointerAmt: u.uPointerAmt, uFloorShade: u.uFloorShade, uLift: u.uLift });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${SPHERE_VERTEX_PARS}`)
        .replace('#include <beginnormal_vertex>', SPHERE_BEGINNORMAL)
        .replace('#include <begin_vertex>', SPHERE_BEGIN_VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying float vWorldNy;\nuniform float uFloorShade;\nuniform float uLift;`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // низ сферы плотнее: ambient occlusion от «пола» (BRIEF-3 §3.5); осветление к paper по uLift
          diffuseColor.rgb *= mix(1.0, uFloorShade, smoothstep(0.2, -0.8, vWorldNy));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.98, 0.972, 0.957), uLift * 0.5);`,
        );
    };
    mat.customProgramCacheKey = () => `pearl${opts.displace ? '-d' : ''}|envblend`;
    patchEnvBlend(mat, opts.envNight, { uEnvMix: u.uEnvMix });
    patchNeutralToneMap(mat);
    this.material = mat;

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sphere';
    this.mesh.renderOrder = 1;
  }

  update(time: number) {
    this.uniforms.uTime.value = time;
  }


  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
