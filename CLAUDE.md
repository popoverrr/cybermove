# CYBERMOVE — контекст для Claude Code

Сайт консалтинговой компании CYBERMOVE (Cyber Move Consulting). Полное ТЗ: `docs/BRIEF.md`, итерация 2 (палитра, скролл, плейсхолдеры): `docs/BRIEF-2.md`, итерация 3 (жемчужная сфера, линии туши, модель движения): `docs/BRIEF-3.md`, итерация 4 (исправления v3, медиа, звук, подсказки, выбор языка): `docs/BRIEF-4.md` + `docs/MEDIA-INTEGRATION.md`, итерация 5 (кейсы разделами, живые кадры, логотипы, деплой): `docs/BRIEF-5.md`, итерация 6 (SEO: страницы услуг, «Разборы», OG, организация): `docs/BRIEF-SEO.md` + `docs/seo/` — где противоречат, действует более поздний. Тексты: `docs/CONTENT.md`. Референс стилистики: `reference/ref-12.jpg`.
Если сессия начата заново или контекст сжат: прочитай последний бриф (`docs/BRIEF-SEO.md`), его чеклист (`docs/PROGRESS-6.md`; закрыт, итоги — `docs/REPORT-6.md`) и `docs/DECISIONS.md`; продолжай с первого незакрытого пункта. Закрытое не переделывай.
`docs/` и `reference/` не публикуются: они в `.gitignore`, живут только на диске (решение заказчика, репозиторий публичный).

## Стек

- Astro 7 (static, `build.format: 'directory'`, `trailingSlash: 'always'`), TypeScript.
- Three.js 0.186 без обёрток, GLSL через `onBeforeCompile`; postprocessing (pmndrs, только HIGH: SMAA + зерно); GSAP 3.15; Lenis (без autoRaf — единый цикл в `gsap.ticker`, см. `src/lib/home.ts`).
- WebGL главной: `src/webgl/Engine.ts` (рендер по вызову `frame(now)`), `Story.ts` (rig, фазы вход/удержание/выход, раскладка сферы в долях вьюпорта `scenes/layout.ts`), `scenes/*` (таймлайны по времени), `objects/*` (Sphere — жемчуг, LineSet/Dots — линии туши, Orbits/Grid/Satellites/Figures/Ribbons/Sheets/Rings/Dust).
- Свой CSS на custom properties: `src/styles/tokens.css`, `base.css`, `typography.css`. Без Tailwind, без UI-китов, без иконочных паков.
- Шрифты self-hosted (Fontsource): Inter Tight (основной, заголовки 300–350), JetBrains Mono (микрометки, меню). Unbounded удалён.
- Форма: `public/api/lead.php` (PHP 8+, настройки в `public/api/config.php`, в git только `config.sample.php`).
- Хостинг: Plesk shared, Apache + PHP, без Node на сервере. Деплой: `docs/DEPLOY.md`.

## Команды

```
npm run dev          # dev-сервер (в этом окружении: preview_start "cybermove-dev", порт 4330)
npm run build        # OG-картинки (scripts/og.mjs, с кэшем) + боевая сборка в dist/ (страницы /dev/* исключены)
npm run build:labs   # сборка с лабораториями /dev/*
# превью GitHub Pages: CYBERMOVE_BASE=/<репо>/ CYBERMOVE_SITE=https://<логин>.github.io PUBLIC_PREVIEW=1 npm run build (см. docs/DEPLOY.md)
npm run preview      # предпросмотр dist/ (preview_start "cybermove-preview", порт 4331)
npm run deploy       # боевая сборка + выкладка dist/ на cybermove.asia по FTPS (реквизиты в deploy/ftp.env, вне git)
npm run check        # astro check (одна ошибка выводится как «- 1 error»)
npm run og           # только OG 1200×630 → public/og/<lang>/<путь>.jpg (не в git); --force — перерисовать все
node scripts/seo-audit.mjs [--verbose]   # dist: H1, уровни заголовков, плейсхолдеры, title/description, canonical/hreflang, alt, граф ссылок
node scripts/lighthouse-gate.mjs https://cybermove.asia 3 gpu   # 6 типов страниц × mobile/desktop × 3 прогона → docs/lighthouse-gate.json
python scripts/build-logo.py [--active a|b|c]   # пересобрать логотип и favicon (активен a)
node scripts/posters.mjs http://127.0.0.1:4330   # постеры экранов, рендеры направлений, OG
node scripts/shots.mjs --out docs/screens/<фаза> --base http://127.0.0.1:4330 "/path:name" ...   # скриншоты Playwright (SwiftShader)
node scripts/probe.mjs "http://127.0.0.1:4330/?still&t=4&screen=2&local=0.45" [--mobile] [--eval "<js>"] [--shot f.png]   # ошибки консоли + состояние движка
node scripts/video.mjs --out docs/screens/v3/B/video --seconds 6 "/?screen=1&local=0.45:s2-hold"   # видео удержания (webm)
node scripts/test-scroll.mjs --base http://127.0.0.1:4331 [--nogl] [--sizes desktop,mobile]   # модель движения BRIEF-3 §6.7 (флик, колесо, Δ, флипы)
node scripts/test-frame.mjs --base http://127.0.0.1:4331 [--suffix v3]   # время кадра, Pixel 7, CPU ×4
node scripts/test-overlap.mjs --base http://127.0.0.1:4331 [--shots docs/screens/v4]   # S7 и полоса шапки на семи размерах
node scripts/test-audio.mjs --base http://127.0.0.1:4331    # автозапуск, жест, память, перенос позиции
node scripts/test-hints.mjs --base http://127.0.0.1:4331    # карточка языка и подсказка прокрутки
node scripts/test-cases.mjs --base http://127.0.0.1:4331    # /cases/: разделы, кадры, логотипы, липкая лента, зум, контраст имени
```

PHP локально: портативный `php.exe` (см. `docs/DECISIONS.md`), `php -l public/api/lead.php`.

## Структура

```
site.config.ts          параметры сайта (URL, языки, WhatsApp, аналитика, счётчики)
src/content/{ru,en}/    ui, home, services (у услуг и направлений — поле seo), cases, about, contact — JSON, источник правды по текстам
src/content/insights/   «Разборы»: <lang>/<slug>.md, один slug на RU и EN; схема — src/content.config.ts
src/lib/                i18n, seo, analytics, site (общий клиентский код), home (сценарий главной)
src/webgl/              Engine, Environment, Story, scenes/, objects/, shaders/, backgrounds/
src/components/         секции и UI; labs/ — лаборатории /dev/*
src/pages/[...lang]/    маршруты: ru в корне, en в /en/
public/api/             lead.php, config.sample.php, .htaccess
docs/                   BRIEF, CONTENT, PROGRESS, DECISIONS, TODO-CONTENT, DEPLOY, REPORT, screens/
```

## Правила

- Все тексты из `docs/CONTENT.md`; чего нет — `[PLACEHOLDER]` и запись в `docs/TODO-CONTENT.md`. Цифры не выдумывать.
- Реквизиты, адрес, e-mail, Telegram, соцсети — только `ORG` в `site.config.ts` (null не выводится ни на сайте, ни в JSON-LD). Людей на сайте нет: автор статей — организация.
- Страницы услуг `/services/<направление>/<услуга>/`, тексты — `services.json` → `seo`; title ≤ 60, description 140–160. Функциональные микрометки — `--fg-2` (axe 4.5:1), декоративные — umber (DECISIONS И2-D).
- Русские заголовки, английский только в микрометках.
- Палитра BRIEF-2 §3: тёплая светлая шкала ivory / sand / stone / clay, текст ink, единственный акцент — `--ink`; тёмная зона — S8 «Контакт» (BRIEF-3 §8.1, один атрибут `data-theme`), футер и меню-оверлей (`--night`). Синего, хрома, свечения, bloom и хроматической аберрации нет. Запрещены фиолетовые градиенты, glassmorphism, тени-облака, скругления 16px+, эмодзи, стоковые иконки.
- Микрометки: JetBrains Mono 11px, трекинг +0.12em, `--umber` (на stone/clay — `--bark`). Контраст: основной ≥ 4.5:1, микрометки ≥ 3:1 — проверять цифрами.
- Все открытые решения — одной строкой в `docs/DECISIONS.md`. После каждой фазы — коммит и отметка в `docs/PROGRESS.md`.
- Медиа: значение слота в `src/content/media.json` — строка или объект (`src`, `hero`, `logo`, `mono`, `kind`, `hover`, `brand`, `alt`); разбор — `src/lib/media.ts`. Кадры кейсов рисует `CaseFrame.astro` (кадр + градиент + белый логотип слоем + имя текстом), плитку — `CaseTile.astro`; `ImageSlot.astro` остался для команды, «О компании» и рендеров направлений. Кадры не тонируются и не перекрашиваются, при наведении только медленный зум.
- Параметры отладки главной: `?screen=N&local=0.45` (экран и его прогресс), `?progress=0.37`, `?still&t=4` (стоп-кадр: таймлайн текущей фазы на секунде t; `&te=0.4` — время выхода), `?hover=<service-id>`, `?tier=high|mid|low`, `?debug` (Tweakpane), `?stats` (fps / мс / тир / DPR / draw calls), `?nogl` (постер-фолбэк).
- Скриншоты и тесты — только через Playwright (`scripts/*.mjs`): во встроенном браузере rAF стоит, пока вкладка не на переднем плане. Под SwiftShader композитор иногда отдаёт пустой кадр — `shots.mjs` повторяет снимок.
- В Bash-хередоках на этой машине ломаются `\\` — файлы с бэкслэшами писать через Write.
