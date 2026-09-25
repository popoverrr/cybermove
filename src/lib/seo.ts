/** SEO: title/description, canonical, hreflang, Open Graph, JSON-LD. */
import { SITE_URL, SITE_NAME, SITE_LEGAL_NAME, LANGS, DEFAULT_LANG, WHATSAPP_NUMBER, GEOGRAPHY, ORG, type LangCode } from '../../site.config';
import { alternates, localePath, getContent } from './i18n';
import { BASE } from './base';

export interface HeadMeta {
  lang: LangCode;
  /** путь без языкового префикса, с завершающим слэшем: '/', '/services/audit/' */
  path: string;
  title: string;
  description: string;
  /** абсолютный или корневой путь к OG-картинке */
  ogImage?: string;
  ogType?: 'website' | 'article';
  noindex?: boolean;
}

/** Абсолютный URL: домен из конфига Astro (`site`; в превью на Pages — github.io) + базовый путь */
export function absolute(path: string): string {
  const site = (import.meta.env.SITE || SITE_URL).replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  // localePath уже содержит BASE — не дублируем
  return p.startsWith(`${BASE}/`) || (BASE && p === BASE) ? `${site}${p}` : `${site}${BASE}${p}`;
}

export function canonical(lang: LangCode, path: string): string {
  return absolute(localePath(lang, path));
}

export function hreflangLinks(path: string): Array<{ hreflang: string; href: string }> {
  const links = alternates(path).map((a) => ({ hreflang: a.hreflang, href: absolute(a.href) }));
  links.push({ hreflang: 'x-default', href: absolute(localePath(DEFAULT_LANG, path)) });
  return links;
}

/** OG-картинка страницы (scripts/og.mjs): /og/<lang>/<путь без слэшей>.jpg, главная — home */
export function ogFor(lang: LangCode, path: string): string {
  const key = path === '/' ? 'home' : path.replace(/^\/+|\/+$/g, '');
  return `/og/${lang}/${key}.jpg`;
}

export function ogLocale(lang: LangCode): string {
  return LANGS.find((l) => l.code === lang)?.locale ?? 'ru_RU';
}

/* ---------- JSON-LD ---------- */

/** Ссылка на Telegram из ника или URL (ORG.telegram) */
export function telegramUrl(t: string): string {
  return /^https?:\/\//.test(t) ? t : `https://t.me/${t.replace(/^@/, '')}`;
}

/**
 * Организация (BRIEF-SEO §4): одна сущность ProfessionalService (подтип LocalBusiness) с @id #organization —
 * на неё ссылаются Service, Article и WebSite. Поля из ORG со значением null в разметку не попадают.
 */
export function organizationLd(lang: LangCode) {
  const c = getContent(lang);
  const a = ORG.address;
  const sameAs = [...ORG.sameAs, ...(ORG.telegram ? [telegramUrl(ORG.telegram)] : [])];
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    legalName: SITE_LEGAL_NAME,
    alternateName: SITE_LEGAL_NAME,
    url: absolute('/'),
    logo: absolute('/icon-512.png'),
    image: absolute(`/og/${lang}/home.jpg`),
    slogan: c.ui.tagline,
    description: c.ui.meta.home.description,
    telephone: WHATSAPP_NUMBER,
    ...(ORG.email ? { email: ORG.email } : {}),
    ...(a
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: a.streetAddress,
            addressLocality: a.addressLocality,
            ...(a.addressRegion ? { addressRegion: a.addressRegion } : {}),
            ...(a.postalCode ? { postalCode: a.postalCode } : {}),
            addressCountry: a.addressCountry,
          },
        }
      : {}),
    ...(ORG.foundingYear ? { foundingDate: String(ORG.foundingYear) } : {}),
    ...(ORG.vatId ? { vatID: ORG.vatId } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: WHATSAPP_NUMBER,
        ...(ORG.email ? { email: ORG.email } : {}),
        contactType: 'sales',
        availableLanguage: ['ru', 'en'],
      },
    ],
    areaServed: [{ '@type': 'Country', name: 'Kazakhstan' }, ...GEOGRAPHY.map((city) => ({ '@type': 'City', name: city }))],
    knowsAbout: c.services.directions.map((d) => d.nameFull),
    // языки обслуживания — в contactPoint.availableLanguage: у LocalBusiness такого свойства нет (validator.schema.org)
  };
}

export function websiteLd(lang: LangCode) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: absolute(localePath(lang, '/')),
    name: SITE_NAME,
    inLanguage: lang,
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export function breadcrumbLd(lang: LangCode, items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: canonical(lang, it.path),
    })),
  };
}

/** Область обслуживания: Казахстан + города, где есть проекты (GEOGRAPHY) */
function areaServed() {
  return [{ '@type': 'Country', name: 'Kazakhstan' }, ...GEOGRAPHY.map((city) => ({ '@type': 'City', name: city }))];
}

/** Направление (хаб): Service с каталогом услуг; `url` позиции — страница услуги (BRIEF-SEO §1) */
export function serviceLd(
  lang: LangCode,
  opts: { name: string; description: string; path: string; services: Array<{ name: string; description: string; path: string }> },
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: opts.name,
    description: opts.description,
    url: canonical(lang, opts.path),
    provider: { '@id': `${SITE_URL}/#organization` },
    areaServed: areaServed(),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: opts.name,
      itemListElement: opts.services.map((s) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: s.name,
          description: s.description,
          url: canonical(lang, s.path),
        },
      })),
    },
  };
}

/** Страница услуги: Service без цен (цена называется после разбора) */
export function serviceItemLd(
  lang: LangCode,
  opts: { name: string; serviceType: string; description: string; path: string; category: string },
) {
  const url = canonical(lang, opts.path);
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url}#service`,
    name: opts.name,
    serviceType: opts.serviceType,
    category: opts.category,
    description: opts.description,
    url,
    provider: { '@id': `${SITE_URL}/#organization` },
    areaServed: areaServed(),
    offers: {
      '@type': 'Offer',
      url,
      availability: 'https://schema.org/InStock',
      seller: { '@id': `${SITE_URL}/#organization` },
    },
  };
}

export function faqLd(items: Array<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}
