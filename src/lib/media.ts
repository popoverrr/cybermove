/**
 * Слоты изображений (BRIEF-4 §3, BRIEF-5 §3). Значение слота в `src/content/media.json` — строка
 * (путь относительно `src/assets/`) или объект:
 *   src    — основной кадр (4:3 для плиток кейсов, 3:4 / 1:1 / 4:5 для остальных слотов)
 *   hero   — кадр 16:9 для шапки страницы кейса (BRIEF-5 §4)
 *   logo   — белый логотип бренда с прозрачным фоном, отдельным слоем поверх кадра; null — логотипа нет
 *   mono   — вариант кадра без цвета (итерация 4, сейчас не используется)
 *   kind   — logo | avatar | photo | monogram | render (на вёрстку влияет только render)
 *   hover  — zoom (медленное приближение кадра) | lift (подъём плитки, итерация 4) | none
 *   alt    — подпись для доступности
 * Файлы берутся из `src/assets/media/**`, оптимизацией занимается `astro:assets`.
 */
import media from '../content/media.json';

export interface SlotEntry {
  src: string;
  hero?: string | null;
  logo?: string | null;
  mono?: string | null;
  kind?: 'logo' | 'avatar' | 'photo' | 'monogram' | 'render';
  hover?: 'zoom' | 'lift' | 'none';
  brand?: string | null;
  alt?: string;
}

const files = import.meta.glob<{ default: ImageMetadata }>('/src/assets/media/**/*.{jpg,jpeg,png,webp,avif}');

/** Запись слота или null, если слота нет в media.json. */
export function getSlot(id: string): SlotEntry | null {
  const raw = (media as Record<string, string | SlotEntry | null>)[id] ?? null;
  return typeof raw === 'string' ? { src: raw } : raw;
}

/** Файл из src/assets по пути из media.json. Отсутствие файла — ошибка сборки, а не тихий пропуск. */
export async function loadImage(src: string | null | undefined): Promise<ImageMetadata | null> {
  if (!src) return null;
  const key = `/src/assets/${src.replace(/^\/?(src\/assets\/)?/, '')}`;
  const loader = files[key];
  if (!loader) throw new Error(`media.json: файл ${key} не найден в src/assets/media/`);
  return (await loader()).default;
}

/** Ширины для srcset, обрезанные по реальному размеру файла. */
export function widthsFor(image: ImageMetadata, widths: number[]): number[] {
  const fit = widths.filter((w) => w <= image.width);
  return fit.length ? fit : [image.width];
}
