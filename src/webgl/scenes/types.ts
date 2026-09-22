import type gsap from 'gsap';
import type { Engine } from '../Engine';
import type { Rig } from '../Story';

/** Фаза экрана по сглаженному прогрессу: вход [0, 0.3), удержание [0.3, 0.7), выход [0.7, 1] (BRIEF-3 §6) */
export type Phase = 'enter' | 'hold' | 'exit';

export interface SceneModule {
  readonly id: string;
  init(engine: Engine, rig: Rig): void;
  /** показать/спрятать объекты сцены (visible, а не opacity — BRIEF-3 §7.3) */
  setActive(on: boolean, engine: Engine): void;
  /**
   * Таймлайн фазы: дискретные события идут по времени, скролл только переключает фазы (BRIEF-3 §6.1).
   * Story запускает его, ускоряет незавершённый до timeScale 1.6 при смене фазы и убивает циклы удержания.
   */
  timeline(phase: Phase, engine: Engine, rig: Rig): gsap.core.Timeline | null;
  /**
   * Непрерывные величины (камера, положение атома, фон, окружение) по сглаженному local с лимитом скорости
   * и hover-реакции. Вызывается каждый кадр, пока сцена активна или доигрывает выход.
   */
  update(rig: Rig, local: number, dt: number, time: number, engine: Engine): void;
  onResize?(w: number, h: number, mobile: boolean): void;
}
