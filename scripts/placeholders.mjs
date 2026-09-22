#!/usr/bin/env node
/**
 * Плейсхолдеры под фотографии (BRIEF-2 §7.2): 6 процедурных изображений «свет на бетоне» —
 * тёплый градиент stone → clay, мелкое зерно, одно мягкое пятно света и тень по диагонали.
 * Без надписей. Выход: public/placeholders/ph-1..6.webp (1600×1200, cover под любые пропорции).
 *   node scripts/placeholders.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const W = 1600;
const H = 1200;
const OUT = 'public/placeholders';
await mkdir(OUT, { recursive: true });

const STONE = [0xdd, 0xd7, 0xce];
const CLAY = [0xcf, 0xc7, 0xbb];
const PAPER = [0xfa, 0xf8, 0xf4];

const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};
const hash = (x, y, s) => {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// варианты: направление градиента, пятно света, тень (линия и сторона), зерно
const VARIANTS = [
  { ang: 0.6, spot: [0.3, 0.25, 0.55], shadow: [0.35, 0.65, 1], grain: 0.03 },
  { ang: 2.2, spot: [0.7, 0.3, 0.5], shadow: [-0.4, 0.55, -1], grain: 0.026 },
  { ang: 1.1, spot: [0.25, 0.7, 0.6], shadow: [0.55, 0.85, 1], grain: 0.032 },
  { ang: 3.4, spot: [0.75, 0.75, 0.5], shadow: [0.2, 0.4, -1], grain: 0.026 },
  { ang: 1.8, spot: [0.5, 0.2, 0.7], shadow: [0.45, 0.75, 1], grain: 0.028 },
  { ang: 4.0, spot: [0.2, 0.45, 0.5], shadow: [-0.2, 0.6, -1], grain: 0.03 },
];

for (let v = 0; v < VARIANTS.length; v++) {
  const { ang, spot, shadow, grain } = VARIANTS[v];
  const buf = Buffer.alloc(W * H * 3);
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  for (let y = 0; y < H; y++) {
    const ny = y / H;
    for (let x = 0; x < W; x++) {
      const nx = x / W;
      // градиент stone → clay по направлению
      const g = smooth(0.5 + (nx - 0.5) * dx + (ny - 0.5) * dy);
      let r = STONE[0] + (CLAY[0] - STONE[0]) * g;
      let gg = STONE[1] + (CLAY[1] - STONE[1]) * g;
      let b = STONE[2] + (CLAY[2] - STONE[2]) * g;
      // мягкое пятно света
      const sx = nx - spot[0];
      const sy = (ny - spot[1]) * (H / W);
      const l = Math.exp(-(sx * sx + sy * sy) / (spot[2] * spot[2] * 0.5)) * 0.09;
      // солнце через окно: светлая полоса под углом с мягкой кромкой, за её краем — тень
      const line = nx * 0.75 - ny * 0.6 + shadow[0];
      const edge = (line - shadow[1]) * shadow[2];
      const sun = smooth(edge * 7 + 0.5) * (1 - smooth((edge - 0.28) * 7)) * 0.12;
      const sh = smooth(-edge * 7) * 0.085;
      // виньетка
      const vx = nx - 0.5;
      const vy = ny - 0.5;
      const vig = (vx * vx + vy * vy) * 0.07;
      const k = 1 + l * 1.3 + sun - sh - vig;
      // зерно
      const n = (hash(x, y, v + 1) - 0.5) * grain * 255;
      r = r * k + n;
      gg = gg * k + n;
      b = b * k + n;
      // блик к paper в самом центре пятна
      const bl = l * 2.5;
      r += (PAPER[0] - r) * bl * 0.15;
      gg += (PAPER[1] - gg) * bl * 0.15;
      b += (PAPER[2] - b) * bl * 0.15;
      const i = (y * W + x) * 3;
      buf[i] = Math.max(0, Math.min(255, r));
      buf[i + 1] = Math.max(0, Math.min(255, gg));
      buf[i + 2] = Math.max(0, Math.min(255, b));
    }
  }
  const img = sharp(buf, { raw: { width: W, height: H, channels: 3 } });
  await img.clone().webp({ quality: 82 }).toFile(`${OUT}/ph-${v + 1}.webp`);
  console.log(`ph-${v + 1}.webp`);
}
console.log('готово:', OUT);
