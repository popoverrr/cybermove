/**
 * Engine — renderer, цикл, ресайз, тиры качества, пауза (BRIEF §8).
 * WebGL2, sRGB, тонмаппинг Khronos Neutral (в Post или в renderer на low), SMAA через пост-обработку.
 */
import * as THREE from 'three';
import { PARAMS, type Tier } from './params';
import { TIERS, detectTier, lowerTier, isSoftwareRenderer, type TierSpec } from './tiers';
import { buildEnvironments, addStudioLights, type EnvironmentMaps } from './Environment';
import { Background } from './backgrounds/Background';
import { Sphere, makeSurfaceMaps } from './objects/Sphere';
import { ParticleField } from './objects/ParticleField';
import { Orbit, CORE_ORBITS, GROWTH_ORBITS } from './objects/Orbits';
import { Scan } from './objects/Scan';
import { Nodes } from './objects/Nodes';
import { Streams } from './objects/Streams';
import { Plates } from './objects/Plates';
import { mulberry32 } from './objects/orbitals';
import { Post, POST_PAPER } from './Post';
import { Story } from './Story';
import { state } from '../lib/state';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  onFirstFrame?: () => void;
}

export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly resolution = new THREE.Vector2(1, 1);
  readonly background: Background;
  readonly env: EnvironmentMaps;
  readonly core: Sphere;
  private maps: { normalMap: THREE.Texture; roughnessMap: THREE.Texture; dispose(): void };
  readonly particles: ParticleField;
  readonly orbits: Orbit[] = [];
  readonly atom = new THREE.Group();
  readonly scan: Scan;
  readonly nodes: Nodes;
  readonly streams: Streams;
  readonly plates: Plates;
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
  private slowFrames = 0;
  private slowSince = 0;
  private frameTimes: number[] = [];
  private frameIndex = 0;
  private onFirstFrame?: () => void;
  readonly stats = { fps: 0, frameMs: 0, tier: 'high' as Tier, particles: 0, verts: 0, renders: 0, calls: 0 };
  readonly lights: { key: THREE.DirectionalLight; fill: THREE.DirectionalLight };
  private renderCount = 0;
  private renderCountAt = 0;

  constructor(opts: EngineOptions) {
    this.canvas = opts.canvas;
    this.onFirstFrame = opts.onFirstFrame;

    // MSAA в контексте: на LOW/MID рендер идёт напрямую и сглаживается им (BRIEF-3 §3.6); на HIGH сглаживает SMAA композера
    const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: PARAMS.still });
    if (!gl) throw new Error('WebGL2 недоступен');
    this.software = isSoftwareRenderer(gl);

    const tierName = detectTier(PARAMS.tier);
    this.tier = TIERS[tierName];
    this.stats.tier = tierName;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, context: gl, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: PARAMS.still });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0xf2efe9, 1);
    this.renderer.autoClear = true;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 80);
    this.camera.position.set(0, 0, 7.6);

    this.env = buildEnvironments(this.renderer, this.tier.envSize);
    this.scene.environment = this.env.warm;
    this.scene.environmentIntensity = 0.7;
    this.lights = addStudioLights(this.scene);

    this.background = new Background(this.resolution);
    this.background.uniforms.uDetail.value = this.tier.bgDetail;
    this.scene.add(this.background.mesh);

    const rng = mulberry32(20260921);
    this.maps = makeSurfaceMaps(this.renderer, this.tier.mapSize);
    this.core = new Sphere({ detail: this.tier.sphereDetail, displace: this.tier.displace, envWarm: this.env.warm, envNight: this.env.night, maps: this.maps });
    this.particles = new ParticleField(TIERS.high.particles, rng, { curl: tierName !== 'low', dpr: 1 });
    this.particles.setDrawCount(this.tier.particles);
    for (const p of [...CORE_ORBITS, ...GROWTH_ORBITS]) this.orbits.push(new Orbit(p, this.resolution, this.tier.trailSegments));

    this.renderer.localClippingEnabled = true;
    const envMix = this.core.uniforms.uEnvMix;
    this.scan = new Scan(this.core, this.resolution, this.env.warm, this.env.night, envMix);
    this.nodes = new Nodes(this.resolution, this.env.warm, this.env.night, envMix);
    this.streams = new Streams(this.resolution);
    this.plates = new Plates(this.resolution, this.env.warm, this.env.night, envMix);

    this.atom.add(this.core.mesh, this.particles.points, this.scan.group, this.nodes.group, this.streams.group, this.plates.group);
    for (const o of this.orbits) this.atom.add(o.group);
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
    // тонмаппинг живёт внутри PBR-материалов (Environment.patchNeutralToneMap)
    this.renderer.toneMapping = THREE.NoToneMapping;
    // материалы должны перекомпилироваться под смену тонмаппинга
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
    this.particles.uniforms.uDpr.value = dpr;
    this.post?.setSize(w, h);
    state.mobile = w < 900 || (w < 1100 && h > w);
    this.story.onResize(w, h);
  };

  private onVisibility = () => {
    this.hidden = document.hidden;
    if (!this.hidden && this.running) {
      this.last = performance.now();
      if (!this.raf) this.raf = requestAnimationFrame(this.frame);
    }
  };

  private stillStart = 0;

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.stillStart = performance.now();
    if (PARAMS.still) {
      this.time = PARAMS.time ?? 4.0;
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (!this.running) return;
    if (this.hidden) return; // пауза, когда вкладка скрыта
    const t0 = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (PARAMS.still) dt = 0;
    this.dt = dt;
    this.time += dt;

    this.story.update(dt, this.time);
    this.background.update(this.time);
    // зерно бумаги живёт: смена seed раз в 3 кадра (BRIEF-3 §8.2)
    if (dt > 0 && (this.frameIndex++ % 3) === 0) this.background.uniforms.uGrainSeed.value = (this.frameIndex * 7919) % 1000;
    this.core.update(this.time);
    this.particles.update(this.time);

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
    if (PARAMS.still && performance.now() - this.stillStart > 2500 && this.frameTimes.length >= 6) {
      this.canvas.dataset.still = '1';
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Если кадр дольше 22 мс на протяжении 2 с — понижаем тир на лету (не под программным рендером). */
  private watchPerformance(now: number, ms: number) {
    if (this.software || PARAMS.tier || PARAMS.still) return;
    if (ms > 22) {
      if (!this.slowSince) this.slowSince = now;
      this.slowFrames++;
      if (now - this.slowSince > 2000 && this.slowFrames > 40) {
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
    this.particles.setDrawCount(this.tier.particles);
    this.background.uniforms.uDetail.value = this.tier.bgDetail;
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
    this.particles.dispose();
    this.orbits.forEach((o) => o.dispose());
    this.scan.dispose();
    this.nodes.dispose();
    this.streams.dispose();
    this.plates.dispose();
    this.background.dispose();
    this.env.dispose();
    this.renderer.dispose();
  }
}
