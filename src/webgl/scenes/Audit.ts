/**
 * S2 · АУДИТ — CORE (BRIEF §7 S2). Тема sand, тёплый студийный свет.
 * Вход: камера отъезжает от заполнившего экран ядра, атом уходит вправо. Сквозь ядро проходит
 * сканирующая плоскость (прогресс по скроллу): с одной стороны жемчуг, с другой тёмный каркас. Проявляются
 * точки данных (CAC, LTV, ROMI, Cash flow, маржа, конверсия). Выход: точки становятся узлами сети,
 * фон переходит в stone.
 */
import type { Engine } from '../Engine';
import type { Rig } from '../Story';
import type { SceneModule } from './types';
import { getTarget } from '../objects/targets';
import { POST_PAPER } from '../Post';
import { SURFACE } from '../objects/Sphere';
import { range, smooth, easeInOutCubic, easeOutCubic, lerp } from '../math';
import { HoverMix } from './hover';
import { state } from '../../lib/state';
import { DATA_POINTS } from '../objects/Scan';
import * as THREE from 'three';

const KEYS = ['business-audit', 'financial-audit', 'investment', 'strategy'] as const;

export class AuditScene implements SceneModule {
  readonly id = 'audit';
  readonly range = { enter: 0.22, exit: 0.8 };
  private hover = new HoverMix(KEYS);
  private tmp = new THREE.Vector3();

  init() {}

  update(rig: Rig, local: number, dt: number, time: number, e: Engine) {
    const cu = e.core.uniforms;
    const pu = e.particles.uniforms;
    this.hover.update(dt, state.screen === 1);
    const hBiz = this.hover.get('business-audit');
    const hFin = this.hover.get('financial-audit');
    const hInv = this.hover.get('investment');
    const hStr = this.hover.get('strategy');

    const enter = easeOutCubic(range(local, 0, 0.22));
    const exitX = range(local, 0.8, 1.0);
    const ex = easeInOutCubic(exitX);

    // ---------- фон: ivory → sand на входе, sand → stone на выходе (сверху вниз)
    if (exitX <= 0) {
      rig.bg.a = 'ivory';
      rig.bg.b = 'sand';
      rig.bg.mix = smooth(range(local, 0, 0.18));
      rig.bg.mask = 'uniform';
    } else {
      rig.bg.a = 'sand';
      rig.bg.b = 'stone';
      rig.bg.mix = ex;
      rig.bg.mask = 'top';
    }
    rig.beam = 0;
    rig.envMix = ex;
    Object.assign(rig.post, POST_PAPER);

    // ---------- камера и раскладка: от 2.35 (ядро во весь экран) к 6.6, атом вправо
    rig.cam.set(0, 0, lerp(2.35, 6.6, enter));
    rig.look.set(0, 0, 0);
    rig.fov = 30;
    rig.layoutOffset = enter;
    rig.parallax = enter * 0.7;
    rig.pointerBulge = 0;
    rig.atomScale = lerp(0.86, 0.72, ex);
    rig.coreVisible = true;
    rig.coreScale = lerp(1.15, 1.0, enter) * (1 - ex * 0.42);
    rig.coreStretch.set(1, 1 + hBiz * 0.22, 1);
    cu.uNoiseAmp.value = lerp(SURFACE.noiseAmp * 0.5, SURFACE.noiseAmp, enter);
    cu.uWorleyAmp.value = SURFACE.worleyAmp;
    e.core.setShapes(0, 0);
    cu.uMorph.value = 0;
    rig.orbits.visible = 0;
    rig.orbits.count = 0;
    rig.envRot = 0.4 * enter;

    // ---------- скан по скроллу
    const scan = smooth(range(local, 0.14, 0.72));
    const on = smooth(range(local, 0.06, 0.2)) * (1 - smooth(range(local, 0.86, 0.98)));
    e.scan.update({
      time,
      scan: exitX > 0 ? 1 : scan,
      on,
      layers: hBiz,
      hist: hFin,
      split: hInv,
      traj: hStr,
      pointsSpread: 1 + ex * 3.5,
    });
    e.scan.updateClipping(e.core, e.atom, on > 0.01 && scan > 0.001 && scan < 0.999 && exitX <= 0);

    // подписи точек данных → HTML
    for (let i = 0; i < DATA_POINTS.length; i++) {
      const p = e.scan.points[i];
      this.tmp.copy(p.position).applyMatrix4(e.atom.matrixWorld);
      const s = e.project(this.tmp, { x: 0, y: 0, z: 0 });
      const a = state.anchors[`dp-${i}`] || (state.anchors[`dp-${i}`] = { x: 0, y: 0, visible: 0, hot: 0 });
      a.x = s.x;
      a.y = s.y;
      const pu2 = (p.material as THREE.ShaderMaterial).uniforms;
      a.visible = pu2.uOpacity.value * (1 - ex);
      a.hot = pu2.uHot.value;
    }

    // ---------- частицы: штрихи → редкий фон → сеть на выходе
    if (exitX <= 0) {
      e.particles.setTarget('A', getTarget('streak'), 'streak');
      e.particles.setTarget('B', getTarget('calm'), 'calm');
      pu.uMix.value = smooth(range(local, 0, 0.25));
      pu.uCurlAmp.value = 0.05;
      rig.particles.opacity = lerp(0.45, 0.3, enter);
      rig.particles.size = lerp(1.5, 1.2, enter);
    } else {
      e.particles.setTarget('A', getTarget('calm'), 'calm');
      e.particles.setTarget('B', getTarget('network'), 'network');
      pu.uMix.value = ex;
      pu.uCurlAmp.value = 0.04 + 0.2 * Math.sin(ex * Math.PI);
      rig.particles.opacity = lerp(0.3, 0.45, ex);
      rig.particles.size = lerp(1.2, 1.4, ex);
    }
    rig.atomPos.set(0, 0, 0);
  }
}
