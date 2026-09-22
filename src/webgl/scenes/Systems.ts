/**
 * S3 · СИСТЕМЫ (BRIEF-3 §5). Пять малых жемчужных сфер на общем кольце вокруг ядра появляются выездом из-за ядра
 * (2.2 с, stagger 0.18), связи рисуются после (0.4), по связям идут точки-импульсы раз в 2.5 с.
 * Hover: спутник подсвечивается (кольцо 0.72, подпись ink), остальные 0.25.
 */
import gsap from 'gsap';
import * as THREE from 'three';
import type { Engine } from '../Engine';
import type { Rig } from '../Story';
import type { SceneModule, Phase } from './types';
import { range, smooth, lerp } from '../math';
import { HoverMix } from './hover';
import { NODE_IDS, CORE_SCALE } from '../objects/Satellites';
import { state } from '../../lib/state';
import { applyLayout, serviceLayout } from './layout';

export class SystemsScene implements SceneModule {
  readonly id = 'systems';
  private hover = new HoverMix(NODE_IDS);
  private tmp = new THREE.Vector3();
  private anim = { ring: 0, links: 0, labels: [0, 0, 0, 0, 0] };

  init() {}

  setActive(on: boolean, e: Engine) {
    e.satellites.group.visible = on;
    if (!on) {
      for (let i = 0; i < 5; i++) {
        const a = state.anchors[`node-${i}`];
        if (a) a.visible = 0;
      }
    }
  }

  timeline(phase: Phase, e: Engine) {
    const s = e.satellites;
    if (phase === 'enter') {
      const tl = gsap.timeline();
      this.anim.ring = 0;
      this.anim.links = 0;
      tl.to(this.anim, { ring: 1, duration: 1.6, ease: 'power2.inOut' }, 0);
      for (let i = 0; i < 5; i++) {
        s.show[i] = 0;
        s.along[i] = s.slot[i] - 0.5;
        this.anim.labels[i] = 0;
        tl.to(s.show, { [i]: 1, duration: 0.5, ease: 'power2.out' }, 0.4 + i * 0.18);
        tl.to(s.along, { [i]: s.slot[i], duration: 2.2, ease: 'power2.inOut' }, 0.4 + i * 0.18);
        tl.to(this.anim.labels, { [i]: 1, duration: 0.4 }, 2.6 + i * 0.1);
      }
      tl.to(this.anim, { links: 1, duration: 1.4, ease: 'power2.inOut' }, 2.4);
      return tl;
    }
    if (phase === 'hold') {
      if (this.anim.links > 0.999 && s.show.every((v) => v > 0.999)) return null;
      const tl = gsap.timeline();
      tl.to(this.anim, { links: 1, ring: 1, duration: 0.8, ease: 'power2.inOut' }, 0);
      tl.to(s.show, { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, duration: 0.6, ease: 'power2.out' }, 0);
      tl.to(this.anim.labels, { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, duration: 0.4 }, 0.3);
      return tl;
    }
    const tl = gsap.timeline();
    tl.to(this.anim, { links: 0, ring: 0, duration: 0.6, ease: 'power2.inOut' }, 0);
    tl.to(s.show, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, duration: 0.6, ease: 'power2.inOut' }, 0.1);
    tl.to(this.anim.labels, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, duration: 0.3 }, 0);
    return tl;
  }

  update(rig: Rig, local: number, dt: number, time: number, e: Engine) {
    this.hover.update(dt, state.screen === 2);
    const hovered = this.hover.active;
    const exit = smooth(range(local, 0.7, 1.0));
    rig.bg.a = 'stone';
    rig.bg.b = 'ivory';
    rig.bg.mix = exit;
    rig.bg.mask = 'uniform';
    rig.beam = 0;
    rig.envMix = 0;
    rig.envRot = 0.35 + local * 0.5;
    rig.cam.set(0, 0, 7.2);
    rig.look.set(0, 0, 0);
    rig.fov = 30;
    applyLayout(rig, serviceLayout());
    rig.parallax = 0.7;
    rig.pointerBulge = 0.2;
    rig.sphereScale = CORE_SCALE;
    rig.sphereVisible = true;
    rig.atomPos.set(0, 0, 0);
    rig.lift = 0;

    const s = e.satellites;
    for (let i = 0; i < 5; i++) s.hover[i] = this.hover.get(NODE_IDS[i]);
    s.update(time, { ring: this.anim.ring, links: this.anim.links, impulses: this.anim.links > 0.99, hovered });
    // подписи у спутников
    for (let i = 0; i < 5; i++) {
      this.tmp.copy(s.positions[i]).addScaledVector(s.axis, 0.22).applyMatrix4(e.atom.matrixWorld);
      const p = e.project(this.tmp, { x: 0, y: 0, z: 0 });
      const a = state.anchors[`node-${i}`] || (state.anchors[`node-${i}`] = { x: 0, y: 0, visible: 0, hot: 0 });
      a.x = p.x;
      a.y = p.y;
      a.visible = this.anim.labels[i] * s.show[i] * (hovered >= 0 && hovered !== i ? 0.35 : 1);
      a.hot = s.hover[i];
    }
    const n = Math.round(s.show.reduce((acc, v) => acc + v, 0));
    rig.status = `NODES ${n}/5 · LINK ${(this.anim.links * 1.4).toFixed(1)} S`;
  }
}
