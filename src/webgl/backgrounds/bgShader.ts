/**
 * GLSL фонов (без зависимостей от three): режимы ivory / sand / stone / clay (BRIEF-2 §4.6) и маски переходов.
 * Используется в Background.ts (главная, three) и lite-bg.ts (внутренние страницы, чистый WebGL2).
 * Все тона тёплые; «луч» (uBeam) — слабое тёплое пятно света под монолитом.
 */
import { GLSL_HASH, GLSL_SIMPLEX } from '../shaders/noise';

export const BG_MODES = { ivory: 0, sand: 1, stone: 2, clay: 3 } as const;
export type BgMode = keyof typeof BG_MODES;
export const MASK = { uniform: 0, radial: 1, top: 2, bottom: 3 } as const;

export const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.99999, 1.0);
}
`;

/** Тело фрагментного шейдера без вывода цвета: используется и в three (главная), и в lite-bg (внутренние страницы) */
export const BG_FRAG_BODY = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uMouse;
uniform float uScroll;
uniform float uModeA;
uniform float uModeB;
uniform float uMix;
uniform float uMaskType;
uniform float uBeam;
uniform vec2 uBeamPos;
uniform float uLightX;
uniform float uDetail;   // 1 — полный шум, 0 — одна октава (LOW-тир)
${GLSL_HASH}
${GLSL_SIMPLEX}

vec3 srgb2lin(vec3 c) { return pow(c, vec3(2.2)); }

// зерно бумаги: мелкий хэш-шум, независимый от времени, чтобы не «кипел»
float grain(vec2 uv) {
  return hash13(vec3(floor(uv * uRes * 0.5), 7.0)) - 0.5;
}

// тёплое пятно света под монолитом (S4): не свечение, а мягкий свет на стене
vec3 beam(vec2 p) {
  if (uBeam <= 0.001) return vec3(0.0);
  vec2 d = p - uBeamPos;
  float w = 0.35 + d.y * 0.45;
  float b = exp(-d.x * d.x / (w * w)) * smoothstep(-0.05, 0.3, d.y) * exp(-d.y * 0.8);
  return vec3(0.055, 0.045, 0.03) * b * uBeam;
}

vec3 bgIvory(vec2 uv, vec2 p) {
  // плотная бумага: ровный тёплый тон, одно медленно плывущее пятно света, мелкое зерно
  vec3 base = srgb2lin(vec3(0.949, 0.937, 0.914)); // #F2EFE9
  vec2 c = vec2(0.55 + sin(uTime * 0.05) * 0.35 + uMouse.x * 0.1, 0.35 + cos(uTime * 0.037) * 0.25 + uMouse.y * 0.06);
  float spot = smoothstep(2.4, 0.0, length(p - c));
  float shade = snoise(vec3(p * 0.45, uTime * 0.015)) * 0.5 + 0.5;
  vec3 col = base * (0.985 + spot * spot * 0.05 + (shade - 0.5) * 0.02 * uDetail);
  col += grain(uv) * 0.014;
  return col + beam(p);
}

vec3 bgSand(vec2 uv, vec2 p) {
  // ровный тёплый тон с зерном, едва заметная мягкая светотень
  vec3 base = srgb2lin(vec3(0.914, 0.894, 0.863)); // #E9E4DC
  float shade = snoise(vec3(p * 0.35 + 3.0, uTime * 0.012)) * 0.5 + 0.5;
  float top = smoothstep(-1.4, 1.2, p.y);
  vec3 col = base * (0.975 + top * 0.03 + (shade - 0.5) * 0.02 * uDetail);
  col += grain(uv) * 0.016;
  return col + beam(p);
}

vec3 bgStone(vec2 uv, vec2 p) {
  // известняк / шлифованная штукатурка: анизотропные горизонтальные штрихи 6–8% контраста, мягкий свет сверху-слева
  float streak = snoise(vec3(uv.x * 2.5, uv.y * 520.0, 1.7)) * 0.5 + snoise(vec3(uv.x * 9.0, uv.y * 1400.0, 4.2)) * 0.25 * uDetail;
  float cloud = snoise(vec3(p * 0.6, uTime * 0.01)) * 0.5 + 0.5;
  vec2 lc = vec2(-1.0 + uLightX * 0.2 + uMouse.x * 0.1, 0.9 + uMouse.y * 0.06);
  float light = smoothstep(2.6, 0.0, length(p - lc));
  vec3 base = srgb2lin(vec3(0.867, 0.843, 0.808)); // #DDD7CE
  vec3 col = base * (0.955 + light * light * 0.06 + streak * 0.035 + (cloud - 0.5) * 0.03);
  col += grain(uv) * 0.012;
  return col + beam(p);
}

vec3 bgClay(vec2 uv, vec2 p) {
  // тёплая стена: солнце через окно на штукатурке — мягкие широкие блики, небольшая амплитуда
  vec2 q = p * 0.9;
  float t = uTime * 0.03;
  vec2 warp = vec2(snoise(vec3(q * 0.7, t)), snoise(vec3(q * 0.7 + 5.3, t + 2.0))) * uDetail;
  float n = snoise(vec3(q * 0.8 + warp * 0.5, t * 0.7)) * 0.5 + 0.5;
  float sun = smoothstep(0.35, 0.95, n) * 0.06;
  // окно: широкая наклонная полоса света
  float band = smoothstep(0.55, 0.0, abs(p.x * 0.5 - p.y * 0.85 + 0.6 + sin(uTime * 0.04) * 0.15)) * 0.035;
  float textZone = smoothstep(0.5, -0.9, p.x);
  vec3 base = srgb2lin(vec3(0.812, 0.780, 0.733)); // #CFC7BB
  vec3 col = base * (0.97 + (sun + band) * (1.0 - textZone * 0.6));
  col += grain(uv) * 0.012;
  return col + beam(p);
}

vec3 modeColor(float mode, vec2 uv, vec2 p) {
  if (mode < 0.5) return bgIvory(uv, p);
  if (mode < 1.5) return bgSand(uv, p);
  if (mode < 2.5) return bgStone(uv, p);
  return bgClay(uv, p);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= uRes.x / uRes.y;
  vec3 a = modeColor(uModeA, uv, p);
  float m = uMix;
  if (uMaskType > 0.5 && uMaskType < 1.5) {
    // радиально от центра, мягкий фронт
    float r = length(p) / 2.4;
    m = smoothstep(uMix * 1.35 - 0.35, uMix * 1.35, r) ;
    m = 1.0 - m;
    m = uMix <= 0.0 ? 0.0 : (uMix >= 1.0 ? 1.0 : m);
  } else if (uMaskType < 2.5 && uMaskType > 1.5) {
    m = smoothstep(uv.y + 0.25, uv.y - 0.25, 1.0 - uMix * 1.5);
  } else if (uMaskType > 2.5) {
    m = smoothstep(1.0 - uv.y + 0.25, 1.0 - uv.y - 0.25, 1.0 - uMix * 1.5);
  }
  vec3 col = a;
  if (m > 0.001) {
    vec3 b = modeColor(uModeB, uv, p);
    col = mix(a, b, clamp(m, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, 1.0);
  //__OUTPUT__
}
`;
