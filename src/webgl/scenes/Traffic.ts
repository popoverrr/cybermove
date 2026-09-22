/**
 * S5 · ТРАФИК (BRIEF-3 §5). Четыре ленты по 9 линий приходят из четырёх углов экрана и сворачиваются в вихрь
 * к сфере; рисуются 2.4 с со stagger 0.3; по линиям бегут точки (12 с на путь). Сфера не раскаляется:
 * за удержание её цвет и блик светлеют на 8 %, окружение поворачивается так, что блик оказывается сверху.
 * Подписи CPL / CAC / ROMI / CTR у входов лент.
 */
import gsap from 'gsap';
import * as THREE from 'three';
import type { Engine } from '../Engine';
import type { Rig } from '../Story';
import type { SceneModule, Phase } from './types';
import { range, smooth, lerp } from '../math';
import { HoverMix } from './hover';
import { STREAM_IDS } from '../objects/Ribbons';
import { state } from '../../lib/state';
import { applyLayout, serviceLayout } from './layout';

export class TrafficScene implements SceneModule {
  readonly id = 'traffic';
  private hover = new HoverMix(STREAM_IDS);
  private tmp = new THREE.Vector3();
  private anim = { on: 0, lift: 0, light: 0, labels: [0, 0, 0, 0], freeze: 0 };
  private corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  init() {}

  setActive(on: boolean, e: Engine) {
    e.ribbons.group.visible = on;
    if (!on) {
      for (const id of STREAM_IDS) {
        const a = state.anchors[`metric-${id}`];
        if (a) a.visible = 0;
      }
    }
  }

  timeline(phase: Phase, e: Engine) {
    const r = e.ribbons;
    if (phase === 'enter') {
      const tl = gsap.timeline();
      this.anim.on = 0;
      this.anim.freeze = 0;
      for (let s = 0; s < 4; s++) {
        r.draw[s] = 0;
        this.anim.labels[s] = 0;
        tl.to(r.draw, { [s]: 1, duration: 2.4, ease: 'power2.inOut' }, 0.2 + s * 0.3);
        tl.to(this.anim.labels, { [s]: 1, duration: 0.4 }, 0.4 + s * 0.3);
      }
      tl.to(this.anim, { on: 1, duration: 0.3 }, 0);
      return tl;
    }
    if (phase === 'hold') {
      const tl = gsap.timeline();
      if (this.anim.on < 0.999 || this.anim.freeze > 0.001) {
        tl.to(this.anim, { on: 1, freeze: 0, duration: 0.6 }, 0);
        tl.to(this.anim.labels, { 0: 1, 1: 1, 2: 1, 3: 1, duration: 0.4 }, 0.2);
      }
      tl.to(this.anim, { lift: 1, light: 1, duration: 4.0, ease: 'power1.inOut' }, 0);
      return tl;
    }
    const tl = gsap.timeline();
    tl.to(this.anim, { freeze: 1, duration: 0.8 }, 0);
    tl.to(this.anim, { on: 0, lift: 0, light: 0, duration: 0.7, ease: 'power2.inOut' }, 0.2);
    tl.to(this.anim.labels, { 0: 0, 1: 0, 2: 0, 3: 0, duration: 0.3 }, 0);
    return tl;
  }

  update(rig: Rig, local: number, dt: number, time: number, e: Engine) {
    this.hover.update(dt, state.screen === 4);
    const hovered = this.hover.active;
    const exit = smooth(range(local, 0.7, 1.0));
    rig.bg.a = 'clay';
    rig.bg.b = 'sand';
    rig.bg.mix = exit;
    rig.bg.mask = 'bottom';
    rig.beam = 0;
    rig.envMix = 0;
    // блик уходит наверх за удержание
    rig.envRot = 3.1 + this.anim.light * 0.9;
    rig.cam.set(0, 0, 7.4);
    rig.look.set(0, 0, 0);
    rig.fov = 30;
    applyLayout(rig, serviceLayout());
    rig.parallax = 0.6;
    rig.pointerBulge = 0.2;
    rig.sphereScale = 0.9;
    rig.sphereVisible = true;
    rig.atomPos.set(0, 0, 0);
    rig.lift = this.anim.lift * 0.16; // ≈ +8 % светлее

    // углы экрана в локальных координатах атома (z = 0 плоскость атома)
    const cam = e.camera;
    const dist = Math.abs(cam.position.z - e.atom.position.z);
    const halfH = Math.tan((cam.fov * Math.PI) / 360) * dist;
    const halfW = halfH * cam.aspect;
    const s = Math.max(1e-3, e.atom.scale.x);
    const ax = e.atom.position.x - cam.position.x;
    const ay = e.atom.position.y - cam.position.y;
    // десктоп: левая половина занята текстом — левые ленты входят с верхней и нижней кромки у середины экрана;
    // мобильный: текст ниже сферы — ленты входят с верхних углов и с боковых кромок на высоте сферы
    if (state.mobile) {
      this.corners[0].set((-halfW * 1.08 - ax) / s, (halfH * 1.08 - ay) / s, 0);
      this.corners[1].set((halfW * 1.08 - ax) / s, (halfH * 1.08 - ay) / s, 0);
      this.corners[2].set((halfW * 1.08 - ax) / s, (ay * 0.2) / s, 0);
      this.corners[3].set((-halfW * 1.08 - ax) / s, (ay * 0.2) / s, 0);
    } else {
      this.corners[0].set((0.02 * halfW - ax) / s, (halfH * 1.08 - ay) / s, 0);
      this.corners[1].set((halfW * 1.08 - ax) / s, (halfH * 1.08 - ay) / s, 0);
      this.corners[2].set((halfW * 1.08 - ax) / s, (-halfH * 1.08 - ay) / s, 0);
      this.corners[3].set((0.02 * halfW - ax) / s, (-halfH * 1.08 - ay) / s, 0);
    }
    const r = e.ribbons;
    r.layout(this.corners);
    for (let i = 0; i < 4; i++) r.hover[i] = this.hover.get(STREAM_IDS[i]);
    r.lines.uniforms.uGlobal.value = this.anim.on;
    r.update(time, { hovered, dots: this.anim.on > 0.5, freeze: this.anim.freeze, maxDots: e.tier.maxImpulses });
    // подписи у входов лент (чуть внутрь от угла)
    for (let i = 0; i < 4; i++) {
      this.tmp.copy(r.entries[i]).multiplyScalar(0.76).applyMatrix4(e.atom.matrixWorld);
      const p = e.project(this.tmp, { x: 0, y: 0, z: 0 });
      const a = state.anchors[`metric-${STREAM_IDS[i]}`] || (state.anchors[`metric-${STREAM_IDS[i]}`] = { x: 0, y: 0, visible: 0, hot: 0 });
      a.x = p.x;
      a.y = p.y;
      a.visible = this.anim.labels[i] * this.anim.on * (hovered >= 0 && hovered !== i ? 0.4 : 1);
      a.hot = r.hover[i];
    }
    const k = Math.floor(time / 3) % 4;
    rig.status = `FLOW 0${k + 1} · 12 S · ${['CPL', 'CAC', 'ROMI', 'CTR'][k]}`;
  }
}
