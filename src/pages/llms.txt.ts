/**
 * /llms.txt — описание сайта для AI-поисковиков (BRIEF-SEO §6, формат llmstxt.org).
 * Собирается из контента на сборке, поэтому список направлений, услуг и разборов не расходится с сайтом.
 */
import type { APIRoute } from 'astro';
import { getContent, localePath } from '../lib/i18n';
import { absolute } from '../lib/seo';

export const GET: APIRoute = () => {
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
    for (const s of d.services) lines.push(`  - ${s.name}: ${s.line}`);
  }
  lines.push('');

  lines.push('## Кейсы', '');
  lines.push(`- [${ru.cases.h1}](${url('ru', '/cases/')}): ${ru.cases.items.length} проектов в семи разделах`);
  lines.push('');

  lines.push('## Компания и контакты', '');
  lines.push(`- [О компании](${url('ru', '/about/')})`);
  lines.push(`- [Получить первичный разбор](${url('ru', '/contact/')})`);
  lines.push('');

  lines.push('## English', '');
  lines.push(`- [Home](${url('en', '/')})`);
  for (const d of en.services.directions) lines.push(`- [${d.nameFull}](${url('en', `/services/${d.slug}/`)}): ${d.phrase}`);
  lines.push(`- [Case studies](${url('en', '/cases/')})`);
  lines.push(`- [Contact](${url('en', '/contact/')})`);
  lines.push('');

  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
