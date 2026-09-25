/**
 * RSS «Разборов» (BRIEF-SEO §2): /insights/rss.xml и /en/insights/rss.xml.
 */
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getContent, localePath, type LangCode } from '../../../lib/i18n';
import { getInsights } from '../../../lib/insights';
import { absolute } from '../../../lib/seo';
import { LANGS } from '../../../../site.config';

export function getStaticPaths() {
  return LANGS.map((l) => ({ params: { lang: l.prefix || undefined }, props: { lang: l.code } }));
}

export const GET: APIRoute = async ({ props }) => {
  const lang = (props as { lang: LangCode }).lang;
  const c = getContent(lang);
  const items = await getInsights(lang);
  return rss({
    title: `${c.ui.brand} — ${c.ui.insights}`,
    description: c.ui.meta.insights.description,
    site: absolute('/'),
    trailingSlash: true,
    items: items.map((it) => ({
      title: it.entry.data.title,
      description: it.entry.data.description,
      pubDate: it.entry.data.date,
      link: absolute(localePath(lang, it.path)),
      categories: [c.services.directions.find((d) => d.id === it.entry.data.direction)?.nameFull ?? it.entry.data.direction],
    })),
    customData: `<language>${lang}</language>`,
  });
};
