/**
 * Content Collections (BRIEF-SEO §2): раздел «Разборы».
 * Файлы: src/content/insights/<lang>/<slug>.md — у RU и EN один slug, чтобы hreflang связывал версии.
 * JSON-тексты сайта (src/content/<lang>/*.json) коллекциями не являются — их читает lib/i18n.ts.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const DIRECTIONS = ['audit', 'systems', 'brand-content', 'traffic', 'tenders-legal'] as const;

const insights = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/insights' }),
  schema: z.object({
    /** H1 и заголовок в списках */
    title: z.string(),
    /** <title> ≤ 60 знаков; если нет — title */
    seoTitle: z.string().max(60).optional(),
    /** meta description 140–160 знаков */
    description: z.string().min(120).max(170),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    direction: z.enum(DIRECTIONS),
    /** id услуг из services.json: врезка «Что с этим делает CYBERMOVE» и обратные ссылки со страниц услуг */
    services: z.array(z.string()).min(1).max(3),
    /** id кейсов из cases.json */
    cases: z.array(z.string()).max(3).default([]),
    /** id слота media.json для OG-картинки (необязательно) */
    cover: z.string().optional(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  }),
});

export const collections = { insights };
