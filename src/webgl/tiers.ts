/**
 * Тиры качества (BRIEF §8.8, BRIEF-2 §4.4 и §8.6).
 * HIGH: 30k частиц, пост-обработка (зерно, виньетка, SMAA), DPR до 1.75.
 * MID:  15k, пост без SMAA, DPR 1.5.
 * LOW:  6k, без пост-обработки, упрощённые шейдеры, DPR ≤ 1.25, фон в одну октаву.
 */
import type { Tier } from './params';

export interface TierSpec {
  name: Tier;
  particles: number;
  maxDpr: number;
  post: boolean;
  smaa: boolean;
  noise: boolean;
  sphereDetail: number;
  worley: boolean;
  envSize: number;
  trailSegments: number;
  /** 1 — полный шум фона, 0 — одна октава */
  bgDetail: number;
}

export const TIERS: Record<Tier, TierSpec> = {
  high: { name: 'high', particles: 30000, maxDpr: 1.75, post: true, smaa: true, noise: true, sphereDetail: 63, worley: true, envSize: 256, trailSegments: 40, bgDetail: 1 },
  mid: { name: 'mid', particles: 15000, maxDpr: 1.5, post: true, smaa: false, noise: true, sphereDetail: 63, worley: true, envSize: 256, trailSegments: 32, bgDetail: 1 },
  low: { name: 'low', particles: 6000, maxDpr: 1.25, post: false, smaa: false, noise: false, sphereDetail: 31, worley: false, envSize: 128, trailSegments: 24, bgDetail: 0 },
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
