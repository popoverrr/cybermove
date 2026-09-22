/**
 * Story — единое состояние сюжета (BRIEF §8.7): прогресс экранов (из DOM через state) → параметры
 * камеры, ядра, частиц, орбит, фона и пост-эффектов. Сцены не знают о DOM: каждая — функция
 * от локального прогресса и времени, пишущая в Rig. Story применяет Rig к объектам.
 */
import * as THREE from 'three';
import type { Engine } from './Engine';
import { state } from '../lib/state';
import { POST_PAPER, lerpPost, type PostParams } from './Post';
import type { BgMode, MASK } from './backgrounds/Background';
import { damp, clamp01 } from './math';
import { CoreScene } from './scenes/Core';
import { AuditScene } from './scenes/Audit';
import { SystemsScene } from './scenes/Systems';
import { BrandScene } from './scenes/Brand';
import { TrafficScene } from './scenes/Traffic';
import { LegalScene } from './scenes/Legal';
import { GrowthScene } from './scenes/Growth';
import { ContactScene } from './scenes/Contact';
import type { SceneModule } from './scenes/types';
import './objects/fields';
import { ORBIT_LINE } from './objects/Orbits';

export interface Rig {
  cam: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  /** смещение атома относительно раскладки (десктоп — вправо, мобильный — вверх) */
  layoutOffset: number; // 0..1 — сила смещения
  atomPos: THREE.Vector3;
  /** общий масштаб атома (ядро + орбиты + облако) */
  atomScale: number;
  coreScale: number;
  coreStretch: THREE.Vector3;
  coreVisible: boolean;
  /** свечение ядра 0..1 (S5 «раскалено добела», импульс отправки формы) */
  coreEmissive: number;
  /** 1 — ядро стоит вертикально без покачивания (монолит) */
  coreUpright: number;
  envMix: number;
  envRot: number;
  bg: { a: BgMode; b: BgMode; mix: number; mask: keyof typeof MASK };
  beam: number;
  post: PostParams;
  orbits: { visible: number; spread: number; speedMul: number; width: number; opacity: number; color: THREE.Color; count: number };
  particles: { opacity: number; size: number };
  parallax: number;
  pointerBulge: number;
}

export class Story {
  readonly engine: Engine;
  readonly rig: Rig;
  readonly scenes: SceneModule[] = [];
  private active = 0;
  private layoutX = 1.5;
  private layoutY = 0;
  private layoutScale = 1;
  private camMul = 1;
  private smoothPointer = new THREE.Vector2();
  private atomRot = new THREE.Vector2();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private lastPointer = new THREE.Vector2(-1, -1);
  private hoverDist = Infinity;
  readonly postNow: PostParams = { ...POST_PAPER };
  /** шлейфы электронов только с мышью (BRIEF-2 §8.6) */
  private trails = !matchMedia('(pointer: coarse)').matches;

  constructor(engine: Engine) {
    this.engine = engine;
    this.rig = {
      cam: new THREE.Vector3(0, 0, 7.6),
      look: new THREE.Vector3(0, 0, 0),
      fov: 30,
      layoutOffset: 1,
      atomPos: new THREE.Vector3(),
      atomScale: 0.86,
      coreScale: 1,
      coreStretch: new THREE.Vector3(1, 1, 1),
      coreVisible: true,
      coreEmissive: 0,
      coreUpright: 0,
      envMix: 0,
      envRot: 0,
      bg: { a: 'ivory', b: 'ivory', mix: 0, mask: 'uniform' },
      beam: 0,
      post: { ...POST_PAPER },
      orbits: { visible: 1, spread: 1, speedMul: 1, width: 1, opacity: 0.7, color: ORBIT_LINE.clone(), count: 5 },
      particles: { opacity: 0.35, size: 1.2 },
      parallax: 1,
      pointerBulge: 1,
    };
    this.scenes = [new CoreScene(), new AuditScene(), new SystemsScene(), new BrandScene(), new TrafficScene(), new LegalScene(), new GrowthScene(), new ContactScene()];
    for (const s of this.scenes) s.init(engine, this.rig);
    this.onResize(window.innerWidth, window.innerHeight);
  }

  onResize(w: number, h: number) {
    const mobile = state.mobile;
    // сцена по центру-справа на десктопе, сверху на мобильном
    // атом справа, слегка заходит на текстовую колонку (ref-12)
    this.layoutX = mobile ? 0 : 1.32 * Math.min(1, (w / h) / 1.6);
    this.layoutY = mobile ? 1.0 : 0;
    // на мобильном атом меньше и дальше: сцена занимает верхнюю треть
    this.layoutScale = mobile ? 0.62 : Math.min(1, Math.max(0.8, (w / h) / 1.5));
    this.camMul = mobile ? 1.12 : 1;
    this.scenes.forEach((s) => s.onResize?.(w, h, mobile));
  }

  /** Активный экран выбирает DOM (home.ts, с гистерезисом по сглаженному прогрессу) */
  private pickActive(): number {
    return Math.min(Math.max(0, state.screen), this.scenes.length - 1);
  }

  /**
   * Прокрутка экрана → local сцены (BRIEF-2 §8.2): вход занимает первые 20 % (power2.inOut → range.enter),
   * выход — последние 30 % (range.exit → 1), середина линейная. Сглаженный прогресс уже без рывков,
   * easing на краях делает старт и финиш переходов мягкими.
   */
  private sceneLocal(local: number, range: { enter: number; exit: number }): number {
    const ENTER = 0.2;
    const EXIT = 0.7;
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    if (local <= ENTER) return ease(local / ENTER) * range.enter;
    if (local < EXIT) return range.enter + ((local - ENTER) / (EXIT - ENTER)) * (range.exit - range.enter);
    return range.exit + ease((local - EXIT) / (1 - EXIT)) * (1 - range.exit);
  }

  update(dt: number, time: number) {
    const e = this.engine;
    const rig = this.rig;
    this.active = this.pickActive();
    const scene = this.scenes[this.active];
    const local = this.sceneLocal(clamp01(state.screens[this.active]), scene.range);
    rig.coreEmissive = 0;
    rig.coreUpright = 0;
    scene.update(rig, local, dt, time, e);
    this.applyObjectDefaults(dt, time);

    // --- камера + параллакс от курсора (инерционный)
    const px = state.pointer.active ? state.pointer.nx : 0;
    const py = state.pointer.active ? state.pointer.ny : 0;
    this.smoothPointer.x = damp(this.smoothPointer.x, px, 3.2, dt);
    this.smoothPointer.y = damp(this.smoothPointer.y, py, 3.2, dt);
    const par = rig.parallax * (state.reduced ? 0 : 1);
    e.camera.position.set(
      rig.cam.x + this.smoothPointer.x * 0.22 * par,
      rig.cam.y + this.smoothPointer.y * 0.14 * par,
      rig.cam.z * (1 + (this.camMul - 1) * rig.layoutOffset),
    );
    e.camera.lookAt(rig.look);
    if (Math.abs(e.camera.fov - rig.fov) > 0.01) {
      e.camera.fov = rig.fov;
      e.camera.updateProjectionMatrix();
    }

    // --- атом: раскладка + поворот к курсору
    const lx = this.layoutX * rig.layoutOffset;
    const ly = this.layoutY * rig.layoutOffset;
    e.atom.position.set(rig.atomPos.x + lx, rig.atomPos.y + ly, rig.atomPos.z);
    e.atom.scale.setScalar(rig.atomScale * (1 + (this.layoutScale - 1) * rig.layoutOffset));
    this.atomRot.x = damp(this.atomRot.x, -this.smoothPointer.y * 0.12 * par, 2.5, dt);
    this.atomRot.y = damp(this.atomRot.y, this.smoothPointer.x * 0.16 * par, 2.5, dt);
    e.atom.rotation.set(this.atomRot.x, this.atomRot.y + time * 0.02, 0);

    // --- ядро
    const core = e.core;
    core.mesh.visible = rig.coreVisible && rig.coreScale > 0.001;
    core.mesh.scale.setScalar(Math.max(rig.coreScale, 0.0001));
    core.uniforms.uStretch.value.copy(rig.coreStretch);
    core.uniforms.uEnvMix.value = rig.envMix;
    core.mesh.rotation.y = time * 0.05;
    core.mesh.rotation.x = Math.sin(time * 0.11) * 0.08 * (1 - rig.coreUpright);
    // светлеет к бумаге, а не раскаляется: emissive paper с небольшой интенсивностью
    core.material.emissiveIntensity = rig.coreEmissive * 0.42;
    // прогиб к курсору: направление в объектных координатах
    if (rig.pointerBulge > 0 && state.pointer.active && !state.reduced) {
      this.tmp.set(this.smoothPointer.x * 3.5, this.smoothPointer.y * 2.2, 2.5).sub(this.tmp2.copy(e.atom.position));
      this.tmp.normalize();
      core.mesh.getWorldQuaternion(new THREE.Quaternion());
      const q = core.mesh.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.tmp.applyQuaternion(q);
      core.uniforms.uPointerDir.value.lerp(this.tmp, 1 - Math.exp(-4 * dt));
      core.uniforms.uPointerAmt.value = damp(core.uniforms.uPointerAmt.value, 0.09 * rig.pointerBulge, 3, dt);
    } else {
      core.uniforms.uPointerAmt.value = damp(core.uniforms.uPointerAmt.value, 0, 3, dt);
    }

    // --- окружение: вращение бликов
    e.scene.environmentRotation.set(0, rig.envRot + time * 0.035 + this.smoothPointer.x * 0.08, 0);
    e.scene.environment = e.env.warm;

    // --- фон
    e.background.set(rig.bg.a, rig.bg.b, rig.bg.mix, rig.bg.mask);
    e.background.uniforms.uMouse.value.set(this.smoothPointer.x, this.smoothPointer.y);
    e.background.uniforms.uScroll.value = state.progress;
    e.background.uniforms.uBeam.value = rig.beam;
    // луч — под атомом: экранная x-координата атома в координатах фона
    this.tmp.copy(e.atom.position).project(e.camera);
    e.background.uniforms.uBeamPos.value.set(this.tmp.x * (e.camera.aspect), -1.0);

    // --- орбиты
    const ob = rig.orbits;
    // NDC на device-px для спрайтов-электронов: 2·tan(fov/2) / высота / масштаб атома
    const ndcPerPx = (2 * Math.tan((e.camera.fov * Math.PI) / 360)) / Math.max(1, e.resolution.y) / Math.max(1e-3, e.atom.scale.x);
    const dpr = e.renderer.getPixelRatio();
    for (let i = 0; i < e.orbits.length; i++) {
      const o = e.orbits[i];
      const inCount = i < ob.count ? 1 : 0;
      o.visible = damp(o.visible, ob.visible * inCount, 6, dt);
      if (dt === 0) o.visible = ob.visible * inCount;
      o.spread = ob.spread;
      o.highlight = damp(o.highlight, state.orbitHover === i ? 1 : 0, 8, dt);
      o.update(dt, time, { speedMul: ob.speedMul, baseColor: ob.color, baseOpacity: ob.opacity, width: ob.width, trails: this.trails, dpr, ndcPerPx });
    }

    // --- частицы: тёмная пыль, цвет по глубине задан в шейдере
    const pu = e.particles.uniforms;
    pu.uOpacity.value = rig.particles.opacity;
    pu.uSize.value = rig.particles.size;

    // --- пост-эффекты
    lerpPost(this.postNow, rig.post, dt === 0 ? 1 : 1 - Math.exp(-5 * dt), this.postNow);
    e.post?.apply(this.postNow);

    this.updateOrbitHover();
  }

  /** Объекты, не тронутые активной сценой в этом кадре, получают состояние «выключено» */
  private applyObjectDefaults(dt: number, time: number) {
    const e = this.engine;
    if (!e.scan.touched) {
      e.scan.updateClipping(e.core, e.atom, false);
      e.scan.update({ time, scan: 1, on: 0, layers: 0, hist: 0, split: 0, traj: 0, pointsSpread: 4 });
      for (let i = 0; i < 6; i++) {
        const a = state.anchors[`dp-${i}`];
        if (a) a.visible = 0;
      }
    }
    if (!e.nodes.touched) e.nodes.update({ time, dt, assemble: 1, collapse: 1, hovered: -1, on: 0 });
    if (!e.streams.touched) {
      e.streams.update({ time, dt, draw: 1, on: 0, hovered: -1, freeze: 1 });
      for (const k of Object.keys(state.anchors)) if (k.startsWith('metric-')) state.anchors[k].visible = 0;
    }
    if (!e.plates.touched) e.plates.update({ time, dt, assemble: 0, contour: 0, seal: 0, open: 0, fan: 0, close: 0, on: 0 });
    e.scan.touched = e.nodes.touched = e.streams.touched = e.plates.touched = false;
  }

  /** Hover/подписи орбит: проекция орбит в экран, расстояние до курсора (только на первом экране, только с мышью) */
  private updateOrbitHover() {
    const e = this.engine;
    const labels = state.orbitLabels;
    const p = state.pointer;
    if (!this.trails) {
      // тач: без hover орбит (BRIEF-2 §8.6) — подписи прячем, проекции не считаем
      for (const lab of labels) if (lab) lab.visible = 0;
      state.orbitHover = -1;
      return;
    }
    const onCore = this.active === 0 && state.screens[0] < 0.55;
    let best = -1;
    let bestD = 28;
    e.atom.updateMatrixWorld();
    for (let i = 0; i < e.orbits.length; i++) {
      const o = e.orbits[i];
      const lab = labels[i];
      if (!lab) continue;
      // подпись у электрона
      this.tmp.copy(o.electron.position).applyMatrix4(e.atom.matrixWorld);
      const s = e.project(this.tmp, { x: 0, y: 0, z: 0 });
      lab.x = s.x;
      lab.y = s.y;
      lab.visible = onCore ? o.visible : 0;
      if (!onCore || !p.active || o.visible < 0.5) continue;
      for (let k = 0; k < 48; k++) {
        o.pointAt(k / 48, this.tmp).applyMatrix4(e.atom.matrixWorld);
        const q = e.project(this.tmp, { x: 0, y: 0, z: 0 });
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    state.orbitHover = best;
    this.hoverDist = bestD;
  }
}
