/**
 * Story — единое состояние сюжета (BRIEF-3 §5–6): «время решает, скролл выбирает».
 * Сглаженный прогресс экранов (из home.ts) выбирает активную сцену и её фазу (вход / удержание / выход);
 * смена фазы запускает GSAP-таймлайн сцены (дискретные события по времени), а непрерывные величины
 * (камера, положение и масштаб атома, фон, окружение) сцена считает от прогресса каждый кадр.
 * Объекты неактивных сцен скрыты (visible = false).
 */
import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from './Engine';
import { state } from '../lib/state';
import { PARAMS } from './params';
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
import type { SceneModule, Phase } from './scenes/types';
import { baseLayout, type Layout } from './scenes/layout';
import { INK, INK_NIGHT } from './objects/LineSet';

export interface Rig {
  cam: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  /** раскладка сферы в долях вьюпорта (см. scenes/layout.ts); Story сбрасывает на base перед каждой сценой */
  layout: Layout;
  /** базовая раскладка устройства (десктоп / мобильный) */
  base: Layout;
  /** смещение атома в радиусах сферы */
  atomPos: THREE.Vector3;
  /** масштаб сферы внутри атома (S3 — меньше, чтобы спутникам было место); атом масштабируется так, чтобы сфера заняла layout.r */
  sphereScale: number;
  /** анимируемый таймлайнами масштаб (интро 0.94 → 1) и непрозрачность сферы */
  sphereScaleAnim: number;
  sphereOpacity: number;
  sphereVisible: boolean;
  /** осветление к paper 0..1 (S5) */
  lift: number;
  /** смешение окружения warm → night */
  envMix: number;
  /** поворот окружения по сцене и анимируемая добавка таймлайнов */
  envRot: number;
  envRotAnim: number;
  bg: { a: BgMode; b: BgMode; mix: number; mask: keyof typeof MASK };
  beam: number;
  /** непрозрачность пыли 0..1 */
  dust: number;
  parallax: number;
  pointerBulge: number;
  /** технический слой: моно-строка состояния в углу канваса */
  status: string;
}

export const PHASE_ENTER_END = 0.3;
export const PHASE_EXIT_START = 0.7;

export function phaseOf(local: number): Phase {
  return local < PHASE_ENTER_END ? 'enter' : local < PHASE_EXIT_START ? 'hold' : 'exit';
}

interface Running {
  scene: number;
  phase: Phase;
  tl: gsap.core.Timeline;
}

export class Story {
  readonly engine: Engine;
  readonly rig: Rig;
  readonly scenes: SceneModule[] = [];
  private active = -1;
  private phase: Phase | null = null;
  private running: Running[] = [];
  /** фаза, отложенная до конца таймлайна входа (удержание/выход не спорят с входом за одни и те же свойства) */
  private pending = new Map<number, Phase>();
  /** сцена, доигрывающая выход после смены экрана (её объекты ещё видны) */
  private leaving = -1;
  private inkMix = -1;
  private inkColor = new THREE.Color();
  private smoothPointer = new THREE.Vector2();
  private atomRot = new THREE.Vector2();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private trails = !matchMedia('(pointer: coarse)').matches;
  private still = PARAMS.still;

  constructor(engine: Engine) {
    this.engine = engine;
    this.rig = {
      cam: new THREE.Vector3(0, 0, 7.6),
      look: new THREE.Vector3(0, 0, 0),
      fov: 30,
      layout: { x: 0.63, y: 0.45, r: 0.18 },
      base: { x: 0.63, y: 0.45, r: 0.18 },
      atomPos: new THREE.Vector3(),
      sphereScale: 1,
      sphereScaleAnim: 1,
      sphereOpacity: 1,
      sphereVisible: true,
      lift: 0,
      envMix: 0,
      envRot: 0,
      envRotAnim: 0,
      bg: { a: 'ivory', b: 'ivory', mix: 0, mask: 'uniform' },
      beam: 0,
      dust: 0,
      parallax: 1,
      pointerBulge: 1,
      status: '',
    };
    this.scenes = [new CoreScene(), new AuditScene(), new SystemsScene(), new BrandScene(), new TrafficScene(), new LegalScene(), new GrowthScene(), new ContactScene()];
    for (const s of this.scenes) s.init(engine, this.rig);
    for (const s of this.scenes) s.setActive(false, engine);
    this.onResize(window.innerWidth, window.innerHeight);
  }

  onResize(w: number, h: number) {
    const mobile = state.mobile;
    // BRIEF-3 §3.7: базовая раскладка устройства; сцены отталкиваются от неё (scenes/layout.ts)
    const b = baseLayout();
    this.rig.base.x = b.x;
    this.rig.base.y = b.y;
    this.rig.base.r = b.r;
    this.scenes.forEach((s) => s.onResize?.(w, h, mobile));
  }

  /** Запуск таймлайна фазы; в still-режиме — сразу в конец (вход/выход) или пауза на времени t (удержание) */
  private start(scene: number, phase: Phase, instant: boolean) {
    const s = this.scenes[scene];
    if (phase !== 'enter' && !instant) {
      // вход ещё играет (timeScale ≤ 1.6) — удержание/выход стартуют по его завершении (BRIEF-3 §6.1)
      const enter = this.running.find((r) => r.scene === scene && r.phase === 'enter' && r.tl.isActive());
      if (enter) {
        this.pending.set(scene, phase);
        enter.tl.eventCallback('onComplete', () => {
          const p = this.pending.get(scene);
          this.pending.delete(scene);
          if (p && ((scene === this.active && this.phase === p) || (p === 'exit' && scene === this.leaving))) this.start(scene, p, false);
        });
        return;
      }
    }
    const tl = s.timeline(phase, this.engine, this.rig);
    if (!tl) return;
    if (instant) {
      tl.progress(1);
      tl.kill();
      return;
    }
    if (this.still) {
      // still-кадр: таймлайн текущей фазы стоит на времени t (удержание — по циклу), скриншоты входа/выхода по ?t
      const d = tl.duration();
      const t = phase === 'exit' && PARAMS.timeExit !== null ? PARAMS.timeExit : (PARAMS.time ?? 4);
      // seek(…, false): pause(t) подавляет onUpdate (suppressEvents), а прогресс рисования орбит идёт через onUpdate
      tl.pause();
      tl.seek(phase === 'hold' ? (d > 0 ? t % d : 0) : Math.min(t, d), false);
    }
    this.running.push({ scene, phase, tl });
  }

  /** незавершённые таймлайны фазы ускоряются до 1.6; циклы удержания и отменённый выход (скролл назад) убиваются */
  private finishPhase(scene: number, phase: Phase, kill = false) {
    if (this.pending.get(scene) === phase) this.pending.delete(scene);
    for (const r of this.running) {
      if (r.scene !== scene || r.phase !== phase) continue;
      if (phase === 'hold' || kill) r.tl.kill();
      else if (r.tl.isActive()) r.tl.timeScale(1.6);
    }
    this.running = this.running.filter((r) => !(r.scene === scene && r.phase === phase && (phase === 'hold' || kill || !r.tl.isActive())));
  }

  private pruneRunning() {
    this.running = this.running.filter((r) => r.tl.isActive() || (r.phase === 'hold' && !this.still));
  }

  update(dt: number, time: number) {
    const e = this.engine;
    const rig = this.rig;
    const next = Math.min(Math.max(0, state.screen), this.scenes.length - 1);
    const local = clamp01(state.screens[next]);
    const phase = phaseOf(local);

    if (next !== this.active) {
      const prev = this.active;
      if (prev >= 0) {
        // предыдущая сцена доигрывает выход (в том числе отложенный до конца входа), потом прячется
        this.finishPhase(prev, 'hold');
        const exiting = this.running.some((r) => r.scene === prev && r.phase === 'exit' && r.tl.isActive()) || this.pending.get(prev) === 'exit';
        if (exiting && next === prev + 1) this.leaving = prev;
        else {
          this.scenes[prev].setActive(false, e);
          this.pending.delete(prev);
          for (const r of this.running) if (r.scene === prev) r.tl.kill();
        }
        for (const r of this.running) if (r.scene === prev && r.phase === 'hold') r.tl.kill();
        this.running = this.running.filter((r) => r.tl.isActive());
      }
      this.active = next;
      this.phase = null;
      this.scenes[next].setActive(true, e);
      // естественный вход только с предыдущего экрана вниз (и в still-кадре при старте на экране); иначе — сразу состояние удержания
      const natural = (prev === next - 1 || (this.still && prev < 0)) && phase === 'enter';
      this.start(next, 'enter', !natural);
      if (phase !== 'enter') this.start(next, phase, false);
      this.phase = phase;
    } else if (phase !== this.phase) {
      const prevPhase = this.phase;
      this.phase = phase;
      // назад (выход → удержание): выход убивается, удержание восстанавливает состояние; вперёд — вход доигрывает
      if (prevPhase) this.finishPhase(next, prevPhase, prevPhase === 'exit');
      if (phase === 'hold' || phase === 'exit') this.start(next, phase, false);
    }
    if (this.leaving >= 0 && this.pending.get(this.leaving) !== 'exit' && !this.running.some((r) => r.scene === this.leaving && r.phase === 'exit' && r.tl.isActive())) {
      this.scenes[this.leaving].setActive(false, e);
      this.leaving = -1;
    }
    this.pruneRunning();

    // ---------- сцены: доигрывающая выход обновляет свои объекты, активная задаёт rig
    rig.layout.x = rig.base.x;
    rig.layout.y = rig.base.y;
    rig.layout.r = rig.base.r;
    if (this.leaving >= 0 && this.leaving !== next) this.scenes[this.leaving].update(rig, 1, dt, time, e);
    this.scenes[next].update(rig, local, dt, time, e);

    // ---------- камера + параллакс от курсора (инерционный)
    const px = state.pointer.active ? state.pointer.nx : 0;
    const py = state.pointer.active ? state.pointer.ny : 0;
    this.smoothPointer.x = damp(this.smoothPointer.x, px, 2.5, dt);
    this.smoothPointer.y = damp(this.smoothPointer.y, py, 2.5, dt);
    const par = rig.parallax * (state.reduced ? 0 : 1);
    e.camera.position.set(rig.cam.x + this.smoothPointer.x * 0.18 * par, rig.cam.y + this.smoothPointer.y * 0.12 * par, rig.cam.z);
    e.camera.lookAt(rig.look);
    if (Math.abs(e.camera.fov - rig.fov) > 0.01) {
      e.camera.fov = rig.fov;
      e.camera.updateProjectionMatrix();
    }

    // ---------- атом: доли вьюпорта → мир под текущую камеру (сфера радиуса layout.r·ширины в точке layout.x/y)
    const halfH = Math.tan((rig.fov * Math.PI) / 360) * rig.cam.z;
    const halfW = halfH * e.camera.aspect;
    const R = rig.layout.r * 2 * halfW;
    e.atom.position.set((rig.layout.x * 2 - 1) * halfW + rig.atomPos.x * R, (1 - rig.layout.y * 2) * halfH + rig.atomPos.y * R, rig.atomPos.z * R);
    e.atom.scale.setScalar(R / Math.max(rig.sphereScale, 0.05));
    this.atomRot.x = damp(this.atomRot.x, -this.smoothPointer.y * 0.08 * par, 2.5, dt);
    this.atomRot.y = damp(this.atomRot.y, this.smoothPointer.x * 0.1 * par, 2.5, dt);
    e.atom.rotation.set(this.atomRot.x, this.atomRot.y, 0);
    e.atom.updateMatrixWorld();

    // ---------- сфера (шов UV сзади: вокруг y не вращаем, только покачивание)
    const core = e.core;
    const sScale = rig.sphereScale * rig.sphereScaleAnim;
    core.mesh.visible = rig.sphereVisible && sScale > 0.001 && rig.sphereOpacity > 0.003;
    core.mesh.scale.setScalar(Math.max(sScale, 0.0001));
    core.material.opacity = rig.sphereOpacity;
    core.material.transparent = rig.sphereOpacity < 0.999;
    core.uniforms.uEnvMix.value = rig.envMix;
    core.uniforms.uLift.value = rig.lift;
    // BRIEF-4 §2: музыка чуть «дышит» в сфере — вклад не больше 2 % масштаба
    core.mesh.scale.multiplyScalar(1 + state.bass * 0.02);
    core.mesh.rotation.y = Math.sin(time * 0.07) * 0.12;
    core.mesh.rotation.x = Math.sin(time * 0.11) * 0.06;
    if (rig.pointerBulge > 0 && state.pointer.active && !state.reduced) {
      this.tmp.set(this.smoothPointer.x * 3.5, this.smoothPointer.y * 2.2, 2.5).sub(this.tmp2.copy(e.atom.position)).normalize();
      const q = core.mesh.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.tmp.applyQuaternion(q);
      core.uniforms.uPointerDir.value.lerp(this.tmp, 1 - Math.exp(-4 * dt));
      core.uniforms.uPointerAmt.value = damp(core.uniforms.uPointerAmt.value, 0.04 * rig.pointerBulge, 3, dt);
    } else {
      core.uniforms.uPointerAmt.value = damp(core.uniforms.uPointerAmt.value, 0, 3, dt);
    }

    // ---------- окружение: блик дрейфует, курсор поворачивает свет на ±6° и сдвигает ключевой свет (BRIEF-3 §8.3)
    e.scene.environmentRotation.set(this.smoothPointer.y * -0.05, rig.envRot + rig.envRotAnim + time * 0.02 + this.smoothPointer.x * 0.105, 0);
    e.lights.key.position.set(-4.0 + this.smoothPointer.x * 1.4, 6.0 + this.smoothPointer.y * 1.0, 5.0);

    // ---------- фон: режимы, тень под сферой
    e.background.set(rig.bg.a, rig.bg.b, rig.bg.mix, rig.bg.mask);
    e.background.uniforms.uMouse.value.set(this.smoothPointer.x, this.smoothPointer.y);
    e.background.uniforms.uScroll.value = state.progress;
    e.background.uniforms.uBeam.value = rig.beam;
    this.tmp.copy(e.atom.position).project(e.camera);
    e.background.uniforms.uBeamPos.value.set(this.tmp.x * e.camera.aspect, -1.0);
    const sx = this.tmp.x * e.camera.aspect;
    const sy = this.tmp.y;
    this.tmp2.copy(e.atom.position).add(this.tmp.set(e.atom.scale.x * sScale, 0, 0)).project(e.camera);
    e.background.uniforms.uSpherePos.value.set(sx, sy);
    e.background.uniforms.uSphereR.value = core.mesh.visible ? Math.abs(this.tmp2.x * e.camera.aspect - sx) * rig.sphereOpacity : 0;

    // ---------- полоса видимости линий: ниже шапки и выше футера (BRIEF-4 §1.2, §1.3), в device px снизу вверх
    const dpr = e.renderer.getPixelRatio();
    const hPx = e.renderer.domElement.height;
    const vh = state.layout.vh || window.innerHeight;
    const bottomCut = Math.min(vh, Math.max(0, state.layout.footerTop));
    e.fade.set(hPx - bottomCut * dpr, hPx - state.layout.header * dpr);

    // ---------- тушь: в теме night линии и точки светлые (по envMix)
    if (Math.abs(rig.envMix - this.inkMix) > 0.002 || this.inkMix < 0) {
      this.inkMix = rig.envMix;
      this.inkColor.lerpColors(INK, INK_NIGHT, clamp01(rig.envMix));
      for (const u of e.inkUniforms) u.value.copy(this.inkColor);
    }

    // ---------- пыль
    if (e.dust) e.dust.update(time, rig.dust * 0.22, e.renderer.getPixelRatio());

    // ---------- hover орбит (только S1, только с мышью)
    this.updateOrbitHover(next);
    state.status = rig.status;
  }

  /** Hover орбит: проекция орбит в экран, расстояние до курсора; на тач не считается (BRIEF-3 §7.2) */
  private updateOrbitHover(active: number) {
    const e = this.engine;
    const p = state.pointer;
    // на тач и на LOW hover орбит не считается (BRIEF-3 §7.2)
    if (!this.trails || this.engine.tier.name === 'low' || active !== 0 || !p.active || state.screens[0] > 0.6) {
      state.orbitHover = -1;
      return;
    }
    let best = -1;
    let bestD = 26;
    for (let i = 0; i < 5; i++) {
      if (e.orbits.electron[i] < 0.5) continue;
      for (let k = 0; k < 40; k++) {
        e.orbits.pointAt(i, k / 40, this.tmp).applyMatrix4(e.atom.matrixWorld);
        const q = e.project(this.tmp, { x: 0, y: 0, z: 0 });
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    state.orbitHover = best;
  }
}
