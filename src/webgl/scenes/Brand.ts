/**
 * S4 · БРЕНД И КОНТЕНТ (BRIEF-3 §5). Сфера не деформируется. Пять линейных фигур рисуются и стираются по кругу
 * в порядке строк (каждая 1.4 с рисуется, 3 с держится, 0.6 с стирается); hover фиксирует свою фигуру.
 * Свет при «луче» становится контровым (поворот окружения на 140°, 1.5 с).
 */
import gsap from 'gsap';
import * as THREE from 'three';
import type { Engine } from '../Engine';
import type { Rig } from '../Story';
import type { SceneModule, Phase } from './types';
import { range, smooth, lerp } from '../math';
import { HoverMix } from './hover';
import { FIGURE_IDS } from '../objects/Figures';
import { state } from '../../lib/state';
import { applyLayout, serviceLayout } from './layout';

const DRAW = 1.4;
const HOLD = 3.0;
const ERASE = 0.6;
const STEP = DRAW + HOLD + ERASE;

export class BrandScene implements SceneModule {
  readonly id = 'brand';
  private hover = new HoverMix(FIGURE_IDS, 5);
  private tmp = new THREE.Vector3();
  private anim = { on: 0, label: 0 };
  /** текущая фигура цикла */
  private current = 0;
  private hoverFig = -1;
  private beamLight = 0;

  init() {}

  setActive(on: boolean, e: Engine) {
    e.figures.group.visible = on;
    if (!on) {
      const a = state.anchors['figure'];
      if (a) a.visible = 0;
    }
  }

  private figureTween(f: number, tl: gsap.core.Timeline, at: number, e: Engine) {
    const fig = e.figures;
    tl.set(fig.erase, { [f]: 0 }, at);
    tl.set(fig.draw, { [f]: 0 }, at);
    tl.to(fig.draw, { [f]: 1, duration: DRAW, ease: 'power2.inOut' }, at);
    tl.to(fig.erase, { [f]: 1, duration: ERASE, ease: 'power2.inOut' }, at + DRAW + HOLD);
    tl.set(this, { current: f }, at);
    if (f === 3) tl.fromTo(fig, { wave: 0 }, { wave: 3.999, duration: DRAW + HOLD, ease: 'none' }, at);
    if (f === 4) {
      tl.to(this, { beamLight: 1, duration: 1.5, ease: 'power2.inOut' }, at + 0.2);
      tl.to(this, { beamLight: 0, duration: 1.0, ease: 'power2.inOut' }, at + DRAW + HOLD);
    }
  }

  timeline(phase: Phase, e: Engine) {
    if (phase === 'enter') {
      const tl = gsap.timeline();
      this.anim.on = 0;
      for (let f = 0; f < 5; f++) {
        e.figures.draw[f] = 0;
        e.figures.erase[f] = 0;
      }
      tl.to(this.anim, { on: 1, duration: 0.4 }, 0);
      this.figureTween(0, tl, 0.3, e);
      tl.to(this.anim, { label: 1, duration: 0.4 }, 0.3 + DRAW);
      return tl;
    }
    if (phase === 'hold') {
      // цикл фигур 2..5 → 1 …: repeat; после отменённого выхода — сначала вернуть видимость
      const tl = gsap.timeline({ repeat: -1 });
      if (this.anim.on < 0.999) tl.to(this.anim, { on: 1, label: 1, duration: 0.5 }, 0);
      for (let k = 0; k < 5; k++) this.figureTween((k + 1) % 5, tl, k * STEP, e);
      return tl;
    }
    const tl = gsap.timeline();
    tl.to(this.anim, { on: 0, label: 0, duration: 0.6, ease: 'power2.inOut' }, 0);
    tl.to(this, { beamLight: 0, duration: 0.6 }, 0);
    return tl;
  }

  update(rig: Rig, local: number, dt: number, time: number, e: Engine) {
    this.hover.update(dt, state.screen === 3);
    const active = this.hover.active;
    const exit = smooth(range(local, 0.7, 1.0));
    rig.bg.a = 'ivory';
    rig.bg.b = 'clay';
    rig.bg.mix = exit;
    rig.bg.mask = 'uniform'; // радиальная маска давала тёмное «пятно» вокруг сферы на выходе
    rig.envMix = 0;
    rig.envRot = 0.9 + local * 0.6 + this.beamLight * 2.44;
    rig.beam = this.beamLight * 0.6;
    rig.cam.set(0, 0, 7.2);
    rig.look.set(0, 0, 0);
    rig.fov = 30;
    applyLayout(rig, serviceLayout());
    rig.parallax = 0.8;
    rig.pointerBulge = 0.4;
    rig.sphereScale = 1;
    rig.sphereVisible = true;
    rig.atomPos.set(0, 0, 0);
    rig.lift = 0;

    // hover фиксирует фигуру: она дорисовывается и держится, остальные приглушены
    const fig = e.figures;
    if (active >= 0) {
      if (this.hoverFig !== active) {
        this.hoverFig = active;
        gsap.killTweensOf(fig.draw);
        gsap.to(fig.draw, { [active]: 1, duration: 0.9, ease: 'power2.inOut', overwrite: true });
        gsap.to(fig.erase, { [active]: 0, duration: 0.3, overwrite: true });
      }
    } else if (this.hoverFig >= 0) {
      const f = this.hoverFig;
      this.hoverFig = -1;
      if (f !== this.current) gsap.to(fig.erase, { [f]: 1, duration: ERASE, ease: 'power2.inOut', overwrite: true });
    }
    fig.lines.uniforms.uGlobal.value = this.anim.on;
    fig.update(time, active);
    // подпись у текущей фигуры (сверху-справа от сферы)
    const shown = active >= 0 ? active : this.current;
    const r = [1.9, 1.55, 1.5, 1.95, 0.5][shown];
    this.tmp.set(shown === 4 ? 0.5 : r * 0.72, shown === 4 ? 2.6 : r * 0.72, 0.2).applyMatrix4(e.atom.matrixWorld);
    const p = e.project(this.tmp, { x: 0, y: 0, z: 0 });
    const a = state.anchors['figure'] || (state.anchors['figure'] = { x: 0, y: 0, visible: 0, hot: 0 });
    a.x = p.x;
    a.y = p.y;
    a.visible = this.anim.label * this.anim.on * (fig.draw[shown] > 0.6 && fig.erase[shown] < 0.4 ? 1 : 0);
    a.hot = active >= 0 ? 1 : 0;
    state.figureIndex = shown;
    rig.status = `FIGURE 0${shown + 1}/05 · ${['STAR', 'LENS', '9:16', 'WAVE', 'BEAM'][shown]}`;
  }
}
