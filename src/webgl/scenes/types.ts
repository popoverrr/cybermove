import type { Engine } from '../Engine';
import type { Rig } from '../Story';

export interface SceneModule {
  readonly id: string;
  /**
   * Как авторились переходы сцены в долях local: enter — конец входа, exit — начало выхода.
   * Story растягивает вход на первые 20 % прокрутки экрана и выход на последние 30 % (BRIEF-2 §8.2),
   * середина — линейно; при остановке скролла всё живёт только по времени.
   */
  readonly range: { enter: number; exit: number };
  init(engine: Engine, rig: Rig): void;
  /** local — прогресс экрана 0..1; функция должна быть детерминированной по local (для ?progress) */
  update(rig: Rig, local: number, dt: number, time: number, engine: Engine): void;
  onResize?(w: number, h: number, mobile: boolean): void;
}
