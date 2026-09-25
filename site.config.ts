/**
 * Параметры сайта CYBERMOVE. Всё, что заказчик может поменять без правки кода, — здесь.
 * Параметры формы (почта, Telegram, вебхук) — в public/api/config.php (см. config.sample.php).
 */

export const SITE_URL = 'https://cybermove.asia';
export const SITE_NAME = 'CYBERMOVE';
export const SITE_LEGAL_NAME = 'Cyber Move Consulting';

export type LangCode = 'ru' | 'en';

export interface LangDef {
  code: LangCode;
  /** префикс маршрута: '' для языка по умолчанию, 'en' для /en/ */
  prefix: string;
  hreflang: string;
  /** подпись в переключателе */
  label: string;
  /** locale для Intl / og:locale */
  locale: string;
}

export const LANGS: readonly LangDef[] = [
  { code: 'ru', prefix: '', hreflang: 'ru', label: 'RU', locale: 'ru_RU' },
  { code: 'en', prefix: 'en', hreflang: 'en', label: 'EN', locale: 'en_US' },
] as const;

export const DEFAULT_LANG: LangCode = 'ru';

export const WHATSAPP_NUMBER = '+7 701 825 10 28';
export const WHATSAPP_URL = 'https://wa.me/77018251028';

/**
 * Фоновая музыка (BRIEF-4 §2): источники по убыванию предпочтения, выбирается первый, который умеет браузер
 * (opus — Chrome/Firefox, m4a — Safari, mp3 — запас). `null` или пустой массив — кнопка звука скрыта.
 * Файлы в public/audio/, параметры петли в public/audio/loop.json, происхождение в LICENSE.txt.
 */
export const AUDIO_TRACK: string | string[] | null = ['audio/ambient.opus', 'audio/ambient.m4a', 'audio/ambient.mp3'];

/** Аналитика: пустая строка = выключено. */
export const ANALYTICS = {
  ga4: '', // 'G-XXXXXXXXXX'
  metaPixel: '', // '123456789012345'
  tiktokPixel: '', // 'XXXXXXXXXXXXXXXXXX'
};

/**
 * Подтверждение прав в панелях поисковиков (BRIEF-SEO §6): значение атрибута content из meta-кода.
 * Пустая строка — тег не выводится. Google Search Console удобнее подтвердить DNS-записью (см. ДЛЯ_ЧЕЛОВЕКА).
 */
export const VERIFICATION = {
  google: '', // <meta name="google-site-verification" content="…">
  bing: '', // <meta name="msvalidate.01" content="…">
  yandex: '', // <meta name="yandex-verification" content="…">
};

/**
 * Организация (BRIEF-SEO §4): NAP для /contact/, подвала и JSON-LD ProfessionalService.
 * null — данных от заказчика ещё нет: поле не выводится ни на сайте, ни в разметке.
 * Формат адреса — как в профиле Google Business Profile (название, адрес, телефон должны совпадать буква в букву).
 */
export interface OrgAddress {
  streetAddress: string; // 'пр. Абая, 10, офис 5'
  addressLocality: string; // 'Алматы'
  addressRegion: string | null; // 'Алматы' / область
  postalCode: string | null; // 'A05X0X0'
  addressCountry: string; // 'KZ'
}
export const ORG: {
  address: OrgAddress | null;
  email: string | null;
  /** ник без @ или ссылка t.me */
  telegram: string | null;
  foundingYear: number | null;
  /** БИН / VAT ID */
  vatId: string | null;
  /** профили в соцсетях и справочниках: полные URL */
  sameAs: string[];
} = {
  address: null,
  email: null,
  telegram: null,
  foundingYear: null,
  vatId: null,
  sameAs: [],
};

/** Куда уходит форма. Относительный путь от корня сайта. */
export const LEAD_ENDPOINT = '/api/lead.php';

/** Счётчики экрана «Рост» (реальные, с текущего сайта). */
export const COUNTERS = {
  projects: 34,
  cities: 13,
  industries: 7,
  yearsWithUsyk: 6,
};

export const GEOGRAPHY = [
  'Bielefeld', 'Paris', 'Barcelona', 'Prague', 'Milan', 'Kyiv', 'Odesa',
  'Almaty', 'Astana', 'Shymkent', 'Shanghai', 'Tokyo', 'Bali',
];

export const TICKER = [
  'USYK', 'Ukrainian Fashion Week', 'INTERTOP', 'BRSM-NAFTA', 'HYDROSTA', 'ТПК',
  'Українське радіо', 'MAHARADJ', 'Good Market', 'Morris Group',
];
