/**
 * Пост-эффекты (BRIEF-3 §3.6): только на HIGH — SMAA и очень мелкое зерно (ощущение бумаги), едва заметная
 * виньетка. Тонмаппинга здесь нет: PBR-материалы мапятся сами (patchNeutralToneMap), фон и линии остаются точными.
 */
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, NoiseEffect, VignetteEffect, SMAAEffect, SMAAPreset, BlendFunction } from 'postprocessing';
import type { TierSpec } from './tiers';

export interface PostParams {
  noise: number; // 0..1 opacity
  vignette: number; // darkness 0..1
  vignetteOffset: number;
}

/** Бумага: одинаково на всех темах */
export const POST_PAPER: PostParams = { noise: 0.03, vignette: 0.06, vignetteOffset: 0.4 };

export function lerpPost(a: PostParams, b: PostParams, t: number, out: PostParams): PostParams {
  const k = Math.min(1, Math.max(0, t));
  out.noise = a.noise + (b.noise - a.noise) * k;
  out.vignette = a.vignette + (b.vignette - a.vignette) * k;
  out.vignetteOffset = a.vignetteOffset + (b.vignetteOffset - a.vignetteOffset) * k;
  return out;
}

export class Post {
  readonly composer: EffectComposer;
  readonly noise: NoiseEffect | null;
  readonly vignette: VignetteEffect;
  readonly smaa: SMAAEffect | null;
  private noiseBlend: { opacity: { value: number } } | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, tier: TierSpec) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0, stencilBuffer: false });
    this.composer.addPass(new RenderPass(scene, camera));

    // тонмаппинг — внутри PBR-материалов (patchNeutralToneMap), фон и линии не трогаем
    this.vignette = new VignetteEffect({ eskil: false, offset: POST_PAPER.vignetteOffset, darkness: POST_PAPER.vignette });
    // зерно поверх (multiply): на светлом фоне читается как фактура бумаги, а не как шум
    this.noise = tier.noise ? new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.MULTIPLY }) : null;
    if (this.noise) {
      this.noise.blendMode.opacity.value = POST_PAPER.noise;
      this.noiseBlend = this.noise.blendMode as unknown as { opacity: { value: number } };
    }

    const effects = [this.vignette, ...(this.noise ? [this.noise] : [])];
    this.composer.addPass(new EffectPass(camera, ...effects));

    this.smaa = tier.smaa ? new SMAAEffect({ preset: SMAAPreset.HIGH }) : null;
    if (this.smaa) this.composer.addPass(new EffectPass(camera, this.smaa));
  }

  apply(p: PostParams) {
    this.vignette.darkness = p.vignette;
    this.vignette.offset = p.vignetteOffset;
    if (this.noiseBlend) this.noiseBlend.opacity.value = p.noise;
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
  }

  render(dt: number) {
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
  }
}
