/** Панель отладки (?debug): Tweakpane с материалом жемчуга, светом, счётчиком кадров и вызовов render. */
import { Pane } from 'tweakpane';
import type { Engine } from './Engine';
import { state } from '../lib/state';

export function mountDebug(engine: Engine) {
  const pane = new Pane({ title: 'CYBERMOVE · debug', expanded: true });
  const el = (pane as unknown as { element: HTMLElement }).element;
  el.style.position = 'fixed';
  el.style.top = '80px';
  el.style.right = '12px';
  el.style.zIndex = '2000';
  el.style.width = '300px';

  const fps = pane.addFolder({ title: 'Кадр' });
  fps.addBinding(engine.stats, 'fps', { readonly: true });
  fps.addBinding(engine.stats, 'frameMs', { readonly: true, format: (v: number) => v.toFixed(2) });
  fps.addBinding(engine.stats, 'renders', { readonly: true, label: 'render/с' });
  fps.addBinding(engine.stats, 'calls', { readonly: true, label: 'draw calls' });
  fps.addBinding(engine.stats, 'tier', { readonly: true });
  fps.addBinding(engine.stats, 'particles', { readonly: true });
  fps.addBinding(engine.stats, 'verts', { readonly: true });
  fps.addBinding(state, 'progress', { readonly: true, format: (v: number) => v.toFixed(3) });
  fps.addBinding(state, 'screen', { readonly: true });

  const mat = pane.addFolder({ title: 'Жемчуг' });
  const m = engine.core.material;
  mat.addBinding(m, 'roughness', { min: 0, max: 1, step: 0.01 });
  mat.addBinding(m, 'metalness', { min: 0, max: 1, step: 0.01 });
  mat.addBinding(m, 'clearcoat', { min: 0, max: 1, step: 0.01 });
  mat.addBinding(m, 'clearcoatRoughness', { min: 0, max: 1, step: 0.01 });
  mat.addBinding(m, 'sheen', { min: 0, max: 1, step: 0.01 });
  mat.addBinding(m, 'sheenRoughness', { min: 0, max: 1, step: 0.01 });
  mat.addBinding(m, 'specularIntensity', { min: 0, max: 1, step: 0.01 });
  mat.addBinding(m, 'ior', { min: 1, max: 2.3, step: 0.01 });
  mat.addBinding(m, 'envMapIntensity', { min: 0, max: 3, step: 0.05 });
  mat.addBinding(m.normalScale, 'x', { label: 'normalScale', min: 0, max: 0.6, step: 0.01 }).on('change', (ev) => m.normalScale.set(ev.value, ev.value));
  const u = engine.core.uniforms;
  mat.addBinding(u.uNoiseAmp, 'value', { label: 'breathAmp', min: 0, max: 0.05, step: 0.001 });
  mat.addBinding(u.uNoiseSpeed, 'value', { label: 'breathSpeed', min: 0, max: 0.3, step: 0.005 });
  mat.addBinding(u.uFloorShade, 'value', { label: 'floorShade', min: 0.5, max: 1, step: 0.01 });
  mat.addBinding(u.uEnvMix, 'value', { label: 'envMix night', min: 0, max: 1, step: 0.01 });

  const env = pane.addFolder({ title: 'Свет' });
  env.addBinding(engine.scene, 'environmentIntensity', { min: 0, max: 3, step: 0.05 });
  env.addBinding(engine.lights.key, 'intensity', { label: 'key', min: 0, max: 4, step: 0.05 });
  env.addBinding(engine.lights.fill, 'intensity', { label: 'fill', min: 0, max: 2, step: 0.02 });
  env.addBinding(engine.renderer, 'toneMappingExposure', { min: 0.2, max: 2.5, step: 0.05 });
  if (engine.post) {
    env.addBinding(engine.post.vignette, 'darkness', { label: 'vignette', min: 0, max: 1, step: 0.01 });
  }

  pane.addButton({ title: 'Понизить тир' }).on('click', () => {
    const next = engine.tier.name === 'high' ? 'mid' : 'low';
    engine.setTier(next);
  });

  setInterval(() => pane.refresh(), 250);
}
