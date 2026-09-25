/**
 * /llms.txt — описание сайта для AI-поисковиков (BRIEF-SEO §6, формат llmstxt.org).
 * Собирается из контента на сборке, поэтому список направлений, услуг и разборов не расходится с сайтом.
 */
import type { APIRoute } from 'astro';
import { getContent, localePath } from '../lib/i18n';
import { absolute } from '../lib/seo';
import { getInsights } from '../lib/insights';

export const GET: APIRoute = async () => {
  const ru = getContent('ru');
  const en = getContent('en');
  const url = (lang: 'ru' | 'en', path: string) => absolute(localePath(lang, path));

  const lines: string[] = [];
  lines.push('# CYBERMOVE (Cyber Move Consulting)', '');
  lines.push(
    '> Консалтинг для бизнеса: аудит и финансы, сайты и CRM, бренд и контент, реклама и SEO, тендеры и право. ' +
      'Казахстан, Европа, Азия. Сайт на русском и английском.',
    '',
  );

  lines.push('## Направления и услуги', '');
  for (const d of ru.services.directions) {
    lines.push(`- [${d.nameFull}](${url('ru', `/services/${d.slug}/`)}): ${d.phrase}`);
    for (const s of d.services) lines.push(`  - [${s.seo.h1}](${url('ru', `/services/${d.slug}/${s.id}/`)}): ${s.line}`);
  }
  lines.push('');

  const ruInsights = await getInsights('ru');
  if (ruInsights.length) {
    lines.push('## Разборы', '');
    for (const it of ruInsights) lines.push(`- [${it.entry.data.title}](${url('ru', it.path)}): ${it.entry.data.description}`);
    lines.push('');
  }

  lines.push('## Кейсы', '');
  lines.push(`- [${ru.cases.h1}](${url('ru', '/cases/')}): ${ru.cases.items.length} проектов в семи разделах`);
  lines.push('');

  lines.push('## Компания и контакты', '');
  lines.push(`- [О компании](${url('ru', '/about/')})`);
  lines.push(`- [Получить первичный разбор](${url('ru', '/contact/')})`);
  lines.push('');

  lines.push('## English', '');
  lines.push(`- [Home](${url('en', '/')})`);
  for (const d of en.services.directions) {
    lines.push(`- [${d.nameFull}](${url('en', `/services/${d.slug}/`)}): ${d.phrase}`);
    for (const s of d.services) lines.push(`  - [${s.seo.h1}](${url('en', `/services/${d.slug}/${s.id}/`)}): ${s.line}`);
  }
  for (const it of await getInsights('en')) lines.push(`- [${it.entry.data.title}](${url('en', it.path)})`);
  lines.push(`- [Case studies](${url('en', '/cases/')})`);
  lines.push(`- [Contact](${url('en', '/contact/')})`);
  lines.push('');

  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
