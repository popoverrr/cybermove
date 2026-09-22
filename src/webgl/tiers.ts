/**
 * Тиры качества (BRIEF-3 §3.6, §7.2).
 * HIGH: композер (SMAA + зерно), пыль 12k, дыхание сферы, карты 1024², DPR до 1.75.
 * MID:  без композера, MSAA, пыль 8k, дыхание, карты 1024², DPR 1.5.
 * LOW:  без композера, MSAA, пыли нет, сфера статична (detail 31), карты 512², фон одна октава, DPR ≤ 1.25.
 */
import type { Tier } from './params';

export interface TierSpec {
  name: Tier;
  /** пыль S1/S8 (0 — выключена) */
  particles: number;
  maxDpr: number;
  /** композер (SMAA + зерно); без него — прямой рендер с MSAA */
  post: boolean;
  smaa: boolean;
  noise: boolean;
  sphereDetail: number;
  /** дыхание сферы (смещение вершин) */
  displace: boolean;
  /** размер карт нормалей/шероховатости */
  mapSize: number;
  envSize: number;
  /** 1 — полный шум фона, 0 — одна октава */
  bgDetail: number;
  /** максимум точек-импульсов на экран */
  maxImpulses: number;
}

export const TIERS: Record<Tier, TierSpec> = {
  high: { name: 'high', particles: 12000, maxDpr: 1.75, post: true, smaa: true, noise: true, sphereDetail: 63, displace: true, mapSize: 1024, envSize: 256, bgDetail: 1, maxImpulses: 24 },
  mid: { name: 'mid', particles: 8000, maxDpr: 1.5, post: false, smaa: false, noise: false, sphereDetail: 63, displace: true, mapSize: 1024, envSize: 256, bgDetail: 1, maxImpulses: 16 },
  low: { name: 'low', particles: 0, maxDpr: 1.25, post: false, smaa: false, noise: false, sphereDetail: 31, displace: false, mapSize: 512, envSize: 128, bgDetail: 0, maxImpulses: 8 },
};

export function lowerTier(t: Tier): Tier | null {
  return t === 'high' ? 'mid' : t === 'mid' ? 'low' : null;
}

/** Стартовый тир по железу. Короткий замер кадров делает Engine. */
export function detectTier(forced: Tier | null): Tier {
  if (forced) return forced;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  if (coarse && small) return 'low';
  if (coarse) return 'mid';
  if (cores >= 8 && mem >= 8) return 'high';
  if (cores >= 4 && mem >= 4) return 'mid';
  return 'low';
}

/** Программный рендер (SwiftShader/llvmpipe): тир не понижаем — это скриншоты. */
export function isSoftwareRenderer(gl: WebGL2RenderingContext): boolean {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  return /swiftshader|llvmpipe|software/i.test(r);
}
