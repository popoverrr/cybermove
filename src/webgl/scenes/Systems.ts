/**
 * S3 · СИСТЕМЫ — SYSTEM (BRIEF §7 S3). Тема stone (известняк), текст тёмный.
 * Граф: ядро в центре (меньше), 5 жемчужных узлов, волосяные связи с бегущими точками. Сборка механическая.
 * Hover: узел выезжает вперёд, остальные приглушаются. Выход: узлы стекают в каплю, фон светлеет до ivory.
 */
import type { Engine } from '../Engine';
import type { Rig } from '../Story';
import type { SceneModule } from './types';
import { getTarget } from '../objects/targets';
import { POST_PAPER } from '../Post';
import { SURFACE } from '../objects/LiquidChrome';
import { range, smooth, easeInOutCubic, lerp } from '../math';
import { HoverMix } from './hover';
import { NODE_IDS } from '../objects/Nodes';
import { state } from '../../lib/state';

export class SystemsScene implements SceneModule {
  readonly id = 'systems';
  readonly range = { enter: 0.1, exit: 0.8 };
  private hover = new HoverMix(NODE_IDS);

  init() {}

  update(rig: Rig, local: number, dt: number, time: number, e: Engine) {
    const cu = e.core.uniforms;
    const pu = e.particles.uniforms;
    this.hover.update(dt, state.screen === 2);
    const hovered = this.hover.active;

    const exitX = range(local, 0.8, 1.0);
    const ex = easeInOutCubic(exitX);

    // ---------- фон: stone; на выходе — ivory
    rig.bg.a = 'stone';
    rig.bg.b = 'ivory';
    rig.bg.mix = ex;
    rig.bg.mask = 'uniform';
    rig.beam = 0;
    rig.envMix = 1 - ex;
    Object.assign(rig.post, POST_PAPER);

    // ---------- камера, ядро
    rig.cam.set(0, 0, 7.0);
    rig.look.set(0, 0, 0);
    rig.fov = 30;
    rig.layoutOffset = 0.85;
    rig.parallax = 0.7;
    rig.pointerBulge = 0;
    rig.atomScale = lerp(0.72, 0.86, ex);
    rig.coreVisible = true;
    // ядро меньше; на выходе узлы стекаются, ядро становится каплей и растёт
    rig.coreScale = lerp(0.58, 1.05, ex);
    rig.coreStretch.set(1, 1, 1);
    cu.uNoiseAmp.value = lerp(SURFACE.noiseAmp, SURFACE.noiseAmp * 1.6, ex);
    cu.uWorleyAmp.value = lerp(SURFACE.worleyAmp, SURFACE.worleyAmp * 0.5, ex);
    e.core.setShapes(0, 6);
    cu.uMorph.value = smooth(range(exitX, 0.15, 0.9));
    cu.uTurb.value = 0.08;
    rig.orbits.visible = 0;
    rig.orbits.count = 0;
    rig.envRot = 0.4 + local * 0.6;

    // ---------- узлы
    const assemble = range(local, 0.05, 0.62);
    e.nodes.update({ time, dt, assemble, collapse: smooth(range(local, 0.78, 0.97)), hovered, on: 1 });

    // ---------- частицы: сеть → связи графа; на выходе — в каплю
    if (exitX <= 0) {
      e.particles.setTarget('A', getTarget('network'), 'network');
      e.particles.setTarget('B', getTarget('links'), 'links');
      pu.uMix.value = smooth(range(local, 0.02, 0.35));
      pu.uCurlAmp.value = 0.012;
      pu.uJitter.value = 0.006;
      rig.particles.opacity = 0.45;
      rig.particles.size = 1.3;
    } else {
      e.particles.setTarget('A', getTarget('links'), 'links');
      e.particles.setTarget('B', getTarget('1s'), '1s');
      pu.uMix.value = ex;
      pu.uCurlAmp.value = 0.03 + 0.25 * Math.sin(ex * Math.PI);
      rig.particles.opacity = lerp(0.45, 0.35, ex);
      rig.particles.size = lerp(1.4, 1.2, ex);
    }
    rig.atomPos.set(0, 0, 0);
  }
}
