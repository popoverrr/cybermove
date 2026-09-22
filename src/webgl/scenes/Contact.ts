/**
 * S8 · КОНТАКТ (BRIEF-3 §5, §8.1) в теме night: жемчужная сфера на тёплом графите — главный контрастный момент
 * сайта. Орбиты с электронами и постоянными шлейфами 0.25 (единственное место, где шлейфы всегда включены), пыль.
 * Фокус в поле: свет поворачивается к форме. Отправка: одно кольцо расходится от сферы 1.8 с и растворяется.
 */
import gsap from 'gsap';
import * as THREE from 'three';
import type { Engine } from '../Engine';
import type { Rig } from '../Story';
import type { SceneModule, Phase } from './types';
import { range, smooth, lerp, damp } from '../math';
import { state } from '../../lib/state';
import { applyLayout, contactLayout } from './layout';
import { ORBITS } from '../objects/Orbits';

export class ContactScene implements SceneModule {
  readonly id = 'contact';
  private focus = 0;
  private tmp = new THREE.Vector3();
  private anim = { labels: [0, 0, 0] };
  private pulseTl: gsap.core.Timeline | null = null;

  init(engine: Engine) {
    state.events.on('formSuccess', () => this.pulse(engine));
  }

  private pulse(e: Engine) {
    const p = e.pulse;
    this.pulseTl?.kill();
    p.draw[0] = 0;
    p.radius[0] = 1.05;
    p.alpha[0] = 1;
    p.group.visible = true;
    this.pulseTl = gsap.timeline({ onComplete: () => (p.group.visible = false) });
    this.pulseTl.to(p.draw, { 0: 1, duration: 0.5, ease: 'power2.out' }, 0);
    this.pulseTl.to(p.radius, { 0: 3.4, duration: 1.8, ease: 'power2.out' }, 0);
    this.pulseTl.to(p.alpha, { 0: 0, duration: 1.2, ease: 'power2.in' }, 0.6);
  }

  setActive(on: boolean, e: Engine) {
    e.orbits.group.visible = on;
    if (e.dust) e.dust.points.visible = on && e.dust.uniforms.uOpacity.value > 0.003;
    if (!on) {
      e.pulse.group.visible = false;
      for (let i = 0; i < 3; i++) {
        const a = state.anchors[`contact-${i}`];
        if (a) a.visible = 0;
      }
    }
  }

  timeline(phase: Phase, e: Engine, rig: Rig) {
    const o = e.orbits;
    if (phase === 'enter') {
      const tl = gsap.timeline();
      o.global = 1;
      rig.dust = 0;
      for (let i = 0; i < ORBITS.length; i++) {
        const p = { t: 0 };
        o.draw(i, 0);
        o.electron[i] = 0;
        tl.to(p, { t: 1, duration: 1.4, ease: 'power2.inOut', onUpdate: () => o.draw(i, p.t) }, 0.2 + i * 0.2);
        tl.to(o.electron, { [i]: 1, duration: 0.35 }, 0.2 + i * 0.2 + 1.4);
      }
      for (let i = 0; i < 3; i++) {
        this.anim.labels[i] = 0;
        tl.to(this.anim.labels, { [i]: 1, duration: 0.4 }, 1.8 + i * 0.1);
      }
      if (e.dust) tl.to(rig, { dust: 1, duration: 1.2 }, 1.6);
      return tl;
    }
    return null;
  }

  update(rig: Rig, local: number, dt: number, time: number, e: Engine) {
    const enter = smooth(range(local, 0, 0.6));
    this.focus = dt === 0 ? (state.formFocus ? 1 : 0) : damp(this.focus, state.formFocus ? 1 : 0, 4, dt);
    rig.bg.a = 'night';
    rig.bg.b = 'night';
    rig.bg.mix = 0;
    rig.bg.mask = 'uniform';
    rig.beam = 0;
    rig.envMix = 1;
    // фокус в поле формы — свет поворачивается к форме (влево)
    rig.envRot = 4.6 - this.focus * 0.9;
    rig.cam.set(0, 0, 8.4);
    rig.look.set(0, 0, 0);
    rig.fov = 30;
    // сфера выезжает из центра в правую часть по мере входа
    applyLayout(rig, contactLayout(), enter, { x: 0.5, y: contactLayout().y, r: contactLayout().r });
    rig.parallax = 0.6;
    rig.pointerBulge = 0.4;
    rig.sphereScale = 1;
    rig.sphereVisible = true;
    rig.atomPos.set(0, 0, 0);
    rig.lift = 0;

    const o = e.orbits;
    for (let i = 0; i < 5; i++) {
      o.highlight[i] = 0;
      o.level[i] = 1;
    }
    o.update(dt, time, { speedMul: 0.8 + this.focus * 1.2, trails: true, dpr: e.renderer.getPixelRatio() });
    e.pulse.update(time);
    for (let i = 0; i < 3; i++) {
      o.pointAt(i, o.spin[i], this.tmp).applyMatrix4(e.atom.matrixWorld);
      const p = e.project(this.tmp, { x: 0, y: 0, z: 0 });
      const a = state.anchors[`contact-${i}`] || (state.anchors[`contact-${i}`] = { x: 0, y: 0, visible: 0, hot: 0 });
      a.x = p.x;
      a.y = p.y;
      a.visible = this.anim.labels[i] * o.electron[i];
      a.hot = 0;
    }
    rig.status = `NIGHT · ${state.formFocus ? 'INPUT' : 'READY'} · E ${Math.round(o.electron.reduce((s, v) => s + v, 0))}/5`;
  }
}
