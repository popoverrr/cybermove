/**
 * Процедурное студийное окружение (BRIEF-3 §3.4): студия с одним главным источником.
 * Ключевой софтбокс 3×1.2 сверху-слева (#FFFBF5, 5–7), большой слабый заполняющий градиент спереди (0.5),
 * стены с вертикальным градиентом от светлого вверху к тёмному внизу (низ сферы отражает тёмное),
 * справа-сзади узкая полоса контрового света (0.8). Пресет `night` — те же источники на тёмных стенах #2A2724.
 * Сцена из emissive-плоскостей прогоняется через PMREMGenerator.fromScene(); смешение пресетов — в шейдере
 * материала (patchEnvBlend), движение бликов — scene.environmentRotation (курсор ±6°).
 */
import * as THREE from 'three';

export interface StudioPreset {
  key: 'warm' | 'night';
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

/** Стены студии с вертикальным градиентом: цвет вершин по высоте */
function walls(scene: THREE.Scene, top: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation, size = 40) {
  const geo = new THREE.BoxGeometry(size, size * 0.75, size, 1, 8, 1);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const ct = new THREE.Color(top);
  const cb = new THREE.Color(bottom);
  const c = new THREE.Color();
  const half = size * 0.375;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) + half) / (2 * half), 0, 1);
    c.copy(cb).lerp(ct, Math.pow(t, 0.8));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, toneMapped: false }));
  scene.add(mesh);
}

/** Общие источники: ключ сверху-слева, заполняющий спереди, контровой справа-сзади */
function lights(scene: THREE.Scene, key: number, fill: number, rim: number) {
  // ключевой софтбокс 3×1.2: полоса — в блике угадывается отражение софтбокса (чек-лист §3 п. 4)
  panel(scene, 6.0, 1.3, 0xfffcf8, key, new THREE.Vector3(-3.2, 3.9, 4.2));
  // большой слабый заполняющий спереди
  panel(scene, 12, 8, 0xfaf8f4, fill, new THREE.Vector3(1.0, 0.5, 10.0));
  // контровой: узкая полоса справа-сзади для светлой кромки
  panel(scene, 0.8, 7, 0xfffaf4, rim, new THREE.Vector3(5.5, 1.5, -4.0));
}

export const WARM_STUDIO: StudioPreset = {
  key: 'warm',
  build(scene) {
    walls(scene, 0xf3f1ee, 0x4f4b47);
    lights(scene, 12.0, 0.3, 1.2);
  },
};

export const NIGHT_STUDIO: StudioPreset = {
  key: 'night',
  build(scene) {
    walls(scene, 0x3a3631, 0x2a2724);
    lights(scene, 12.0, 0.4, 1.4);
  },
};

export interface EnvironmentMaps {
  warm: THREE.Texture;
  night: THREE.Texture;
  dispose(): void;
}

export function buildEnvironments(renderer: THREE.WebGLRenderer, size = 256): EnvironmentMaps {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const make = (preset: StudioPreset) => {
    const scene = new THREE.Scene();
    preset.build(scene);
    // sigma даёт мягкость краям софтбокса
    const rt = pmrem.fromScene(scene, 0.04, 0.1, 100, { size });
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
    return rt;
  };
  const warmRt = make(WARM_STUDIO);
  const nightRt = make(NIGHT_STUDIO);
  pmrem.dispose();
  return {
    warm: warmRt.texture,
    night: nightRt.texture,
    dispose() {
      warmRt.dispose();
      nightRt.dispose();
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

/**
 * Тонмаппинг Khronos PBR Neutral внутри материала (BRIEF-3 §3.6 / DECISIONS): three выключает тонмаппинг
 * при рендере в render target, а ToneMappingEffect композера искажал фон (сжимал светлое, «давил» тёмное).
 * Поэтому renderer.toneMapping = NoToneMapping всегда, а жемчуг мапится сам; линии, точки и фон — точные цвета.
 */
export function patchNeutralToneMap(material: THREE.Material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        vec3 cmNeutral(vec3 color) {
          const float StartCompression = 0.8 - 0.04;
          const float Desaturation = 0.15;
          float x = min(color.r, min(color.g, color.b));
          float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
          color -= offset;
          float peak = max(color.r, max(color.g, color.b));
          if (peak < StartCompression) return color;
          float d = 1.0 - StartCompression;
          float newPeak = 1.0 - d * d / (peak + d - StartCompression);
          color *= newPeak / peak;
          float g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
          return mix(color, vec3(newPeak), g);
        }`,
      )
      .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = cmNeutral(gl_FragColor.rgb);');
  };
  const prevKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${prevKey.call(material)}|neutral`;
  material.toneMapped = false;
  material.needsUpdate = true;
}

/** Малые сферы-спутники S3 и листы S6 используют тот же жемчуг, но без карт и смещения */
export function pearlMaterial(envWarm: THREE.Texture, envNight: THREE.Texture, envMix: THREE.IUniform<number>, over: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xede7de,
    metalness: 0,
    roughness: 0.4,
    clearcoat: 0.65,
    clearcoatRoughness: 0.22,
    sheen: 0.45,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xfff6ea),
    ior: 1.45,
    specularIntensity: 0.9,
    envMap: envWarm,
    envMapIntensity: 1.0,
    ...over,
  });
  patchEnvBlend(mat, envNight, { uEnvMix: envMix });
  patchNeutralToneMap(mat);
  return mat;
}

/** Направленный ключевой свет: даёт читаемый терминатор и тень 1:3 вместе с окружением */
export function addStudioLights(scene: THREE.Scene) {
  const key = new THREE.DirectionalLight(0xfffcf8, 0.45);
  key.position.set(-4.0, 6.0, 5.0);
  // заполняющий направленный свет убран: он давал точечный блик на clearcoat справа; заполняет окружение
  const fill = new THREE.DirectionalLight(0xfaf8f4, 0.0);
  fill.position.set(3.0, -1.0, 6.0);
  scene.add(key, fill);
  return { key, fill };
}
