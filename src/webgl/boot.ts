/**
 * Точка входа three-чанка. Загружается лениво из lib/home.ts после первой отрисовки.
 */
import { Engine, createGpu } from './Engine';
import { buildEnvironmentsAsync } from './Environment';
import { TIERS } from './tiers';

export type { Engine };

/**
 * Движок без собственного цикла: кадры рисует единый gsap.ticker главной через `engine.frame(now)` (BRIEF-3 §6.3).
 * BRIEF-SEO §6: сначала рендерер, потом карты окружения — шейдеры PMREM компилируются в фоне, — и только потом
 * сам движок; раньше всё это шло одним синхронным блоком на 1.2–2.5 с.
 */
export async function create(canvas: HTMLCanvasElement, onFirstFrame?: () => void): Promise<Engine> {
  const gpu = createGpu(canvas);
  const env = await buildEnvironmentsAsync(gpu.renderer, TIERS[gpu.tierName].envSize);
  const engine = new Engine({ canvas, onFirstFrame, gpu, env });
  (window as unknown as { __cmEngine: Engine }).__cmEngine = engine;
  return engine;
}

/** Движок со своим rAF (лаборатории /dev/*): синхронная сборка, как раньше */
export function boot(canvas: HTMLCanvasElement, onFirstFrame?: () => void): Engine {
  const engine = new Engine({ canvas, onFirstFrame });
  (window as unknown as { __cmEngine: Engine }).__cmEngine = engine;
  engine.start();
  return engine;
}
