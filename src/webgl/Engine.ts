/**
 * Engine — renderer, объекты, ресайз, тиры качества (BRIEF-3). Кадр рисуется по вызову `frame(now)` из единого
 * цикла страницы (gsap.ticker в lib/home.ts); собственный rAF («start») используется только лабораторией.
 * WebGL2 с MSAA; композер (SMAA + зерно) только на HIGH; тонмаппинг Neutral внутри PBR-материалов.
 */
import * as THREE from 'three';
import { PARAMS, type Tier } from './params';
import { TIERS, detectTier, lowerTier, isSoftwareRenderer, type TierSpec } from './tiers';
import { buildEnvironments, addStudioLights, type EnvironmentMaps } from './Environment';
import { Background } from './backgrounds/Background';
import { Sphere, makeSurfaceMaps } from './objects/Sphere';
import { OrbitSystem } from './objects/Orbits';
import { Dust } from './objects/Dust';
import { Grid } from './objects/Grid';
import { Satellites } from './objects/Satellites';
import { Figures } from './objects/Figures';
import { Ribbons } from './objects/Ribbons';
import { Sheets } from './objects/Sheets';
import { Rings } from './objects/Rings';
import { LineSet } from './objects/LineSet';
import { Dots } from './objects/Dots';
import { Post, POST_PAPER } from './Post';
import { Story } from './Story';
import { state } from '../lib/state';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  onFirstFrame?: () => void;
  /** рендерер, созданный заранее (boot.create — чтобы окружение успело собраться асинхронно) */
  gpu?: Gpu;
  /** карты окружения, собранные заранее тем же рендерером */
  env?: EnvironmentMaps;
}

export interface Gpu {
  renderer: THREE.WebGLRenderer;
  software: boolean;
  tierName: Tier;
}

/** WebGL2-контекст и рендерер с настройками сцены (BRIEF-3 §3.6). */
export function createGpu(canvas: HTMLCanvasElement): Gpu {
  // MSAA в контексте: на LOW/MID рендер идёт напрямую и сглаживается им (BRIEF-3 §3.6); на HIGH сглаживает SMAA композера
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: PARAMS.still });
  if (!gl) throw new Error('WebGL2 недоступен');
  const software = isSoftwareRenderer(gl);
  const tierName = detectTier(PARAMS.tier);
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: PARAMS.still });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // тонмаппинг живёт внутри PBR-материалов (Environment.patchNeutralToneMap)
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0xf2efe9, 1);
  renderer.autoClear = true;
  return { renderer, software, tierName };
}

export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly resolution = new THREE.Vector2(1, 1);
  readonly background: Background;
  readonly env: EnvironmentMaps;
  readonly lights: { key: THREE.DirectionalLight; fill: THREE.DirectionalLight };
  readonly core: Sphere;
  readonly orbits: OrbitSystem;
  readonly dust: Dust | null;
  readonly grid: Grid;
  readonly satellites: Satellites;
  readonly figures: Figures;
  readonly ribbons: Ribbons;
  readonly sheets: Sheets;
  readonly rings: Rings;
  readonly pulse: Rings;
  readonly atom = new THREE.Group();
  readonly story: Story;
  post: Post | null = null;
  tier: TierSpec;
  readonly software: boolean;

  /** время сюжета (с), замораживается при ?still */
  time = 0;
  dt = 0;
  private raf = 0;
  private last = 0;
  private running = false;
  private hidden = false;
  private firstFrameDone = false;
  /** шейдеры сцены и постобработки скомпилированы в фоне (BRIEF-SEO §6) — можно рисовать */
  private shadersReady = false;
  private shadersPending = false;
  private slowFrames = 0;
  private slowSince = 0;
  private frameTimes: number[] = [];
  private frameIndex = 0;
  private renderCount = 0;
  private renderCountAt = 0;
  private stillStart = 0;
  private maps: { normalMap: THREE.Texture; roughnessMap: THREE.Texture; dispose(): void };
  private onFirstFrame?: () => void;
  /** униформы цвета туши всех линий/точек (см. Story: тушь → paper в night) */
  readonly inkUniforms: THREE.IUniform<THREE.Color>[] = [];
  /** экранная полоса видимости линий в device px (низ, верх): ниже шапки и выше футера (BRIEF-4 §1.2, §1.3) */
  readonly fade = new THREE.Vector2(-1e4, 1e4);
  readonly stats = { fps: 0, frameMs: 0, tier: 'high' as Tier, particles: 0, verts: 0, renders: 0, calls: 0 };

  constructor(opts: EngineOptions) {
    this.canvas = opts.canvas;
    this.onFirstFrame = opts.onFirstFrame;

    const gpu = opts.gpu ?? createGpu(this.canvas);
    this.software = gpu.software;
    this.tier = TIERS[gpu.tierName];
    this.stats.tier = gpu.tierName;
    this.renderer = gpu.renderer;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 80);
    this.camera.position.set(0, 0, 7.6);

    this.env = opts.env ?? buildEnvironments(this.renderer, this.tier.envSize);
    this.scene.environment = this.env.warm;
    this.scene.environmentIntensity = 0.7;
    this.lights = addStudioLights(this.scene);

    this.background = new Background(this.resolution);
    this.background.uniforms.uDetail.value = this.tier.bgDetail;
    this.scene.add(this.background.mesh);

    this.maps = makeSurfaceMaps(this.renderer, this.tier.mapSize);
    this.core = new Sphere({ detail: this.tier.sphereDetail, displace: this.tier.displace, envWarm: this.env.warm, envNight: this.env.night, maps: this.maps });
    const envMix = this.core.uniforms.uEnvMix;
    this.orbits = new OrbitSystem(this.resolution);
    this.dust = this.tier.particles > 0 ? new Dust(this.tier.particles) : null;
    this.grid = new Grid(this.resolution);
    this.satellites = new Satellites(this.resolution, this.env.warm, this.env.night, envMix);
    this.figures = new Figures(this.resolution);
    this.ribbons = new Ribbons(this.resolution);
    this.sheets = new Sheets(this.resolution, this.env.warm, this.env.night, envMix);
    this.rings = new Rings(this.resolution, 12, 1.15, 2.6);
    this.pulse = new Rings(this.resolution, 1, 1.05, 1.05);

    this.atom.add(this.core.mesh, this.orbits.group, this.grid.group, this.satellites.group, this.figures.group, this.ribbons.group, this.sheets.group, this.rings.group, this.pulse.group);
    if (this.dust) this.atom.add(this.dust.points);
    // все «чернильные» униформы цвета: линии, точки, пыль — Story смешивает тушь с paper в теме night;
    // экранная полоса видимости (шапка и футер) общая для всех — один вектор на сцену (BRIEF-4 §1.2, §1.3)
    for (const obj of [this.orbits, this.grid, this.satellites, this.figures, this.ribbons, this.sheets, this.rings, this.pulse] as object[]) {
      for (const v of Object.values(obj)) {
        if (v instanceof LineSet || v instanceof Dots) {
          this.inkUniforms.push(v.uniforms.uColor);
          v.uniforms.uFade.value = this.fade;
        }
      }
    }
    if (this.dust) {
      this.inkUniforms.push(this.dust.uniforms.uColor);
      this.dust.uniforms.uFade.value = this.fade;
    }
    this.scene.add(this.atom);

    this.setupPost();
    this.story = new Story(this);
    this.resize();
    window.addEventListener('resize', this.resize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);

    this.stats.verts = this.core.vertexCount;
    this.stats.particles = this.tier.particles;

    if (PARAMS.debug) {
      import('./debug').then((m) => m.mountDebug(this)).catch(() => {});
    }
  }

  private setupPost() {
    this.post?.dispose();
    this.post = null;
    if (this.tier.post) {
      this.post = new Post(this.renderer, this.scene, this.camera, this.tier);
      this.post.apply(POST_PAPER);
    }
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }

  resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.resolution.set(w * dpr, h * dpr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h);
    state.mobile = w < 900 || (w < 1100 && h > w);
    this.story.onResize(w, h);
  };

  private onVisibility = () => {
    this.hidden = document.hidden;
    if (!this.hidden && this.running) {
      this.last = performance.now();
      if (!this.raf) this.raf = requestAnimationFrame(this.loop);
    }
  };

  /** Собственный цикл (лаборатория, фолбэк без единого тикера страницы) */
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private loop = (now: number) => {
    this.raf = 0;
    if (!this.running || this.hidden) return;
    const keep = this.frame(now);
    if (keep) this.raf = requestAnimationFrame(this.loop);
  };

  /** Один кадр: обновление сюжета и рендер. Возвращает false, когда still-кадр отрисован и продолжать не нужно. */
  frame(now: number): boolean {
    if (this.hidden) return true;
    // Первый кадр — только после фоновой компиляции шейдеров: синхронная компиляция на первом render()
    // держала основной поток секундами (Lighthouse: TBT 12–15 с). Сюжет стартует с первого настоящего кадра.
    if (!this.shadersReady) {
      this.prepareShaders();
      return true;
    }
    if (!this.stillStart) this.stillStart = now;
    if (!this.last) this.last = now;
    const t0 = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    if (PARAMS.still) {
      dt = 0;
      if (this.time === 0) this.time = PARAMS.time ?? 4.0;
    }
    this.dt = dt;
    this.time += dt;

    this.story.update(dt, this.time);
    this.background.update(this.time);
    // зерно бумаги живёт: смена seed раз в 3 кадра (BRIEF-3 §8.2)
    if (dt > 0 && this.frameIndex++ % 3 === 0) this.background.uniforms.uGrainSeed.value = (this.frameIndex * 7919) % 1000;
    this.core.update(this.time);

    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);

    const ms = performance.now() - t0;
    this.stats.frameMs = ms;
    this.stats.calls = this.renderer.info.render.calls;
    this.renderCount++;
    if (now - this.renderCountAt >= 1000) {
      this.stats.renders = this.renderCount;
      this.renderCount = 0;
      this.renderCountAt = now;
    }
    this.frameTimes.push(ms);
    if (this.frameTimes.length > 30) this.frameTimes.shift();
    this.stats.fps = dt > 0 ? Math.round(1 / dt) : 0;
    this.watchPerformance(now, ms);

    if (!this.firstFrameDone) {
      this.firstFrameDone = true;
      this.onFirstFrame?.();
      state.events.emit('ready', undefined);
    }
    // при ?still рисуем кадры ~2.5 с (DOM успевает выставить прогресс и hover), затем останавливаемся
    if (PARAMS.still && now - this.stillStart > 2500 && this.frameTimes.length >= 6) {
      this.canvas.dataset.still = '1';
      return false;
    }
    return true;
  }

  /**
   * Компиляция всех программ через KHR_parallel_shader_compile (renderer.compileAsync): основной поток
   * не ждёт компилятор. compile() обходит всю сцену, включая скрытые объекты следующих экранов, поэтому
   * при прокрутке шейдеры уже готовы. Ключ программы зависит от цели рендера: на HIGH сцена рисуется в буфер
   * композера — компилируем с ним же, проходы постобработки — со своими полноэкранными сценами.
   */
  private prepareShaders() {
    if (this.shadersPending) return;
    this.shadersPending = true;
    const r = this.renderer;
    const jobs: Promise<unknown>[] = [];
    const composer = this.post?.composer as unknown as { inputBuffer?: THREE.WebGLRenderTarget; passes?: unknown[] } | undefined;
    const prev = r.getRenderTarget();
    r.setRenderTarget(composer?.inputBuffer ?? null);
    jobs.push(r.compileAsync(this.scene, this.camera));
    r.setRenderTarget(prev);
    for (const pass of (composer?.passes ?? []) as Array<{ scene?: THREE.Scene; camera?: THREE.Camera }>) {
      if (pass.scene && pass.camera && pass.scene !== this.scene) jobs.push(r.compileAsync(pass.scene, pass.camera));
    }
    Promise.all(jobs)
      .catch(() => {})
      .finally(() => {
        this.shadersReady = true;
      });
  }

  /** Если кадр дольше 18 мс на протяжении 1.5 с — понижаем тир на лету (не под программным рендером) */
  private watchPerformance(now: number, ms: number) {
    if (this.software || PARAMS.tier || PARAMS.still) return;
    if (ms > 18) {
      if (!this.slowSince) this.slowSince = now;
      this.slowFrames++;
      if (now - this.slowSince > 1500 && this.slowFrames > 30) {
        const next = lowerTier(this.tier.name);
        if (next) this.setTier(next);
        this.slowSince = 0;
        this.slowFrames = 0;
      }
    } else if (this.slowSince && now - this.slowSince > 2500) {
      this.slowSince = 0;
      this.slowFrames = 0;
    }
  }

  setTier(name: Tier) {
    if (this.tier.name === name) return;
    this.tier = TIERS[name];
    this.stats.tier = name;
    this.stats.particles = this.tier.particles;
    this.background.uniforms.uDetail.value = this.tier.bgDetail;
    if (this.dust && this.tier.particles === 0) this.dust.points.visible = false;
    this.setupPost();
    this.resize();
    this.canvas.dataset.tier = name;
  }

  /** Проекция мировой точки в пиксели окна */
  project(v: THREE.Vector3, out: { x: number; y: number; z: number }) {
    const p = v.clone().project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-p.y * 0.5 + 0.5) * window.innerHeight;
    out.z = p.z;
    return out;
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.post?.dispose();
    this.core.dispose();
    this.maps.dispose();
    this.orbits.dispose();
    this.dust?.dispose();
    this.grid.dispose();
    this.satellites.dispose();
    this.figures.dispose();
    this.ribbons.dispose();
    this.sheets.dispose();
    this.rings.dispose();
    this.pulse.dispose();
    this.background.dispose();
    this.env.dispose();
    this.renderer.dispose();
  }
}
