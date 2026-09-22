/**
 * Процедурное студийное окружение (BRIEF-2 §4.2): без HDRI-файлов и без синих панелей.
 * Сцена из emissive-плоскостей прогоняется через PMREMGenerator.fromScene(). Один тёплый пресет
 * (большой мягкий ключевой софтбокс сверху-слева, слабый заполняющий спереди, рефлекс цвета sand снизу,
 * светло-тёплые стены) и второй, чуть контрастнее, для экранов stone и clay.
 * Смешение пресетов — в шейдере материала (patchEnvBlend), движение бликов — scene.environmentRotation.
 */
import * as THREE from 'three';

export interface StudioPreset {
  key: 'warm' | 'crisp';
  build(scene: THREE.Scene): void;
}

function panel(scene: THREE.Scene, w: number, h: number, color: THREE.ColorRepresentation, intensity: number, pos: THREE.Vector3, lookAt = new THREE.Vector3(0, 0, 0)) {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  const mat = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.copy(pos);
  mesh.lookAt(lookAt);
  scene.add(mesh);
  return mesh;
}

/** Стены студии: тёплая коробка, пол — рефлекс цвета sand, потолок светлее */
function shell(scene: THREE.Scene, walls: THREE.ColorRepresentation, floor: number, ceil: number) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(40, 30, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(walls), side: THREE.BackSide, toneMapped: false }));
  scene.add(box);
  panel(scene, 40, 40, 0xe9e4dc, floor, new THREE.Vector3(0, -6, 0));
  panel(scene, 40, 40, 0xfff7ec, ceil, new THREE.Vector3(0, 9, 0));
}

export const WARM_STUDIO: StudioPreset = {
  key: 'warm',
  build(scene) {
    scene.background = new THREE.Color(0x85817b);
    shell(scene, 0x7d7973, 0.42, 0.7);
    // ключевой софтбокс сверху-слева: большой и мягкий — освещённая сторона сферы сверху-слева
    panel(scene, 9, 6, 0xfffaf4, 3.2, new THREE.Vector3(-5.5, 6.0, 4.0));
    // заполняющий спереди, слабее
    panel(scene, 8, 5, 0xf8f5f0, 0.6, new THREE.Vector3(1.5, 0.5, 9.0));
    // рефлекс снизу цвета sand
    panel(scene, 10, 3, 0xe9e4dc, 0.5, new THREE.Vector3(2.0, -5.5, 3.0));
    // правая стена темнее: тень справа-снизу читается
    panel(scene, 6, 12, 0x57534e, 0.8, new THREE.Vector3(9.0, -1.0, -2.0));
  },
};

export const CRISP_STUDIO: StudioPreset = {
  key: 'crisp',
  build(scene) {
    scene.background = new THREE.Color(0x76726c);
    shell(scene, 0x6b6762, 0.35, 0.55);
    panel(scene, 8, 5, 0xfffaf4, 4.2, new THREE.Vector3(-5.5, 6.2, 4.0));
    panel(scene, 7, 4, 0xf8f5f0, 0.4, new THREE.Vector3(1.5, 0.5, 9.0));
    panel(scene, 10, 3, 0xe9e4dc, 0.45, new THREE.Vector3(2.0, -5.5, 3.0));
    panel(scene, 6, 12, 0x46433f, 0.8, new THREE.Vector3(9.0, -1.0, -2.0));
  },
};

export interface EnvironmentMaps {
  warm: THREE.Texture;
  crisp: THREE.Texture;
  dispose(): void;
}

export function buildEnvironments(renderer: THREE.WebGLRenderer, size = 256): EnvironmentMaps {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const make = (preset: StudioPreset) => {
    const scene = new THREE.Scene();
    preset.build(scene);
    // sigma даёт мягкость краям софтбоксов
    const rt = pmrem.fromScene(scene, 0.06, 0.1, 100, { size });
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
    return rt;
  };
  const warmRt = make(WARM_STUDIO);
  const crispRt = make(CRISP_STUDIO);
  pmrem.dispose();
  return {
    warm: warmRt.texture,
    crisp: crispRt.texture,
    dispose() {
      warmRt.dispose();
      crispRt.dispose();
    },
  };
}

/**
 * Патч MeshPhysicalMaterial: второй envMap и uEnvMix для непрерывного смешения двух студий.
 * Заменяет textureCubeUV(envMap, …) на смесь двух PMREM-текстур одинакового размера.
 */
export function patchEnvBlend(material: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial, env2: THREE.Texture, uniforms: { uEnvMix: THREE.IUniform<number> }) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    shader.uniforms.envMap2 = { value: env2 };
    shader.uniforms.uEnvMix = uniforms.uEnvMix;
    const chunk = THREE.ShaderChunk.envmap_physical_pars_fragment
      .replace(/textureCubeUV\(\s*envMap,/g, 'sampleEnvBlend(');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <envmap_physical_pars_fragment>',
      /* glsl */ `
      uniform sampler2D envMap2;
      uniform float uEnvMix;
      #ifdef ENVMAP_TYPE_CUBE_UV
      vec4 sampleEnvBlend(vec3 dir, float roughness) {
        vec4 a = textureCubeUV(envMap, dir, roughness);
        if (uEnvMix <= 0.001) return a;
        vec4 b = textureCubeUV(envMap2, dir, roughness);
        return mix(a, b, uEnvMix);
      }
      #endif
      ${chunk}`,
    );
  };
  const prevKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${prevKey.call(material)}|envblend`;
  material.needsUpdate = true;
}

/** Матовый жемчуг / гипс (BRIEF-2 §4.1) — общий рецепт для ядра, узлов и пластин */
export const PEARL = {
  color: 0xd8d3cb,
  metalness: 0.03,
  roughness: 0.62,
  clearcoat: 0.12,
  clearcoatRoughness: 0.5,
  sheen: 0.22,
  sheenRoughness: 0.6,
  sheenColor: 0xfffaf4,
  envMapIntensity: 0.45,
} as const;

export function pearlMaterial(envWarm: THREE.Texture, envCrisp: THREE.Texture, envMix: THREE.IUniform<number>, over: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: PEARL.color,
    metalness: PEARL.metalness,
    roughness: PEARL.roughness,
    clearcoat: PEARL.clearcoat,
    clearcoatRoughness: PEARL.clearcoatRoughness,
    sheen: PEARL.sheen,
    sheenRoughness: PEARL.sheenRoughness,
    sheenColor: new THREE.Color(PEARL.sheenColor),
    envMap: envWarm,
    envMapIntensity: PEARL.envMapIntensity,
    ...over,
  });
  patchEnvBlend(mat, envCrisp, { uEnvMix: envMix });
  return mat;
}

/** Ключевой и заполняющий свет: направленная светотень сверху-слева, как на референсе (3:1) */
export function addStudioLights(scene: THREE.Scene) {
  const key = new THREE.DirectionalLight(0xfffaf4, 2.3);
  key.position.set(-4.5, 6.5, 5.0);
  const fill = new THREE.DirectionalLight(0xf6f2ec, 0.28);
  fill.position.set(3.0, -1.0, 6.0);
  const hemi = new THREE.HemisphereLight(0xf2efe9, 0x8a8177, 0.22);
  scene.add(key, fill, hemi);
  return { key, fill, hemi };
}
