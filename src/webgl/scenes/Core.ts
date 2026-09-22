/**
 * S1 · ЯДРО (BRIEF-3 §5). Интро 3.4 с по времени: фон и текст уже на месте; сфера проявляется 0 → 1 со масштабом
 * 0.94 → 1 (1.4 с expo.out), окружение поворачивается на 30°, орбиты рисуются одна за другой (старт 0.5 с, шаг 0.25 с,
 * каждая 1.4 с), электроны стартуют, когда орбита дорисована, пыль проявляется последней (2.4–3.4 с).
 * Удержание: сфера дышит, электроны идут, блик дрейфует, курсор двигает свет. Выход: камера мягко приближается
 * (z 7.6 → 5.6), орбиты растворяются, сфера смещается в позицию S2. Сфера никогда не заполняет экран.
 */
import gsap from 'gsap';
import * as THREE from 'three';
import type { Engine } from '../Engine';
import type { Rig } from '../Story';
import type { SceneModule, Phase } from './types';
import { range, smooth, lerp } from '../math';
import { state } from '../../lib/state';
import { ORBITS } from '../objects/Orbits';
import { applyLayout, serviceLayout } from './layout';

export const INTRO_DURATION = 3.4;

export class CoreScene implements SceneModule {
  readonly id = 'core';
  private engine!: Engine;
  private tmp = new THREE.Vector3();
  /** видимость подписей орбит 0..1 (по таймлайну) */
  private labels = [0, 0, 0, 0, 0];
  private hoverAmt = [0, 0, 0, 0, 0];

  init(engine: Engine) {
    this.engine = engine;
  }

  setActive(on: boolean, e: Engine) {
    e.orbits.group.visible = on;
    if (e.dust) e.dust.points.visible = on && e.dust.uniforms.uOpacity.value > 0.003;
    if (!on) {
      for (let i = 0; i < 5; i++) {
        const lab = state.anchors[`orbit-${i}`];
        if (lab) lab.visible = 0;
      }
    }
  }

  timeline(phase: Phase, e: Engine, rig: Rig) {
    const o = e.orbits;
    if (phase === 'enter') {
      const tl = gsap.timeline();
      o.global = 1;
      rig.dust = 0;
      rig.sphereOpacity = 0;
      rig.sphereScaleAnim = 0.94;
      tl.to(rig, { sphereOpacity: 1, sphereScaleAnim: 1, duration: 1.4, ease: 'expo.out' }, 0);
      tl.fromTo(rig, { envRotAnim: -0.52 }, { envRotAnim: 0, duration: 2.6, ease: 'power2.out' }, 0);
      for (let i = 0; i < ORBITS.length; i++) {
        const p = { t: 0 };
        o.draw(i, 0);
        o.electron[i] = 0;
        this.labels[i] = 0;
        tl.to(p, { t: 1, duration: 1.4, ease: 'power2.inOut', onUpdate: () => o.draw(i, p.t) }, 0.5 + i * 0.25);
        tl.to(o.electron, { [i]: 1, duration: 0.35, ease: 'power2.out' }, 0.5 + i * 0.25 + 1.4);
        tl.to(this.labels, { [i]: 1, duration: 0.4 }, 0.5 + i * 0.25 + 1.5 + i * 0.1);
      }
      if (e.dust) tl.to(rig, { dust: 1, duration: 1.0 }, 2.4);
      return tl;
    }
    if (phase === 'hold') {
      // удержание: только восстановление после отменённого выхода (орбиты и пыль обратно)
      if (o.global > 0.999 && (!e.dust || rig.dust > 0.999)) return null;
      const tl = gsap.timeline();
      tl.to(o, { global: 1, duration: 0.8, ease: 'power2.inOut' }, 0);
      if (e.dust) tl.to(rig, { dust: 1, duration: 0.8 }, 0);
      return tl;
    }
    // выход: орбиты растворяются
    const tl = gsap.timeline();
    tl.to(o, { global: 0, duration: 0.8, ease: 'power2.inOut' }, 0);
    tl.to(rig, { dust: 0, duration: 0.6 }, 0);
    return tl;
  }

  update(rig: Rig, local: number, dt: number, time: number, e: Engine) {
    const exit = smooth(range(local, 0.7, 1.0));
    // ---------- фон, окружение
    rig.bg.a = 'ivory';
    rig.bg.b = 'sand';
    rig.bg.mix = exit;
    rig.bg.mask = 'uniform';
    rig.beam = 0;
    rig.envMix = 0;
    rig.envRot = 0;
    // ---------- камера: мягкое приближение на выходе, сфера уходит в позицию S2 (layoutOffset общий)
    rig.cam.set(0, 0, lerp(7.6, 5.6, exit));
    rig.look.set(0, 0, 0);
    rig.fov = 30;
    // на выходе сфера уходит в раскладку экранов услуг (правее и меньше)
    applyLayout(rig, serviceLayout(), exit);
    rig.parallax = 1;
    rig.pointerBulge = 1;
    rig.sphereScale = 1;
    rig.sphereVisible = true;
    rig.atomPos.set(0, 0, 0);
    rig.lift = 0;
    // ---------- орбиты: hover (только с мышью), подписи
    const o = e.orbits;
    o.global = Math.min(o.global, 1);
    for (let i = 0; i < 5; i++) {
      const target = state.orbitHover === i ? 1 : 0;
      this.hoverAmt[i] = dt === 0 ? target : this.hoverAmt[i] + (target - this.hoverAmt[i]) * (1 - Math.exp(-8 * dt));
      o.highlight[i] = this.hoverAmt[i];
      o.level[i] = state.orbitHover >= 0 && state.orbitHover !== i ? 0.45 : 1;
      // подпись у электрона; когда электрон проходит по диску сферы (спереди или сзади), подпись гаснет
      o.pointAt(i, o.spin[i], this.tmp);
      const front = smooth(range(Math.hypot(this.tmp.x, this.tmp.y), 1.22, 1.02));
      this.tmp.applyMatrix4(e.atom.matrixWorld);
      const s = e.project(this.tmp, { x: 0, y: 0, z: 0 });
      const a = state.anchors[`orbit-${i}`] || (state.anchors[`orbit-${i}`] = { x: 0, y: 0, visible: 0, hot: 0 });
      a.x = s.x;
      a.y = s.y;
      a.visible = this.labels[i] * o.global * (i < 3 ? 1 : 0.7) * (1 - front);
      a.hot = this.hoverAmt[i];
    }
    o.update(dt, time, { speedMul: 1, trails: false, dpr: e.renderer.getPixelRatio() });
    // ---------- технический слой
    const k = Math.floor(time / 4) % 5;
    rig.status = `ORBIT 0${k + 1} · ${ORBITS[k].period} S · E ${Math.round(o.electron.reduce((s, v) => s + v, 0))}/5`;
  }
}
