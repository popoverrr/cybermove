/**
 * S2 · АУДИТ (BRIEF-3 §5). Скан-плоскость идёт сверху вниз 2.6 с; под ней — чертёжная сетка широт и долгот
 * с точками; кромка скана с рисками; шесть подписей данных появляются по мере прохода скана.
 * Hover: гистограмма, траектория, инвестиции (точки делятся), аудит (слои сетки расходятся).
 */
import gsap from 'gsap';
import * as THREE from 'three';
import type { Engine } from '../Engine';
import type { Rig } from '../Story';
import type { SceneModule, Phase } from './types';
import { range, smooth, lerp } from '../math';
import { HoverMix } from './hover';
import { state } from '../../lib/state';
import { applyLayout, serviceLayout } from './layout';
import { DATA_NODES } from '../objects/Grid';

const KEYS = ['business-audit', 'financial-audit', 'investment', 'strategy'] as const;

export class AuditScene implements SceneModule {
  readonly id = 'audit';
  private hover = new HoverMix(KEYS);
  private tmp = new THREE.Vector3();
  /** прогресс скана 0..1 (по таймлайну) и общая видимость */
  private anim = { scan: 0, on: 0 };
  /** плоскость скана: выше неё (где скан прошёл) сфера срезана (localClipping) и видна чертёжная сетка; ниже — сфера как есть */
  private plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);

  init(e: Engine) {
    e.renderer.localClippingEnabled = true;
    e.core.material.clippingPlanes = [this.plane];
  }

  setActive(on: boolean, e: Engine) {
    e.grid.group.visible = on;
    if (!on) {
      this.plane.constant = 1e6;
      for (let i = 0; i < DATA_NODES.length; i++) {
        const a = state.anchors[`dp-${i}`];
        if (a) a.visible = 0;
      }
    }
  }

  timeline(phase: Phase, _e: Engine) {
    if (phase === 'enter') {
      const tl = gsap.timeline();
      this.anim.scan = 0;
      this.anim.on = 0;
      tl.to(this.anim, { on: 1, duration: 0.5 }, 0);
      tl.to(this.anim, { scan: 1, duration: 2.6, ease: 'power2.inOut' }, 0.2);
      return tl;
    }
    if (phase === 'hold') {
      // удержание: плоскость медленно дышит между низом и серединой сферы (8 с цикл) — сфера то срезана, то почти целая
      const tl = gsap.timeline({ repeat: -1, yoyo: true });
      tl.to(this.anim, { scan: 1, on: 1, duration: 0.9, ease: 'power2.inOut' }, 0);
      tl.to(this.anim, { scan: 0.42, duration: 4.0, ease: 'power1.inOut' }, 1.2);
      return tl;
    }
    // выход: плоскость скана поднимается обратно — сфера «зарастает» снизу вверх, затем сетка гаснет
    const tl = gsap.timeline();
    tl.to(this.anim, { scan: 0, duration: 1.4, ease: 'power2.inOut' }, 0);
    tl.to(this.anim, { on: 0, duration: 0.6, ease: 'power2.inOut' }, 0.9);
    return tl;
  }

  update(rig: Rig, local: number, dt: number, time: number, e: Engine) {
    this.hover.update(dt, state.screen === 1);
    const hBiz = this.hover.get('business-audit');
    const hFin = this.hover.get('financial-audit');
    const hInv = this.hover.get('investment');
    const hStr = this.hover.get('strategy');
    const enter = smooth(range(local, 0, 0.3));
    const exit = smooth(range(local, 0.7, 1.0));

    rig.bg.a = 'sand';
    rig.bg.b = 'stone';
    rig.bg.mix = exit;
    rig.bg.mask = 'top';
    rig.beam = 0;
    rig.envMix = 0;
    rig.envRot = 0.35 * enter;
    rig.cam.set(0, 0, lerp(5.6, 6.8, enter));
    rig.look.set(0, 0, 0);
    rig.fov = 30;
    applyLayout(rig, serviceLayout());
    rig.parallax = 0.7;
    rig.pointerBulge = 0.3;
    rig.sphereScale = 1;
    rig.sphereVisible = true;
    rig.atomPos.set(0, 0, 0);
    rig.lift = 0;

    const on = this.anim.on;
    // срез сферы плоскостью скана: видимо y ≤ plane (нормаль вниз); плоскость в мировых координатах по положению атома
    const scanWorldY = e.atom.position.y + (1.15 - this.anim.scan * 2.3) * e.atom.scale.y * rig.sphereScale;
    this.plane.constant = on > 0.5 ? scanWorldY : 1e6;
    e.grid.update(time, e.renderer.getPixelRatio(), {
      scan: this.anim.scan,
      scanOn: on,
      grid: on,
      hist: hFin,
      traj: hStr,
      split: hInv,
      layers: hBiz,
      dotsOn: on,
    });
    // подписи данных: появляются, когда скан прошёл их высоту
    for (let i = 0; i < DATA_NODES.length; i++) {
      e.grid.dataPoint(i, this.tmp).applyMatrix4(e.atom.matrixWorld);
      const s = e.project(this.tmp, { x: 0, y: 0, z: 0 });
      const a = state.anchors[`dp-${i}`] || (state.anchors[`dp-${i}`] = { x: 0, y: 0, visible: 0, hot: 0 });
      a.x = s.x;
      a.y = s.y;
      const py = Math.sin(THREE.MathUtils.degToRad(DATA_NODES[i][0]));
      const passed = smooth(range(e.grid.scanY, py + 0.12, py - 0.12));
      const dim = hInv > 0.01 && i % 2 === 1 ? 1 - hInv * 0.7 : 1;
      a.visible = passed * on * dim;
      a.hot = i % 2 === 0 ? hInv : 0;
    }
    rig.status = `SCAN ${Math.round(this.anim.scan * 100)}% · NODES ${Math.round(this.anim.scan * 72)}/72`;
  }
}
