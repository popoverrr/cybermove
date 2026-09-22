/**
 * S7 · РОСТ (BRIEF-3 §5). Из сферы расходятся 12 колец (0.18 → 0.72 к внешнему), stagger 0.12, каждое 1.2 с.
 * Счётчики (DOM) идут 1.4 с power3.out по событию входа. Выход: фон темнеет к night за последние 25 % (S8).
 */
import gsap from 'gsap';
import * as THREE from 'three';
import type { Engine } from '../Engine';
import type { Rig } from '../Story';
import type { SceneModule, Phase } from './types';
import { range, smooth, lerp } from '../math';
import { state } from '../../lib/state';
import { applyLayout, growthLayout } from './layout';

export class GrowthScene implements SceneModule {
  readonly id = 'growth';
  private tmp = new THREE.Vector3();
  private anim = { on: 0, labels: [0, 0, 0] };
  /** кольца с подписями (индексы) */
  private labelRings = [3, 7, 11];

  /** переход к тёмной теме S8 (если она не отключена атрибутом) */
  private toNight = true;

  init() {
    const band = document.querySelector<HTMLElement>('[data-screen="contact"]')?.dataset.themeBand;
    this.toNight = !band || band === 'night';
  }

  setActive(on: boolean, e: Engine) {
    e.rings.group.visible = on;
    if (!on) {
      for (let i = 0; i < 3; i++) {
        const a = state.anchors[`ring-${i}`];
        if (a) a.visible = 0;
      }
    }
  }

  timeline(phase: Phase, e: Engine) {
    const r = e.rings;
    if (phase === 'enter') {
      const tl = gsap.timeline();
      this.anim.on = 0;
      tl.to(this.anim, { on: 1, duration: 0.3 }, 0);
      for (let i = 0; i < r.count; i++) {
        r.draw[i] = 0;
        r.alpha[i] = 1;
        tl.to(r.draw, { [i]: 1, duration: 1.2, ease: 'power2.inOut' }, 0.2 + i * 0.12);
      }
      for (let i = 0; i < 3; i++) {
        this.anim.labels[i] = 0;
        tl.to(this.anim.labels, { [i]: 1, duration: 0.4 }, 0.2 + this.labelRings[i] * 0.12 + 1.2 + i * 0.1);
      }
      return tl;
    }
    if (phase === 'hold') {
      if (this.anim.on > 0.999 && r.alpha.every((v) => v > 0.999)) return null;
      const tl = gsap.timeline();
      tl.to(this.anim, { on: 1, duration: 0.3 }, 0);
      for (let i = 0; i < r.count; i++) tl.to(r.alpha, { [i]: 1, duration: 0.5, ease: 'power2.inOut' }, i * 0.05);
      tl.to(this.anim.labels, { 0: 1, 1: 1, 2: 1, duration: 0.4 }, 0.3);
      return tl;
    }
    const tl = gsap.timeline();
    // кольца схлопываются в спокойный атом: внешние стираются первыми
    for (let i = 0; i < r.count; i++) tl.to(r.alpha, { [i]: 0, duration: 0.5, ease: 'power2.inOut' }, (r.count - 1 - i) * 0.05);
    tl.to(this.anim.labels, { 0: 0, 1: 0, 2: 0, duration: 0.3 }, 0);
    tl.to(this.anim, { on: 0, duration: 0.3 }, 0.8);
    return tl;
  }

  update(rig: Rig, local: number, dt: number, time: number, e: Engine) {
    const enter = smooth(range(local, 0, 0.3));
    // фон темнеет к night за последние 25 % экрана (BRIEF-3 §8.1)
    const night = this.toNight ? smooth(range(local, 0.75, 1.0)) : 0;
    rig.bg.a = 'ivory';
    rig.bg.b = 'night';
    rig.bg.mix = night;
    rig.bg.mask = 'uniform';
    rig.beam = 0;
    rig.envMix = night;
    rig.envRot = 4.2 + local * 0.4;
    rig.cam.set(0, 0, lerp(7.6, 8.4, enter));
    rig.look.set(0, 0, 0);
    rig.fov = 30;
    applyLayout(rig, growthLayout());
    rig.parallax = 0.8;
    rig.pointerBulge = 0.5;
    rig.sphereScale = 1;
    rig.sphereVisible = true;
    rig.atomPos.set(0, 0, 0);
    rig.lift = 0;

    const r = e.rings;
    r.lines.uniforms.uGlobal.value = this.anim.on;
    r.update(time);
    for (let i = 0; i < 3; i++) {
      const ri = this.labelRings[i];
      const ang = -0.35 - i * 0.28;
      this.tmp.set(Math.cos(ang) * r.radius[ri], Math.sin(ang) * r.radius[ri], 0.1).applyMatrix4(e.atom.matrixWorld);
      const p = e.project(this.tmp, { x: 0, y: 0, z: 0 });
      const a = state.anchors[`ring-${i}`] || (state.anchors[`ring-${i}`] = { x: 0, y: 0, visible: 0, hot: 0 });
      a.x = p.x;
      a.y = p.y;
      a.visible = this.anim.labels[i] * this.anim.on * r.alpha[ri];
      a.hot = 0;
    }
    const n = r.draw.reduce((acc, v) => acc + (v > 0.99 ? 1 : 0), 0);
    rig.status = `RINGS ${String(n).padStart(2, '0')}/12 · R ${(r.radius[Math.max(0, n - 1)] || 1).toFixed(1)}`;
  }
}
