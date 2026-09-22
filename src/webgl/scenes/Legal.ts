/**
 * S6 · ТЕНДЕРЫ И ПРАВО (BRIEF-3 §5). Восемь листов бумаги слетаются по одному (2.4 с, stagger 0.2) и встают в кольцо
 * вокруг сферы; хайрлайны соединяют их углы в многогранник (1.6 с); финал — кольцо-печать (1.2 с).
 * Hover тендерные: листы веером, один вперёд. Hover правовые: многогранник сжимается на 6 %, линии 0.72.
 */
import gsap from 'gsap';
import * as THREE from 'three';
import type { Engine } from '../Engine';
import type { Rig } from '../Story';
import type { SceneModule, Phase } from './types';
import { range, smooth, lerp } from '../math';
import { HoverMix } from './hover';
import { SHEET_COUNT } from '../objects/Sheets';
import { state } from '../../lib/state';
import { applyLayout, serviceLayout, growthLayout } from './layout';

const KEYS = ['tender-monitoring', 'tender-application', 'contracts', 'corporate'] as const;
/** листы с подписями TENDER / BID / CONTRACT / CORP */
const LABEL_SHEETS = [0, 2, 4, 6];

export class LegalScene implements SceneModule {
  readonly id = 'legal';
  private hover = new HoverMix(KEYS, 6);
  private tmp = new THREE.Vector3();
  private anim = { on: 0, labels: [0, 0, 0, 0] };

  init() {}

  setActive(on: boolean, e: Engine) {
    e.sheets.group.visible = on;
    if (!on) {
      for (let i = 0; i < 4; i++) {
        const a = state.anchors[`sheet-${i}`];
        if (a) a.visible = 0;
      }
    }
  }

  timeline(phase: Phase, e: Engine) {
    const sh = e.sheets;
    if (phase === 'enter') {
      const tl = gsap.timeline();
      this.anim.on = 0;
      sh.edges = 0;
      sh.seal = 0;
      tl.to(this.anim, { on: 1, duration: 0.3 }, 0);
      for (let i = 0; i < SHEET_COUNT; i++) {
        sh.arrive[i] = 0;
        tl.to(sh.arrive, { [i]: 1, duration: 2.4, ease: 'none' }, 0.1 + i * 0.2);
      }
      for (let i = 0; i < 4; i++) {
        this.anim.labels[i] = 0;
        tl.to(this.anim.labels, { [i]: 1, duration: 0.4 }, 1.4 + LABEL_SHEETS[i] * 0.2 + 1.2 + i * 0.1);
      }
      tl.to(sh, { edges: 1, duration: 1.6, ease: 'power2.inOut' }, 3.2);
      tl.to(sh, { seal: 1, duration: 1.2, ease: 'power2.inOut' }, 4.6);
      return tl;
    }
    if (phase === 'hold') {
      if (sh.seal > 0.999 && this.anim.on > 0.999) return null;
      const tl = gsap.timeline();
      tl.to(this.anim, { on: 1, duration: 0.4 }, 0);
      tl.to(sh, { edges: 1, seal: 1, duration: 0.9, ease: 'power2.inOut' }, 0);
      tl.to(this.anim.labels, { 0: 1, 1: 1, 2: 1, 3: 1, duration: 0.4 }, 0.3);
      return tl;
    }
    const tl = gsap.timeline();
    tl.to(sh, { seal: 0, edges: 0, duration: 0.6, ease: 'power2.inOut' }, 0);
    tl.to(this.anim, { on: 0, duration: 0.6 }, 0.2);
    tl.to(this.anim.labels, { 0: 0, 1: 0, 2: 0, 3: 0, duration: 0.3 }, 0);
    return tl;
  }

  update(rig: Rig, local: number, dt: number, time: number, e: Engine) {
    this.hover.update(dt, state.screen === 5);
    const fan = Math.max(this.hover.get('tender-monitoring'), this.hover.get('tender-application'));
    const close = Math.max(this.hover.get('contracts'), this.hover.get('corporate'));
    const exit = smooth(range(local, 0.7, 1.0));
    rig.bg.a = 'sand';
    rig.bg.b = 'ivory';
    rig.bg.mix = exit;
    rig.bg.mask = 'uniform';
    rig.beam = 0;
    rig.envMix = 0;
    rig.envRot = 3.8 + local * 0.4;
    rig.cam.set(0, 0, 7.6);
    rig.look.set(0, 0, 0);
    rig.fov = 30;
    // на выходе — к раскладке S7 (сфера в правый верхний угол)
    applyLayout(rig, growthLayout(), exit, serviceLayout());
    rig.parallax = 0.6;
    rig.pointerBulge = 0.2;
    rig.sphereScale = 0.86;
    rig.sphereVisible = true;
    rig.atomPos.set(0, 0, 0);
    rig.lift = 0;

    const sh = e.sheets;
    sh.fan = fan;
    sh.close = close;
    sh.lines.uniforms.uGlobal.value = this.anim.on;
    sh.meshes.forEach((m) => ((m.material as THREE.MeshPhysicalMaterial).opacity = this.anim.on));
    sh.update(time, { hoveredSheet: fan > 0.3 ? 2 : -1 });
    for (let i = 0; i < 4; i++) {
      const m = sh.meshes[LABEL_SHEETS[i]];
      this.tmp.copy(m.position).add(new THREE.Vector3(0, 0.36, 0)).applyMatrix4(e.atom.matrixWorld);
      const p = e.project(this.tmp, { x: 0, y: 0, z: 0 });
      const a = state.anchors[`sheet-${i}`] || (state.anchors[`sheet-${i}`] = { x: 0, y: 0, visible: 0, hot: 0 });
      a.x = p.x;
      a.y = p.y;
      a.visible = this.anim.labels[i] * this.anim.on;
      a.hot = i < 2 ? fan : close;
    }
    const n = Math.round(sh.arrive.reduce((acc, v) => acc + (v > 0.95 ? 1 : 0), 0));
    rig.status = `SHEETS ${n}/8 · ${sh.seal > 0.99 ? 'SEALED' : sh.edges > 0.01 ? 'EDGES' : 'ARRIVING'}`;
  }
}
