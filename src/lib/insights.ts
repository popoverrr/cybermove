/** «Разборы» (BRIEF-SEO §2): выборка статей по языку, пути, время чтения, даты. */
import { getCollection, type CollectionEntry } from 'astro:content';
import type { LangCode } from '../../site.config';

export type Insight = CollectionEntry<'insights'>;

export interface InsightItem {
  entry: Insight;
  lang: LangCode;
  slug: string;
  /** путь без языкового префикса: /insights/<направление>/<slug>/ */
  path: string;
  minutes: number;
}

export const PAGE_SIZE = 12;

/** Время чтения: ~180 слов в минуту по-русски, ~220 по-английски; код и разметка не считаются */
export function readingMinutes(body: string, lang: LangCode): number {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|[\]()-]/g, ' ');
  const words = text.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
  return Math.max(1, Math.round(words / (lang === 'ru' ? 180 : 220)));
}

export function insightPath(e: Insight): string {
  return `/insights/${e.data.direction}/${e.id.split('/').slice(1).join('/')}/`;
}

export async function getInsights(lang: LangCode): Promise<InsightItem[]> {
  const all = await getCollection('insights', (e) => e.id.startsWith(`${lang}/`));
  return all
    .map((entry) => ({
      entry,
      lang,
      slug: entry.id.split('/').slice(1).join('/'),
      path: insightPath(entry),
      minutes: readingMinutes(entry.body ?? '', lang),
    }))
    .sort((a, b) => b.entry.data.date.getTime() - a.entry.data.date.getTime() || a.slug.localeCompare(b.slug));
}

export function formatDate(d: Date, lang: LangCode): string {
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
