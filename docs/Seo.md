# SEO и превью ссылок

Статус: шаг A (исследование) выполнен; **шаг B1 [FE] выполняется по решениям владельца (раздел 8)**. Шаги B2 и C ждут «go».
Источник: `frontend/index.html`, `frontend/src/hooks/useSeo.ts`, `frontend/src/data/seo.ts`, `frontend/public/{robots.txt,sitemap.xml}`, `frontend/src/App.tsx`, `backend/Domain/Entities/{Product,Category}.cs`, `backend/Api/Controllers/ProductsController.cs`, `docs/Deploy.md`, `CLAUDE.md`.

Домен: основной `https://www.familyshop10.kz` (canonical везде на www), корень редиректится на www у регистратора. API — `https://api.familyshop10.kz`.

## 1. Текущее состояние

| Что | Как сейчас |
|---|---|
| `lang` | `<html lang="ru">` в `index.html`. При смене языка обновляется (`src/i18n/index.ts:47`), но бот без JS видит всегда `ru`. |
| title / description | Статичные в `index.html` («Family Shop — интернет-магазин одежды в Казахстане» и описание). |
| OG / Twitter | Статичные в `index.html`: `og:site_name`, `og:type=website`, `og:title`, `og:description`, `og:image`, `og:url`, `twitter:*`. |
| `og:image` | Заглушка `logo-icon-badge.svg` (SVG). WhatsApp, Telegram, Facebook SVG в превью не показывают. Нужно растровое фото 1200×630. |
| Динамические мета | Свой хук `useSeo` (без react-helmet): после рендера в браузере обновляет `document.title`, description, `og:*`, `twitter:*`, `canonical`. Вызывается на главной, каталоге/категории, товаре, «О нас». |
| Canonical | `index.html`: `%VITE_SITE_URL%/`; `useSeo` ставит `SITE_URL + pathname` (query-параметры отбрасываются — верно). |
| `VITE_SITE_URL` | Подставляется при сборке. Если не задана, подставляется `https://familyshop.example`. Локальный `dist/index.html` содержит именно этот placeholder. **Значение на Railway не проверено** (прод не трогаем) — первый пункт чек-листа. |
| robots.txt | Статичный: `Allow: /`, `Disallow: /account /checkout /login /favorites`, `Sitemap: https://www.familyshop10.kz/sitemap.xml`. Нет `/cart`, `/admin`. |
| sitemap.xml | Статичный, 6 URL: `/`, `/catalog`, `/catalog/{women,men,kids}`, `/about`. Нет товаров, нет 4 категорий (`bytovaya-tehnika`, `sport`, `posuda`, `aksessuary`), нет `lastmod`. |
| favicon | `/favicon.svg` (SVG). Нет PNG/ICO, нет `apple-touch-icon`, нет `manifest`. Яндекс и часть мессенджеров берут PNG/ICO. |
| noindex | Нигде не выставляется ни метой, ни заголовком. Закрытые страницы закрыты только `Disallow` (он не убирает уже известный URL из выдачи). |
| JSON-LD | Нет. |
| Хостинг фронта | В репозитории **нет** `Caddyfile`, `railway.json`, `nixpacks.toml` и Dockerfile фронтенда (есть только `backend/Dockerfile`). `docs/Deploy.md`: «Vite-сборка», автодеплой с `main`. `TODO.md` предполагает Caddy, «если Railway его подхватывает». Что именно отдаёт статику и как сделан SPA fallback, из кода установить нельзя. |
| SPA fallback | Любой путь вне файлов отдаёт `index.html` со статусом 200 (иначе `/product/5` не открывался бы по прямой ссылке). Неизвестные пути и несуществующие товары тоже 200: поисковики видят soft-404. |

Главная проблема: **краулеры WhatsApp, Telegram, Facebook не исполняют JavaScript**. Для любой ссылки (товар, категория) они видят только мету из `index.html` — одинаковую для всего сайта. `useSeo` работает для Google (исполняет JS, с задержкой), но не для превью в мессенджерах и ненадёжно для Яндекса.

## 2. Варианты

### (a) Бот-рендер: Caddy по User-Agent отдаёт HTML с мета с backend

Caddy фронтенда матчит боты (WhatsApp, TelegramBot, facebookexternalhit, Twitterbot, YandexBot, Googlebot, bingbot, Slackbot, vkShare и др.) для путей `/product/*` и `/catalog/*` и проксирует их на `https://api.familyshop10.kz/seo/...`. Backend отдаёт минимальный HTML: `title`, `description`, `canonical`, `og:*`, `product:price:*`, JSON-LD `Product`, внутри `<body>` короткий текст и ссылка. Люди получают обычный SPA.

- Плюсы: превью товара и категории в WhatsApp/Telegram правильные; данные всегда свежие (читаются из БД); SPA не трогаем; одна точка правды для мета.
- Риски: (1) нужен Caddyfile фронтенда, которого в репозитории нет — и неизвестно, даёт ли Railway-сборка его подменить; (2) разные ответы людям и ботам (cloaking) допустимы, пока содержимое то же самое; (3) нагрузка на API от ботов (лечится `Cache-Control` и кэшем в памяти); (4) `AllowedHosts` пускает только хосты API, поэтому прокси должен ходить на `api.familyshop10.kz` с его собственным `Host`; (5) определение бота по User-Agent неполное.
- Объём: backend — контроллер `SeoController` (2–3 действия) + HTML-шаблон с экранированием + тесты (XSS в названии товара!); frontend-хост — Caddyfile (+ при необходимости Dockerfile/Railway-настройка сборки); docs. Около 1 дня.
- Влияние на прод: новый публичный эндпоинт (добавить в `EndpointAuthorizationTests`), изменение способа раздачи фронтенда на Railway (рискованный пункт); данные и миграции не затрагиваются (кроме `lastmod`, см. п. 4).

### (b) Пререндер статикой на сборке

Скрипт после `vite build` ходит в API, генерирует `dist/product/{id}/index.html` и `dist/catalog/{slug}/index.html` с готовой метой.

- Плюсы: никакого динамического кода на проде, работает на любом статическом хосте.
- Риски: данные устаревают до следующей сборки; админ добавил товар — он без мета до редеплоя; на каждую правку цены нужен пересбор; сборка зависит от доступности API на Railway во время билда; число файлов растёт с каталогом; нужна автоматика редеплоя по событию в админке (которой нет).
- Объём: скрипт сборки + хук деплоя ~0,5–1 дня, но поддержка свежести — отдельная задача.
- Влияние на прод: меняется процесс сборки; свежесть мета нарушает цену/наличие в превью (неверная цена хуже отсутствия).

### (c) Иное

1. **SSR/Next.js** — отвергнуто условием задачи (переписывание).
2. **Внешний сервис пререндера** (prerender.io и аналоги) — платный, внешняя зависимость, данные магазина уходят третьей стороне. Не рекомендуется.
3. **Только `useSeo` + sitemap** — минимум, но превью в мессенджерах остаётся одинаковым для всех ссылок; цель задачи не достигается.
4. **Редирект бота на API без Caddy** (через Cloudflare Worker/Railway Edge) — тот же вариант (a) на другой платформе; требует нового сервиса. Только если Caddy фронта подменить нельзя.

### Рекомендация

**Вариант (a)** как минимальный: единственный, где мета всегда актуальна, и не требует пересборки. Условие: сначала установить, как фронтенд раздаётся на Railway (п. 1, «Хостинг фронта»). Если Caddyfile подменить нельзя, (a) реализуется через небольшой статический Caddy-контейнер (Dockerfile во `frontend/`) — это отдельное решение владельца (меняет деплой фронта).

Шаги B и C ниже сделаны так, чтобы **шаг B (backend + sitemap + robots) работал без изменения хостинга**, а шаг C (Caddy) включался отдельно и откатывался одной правкой.

## 3. Страницы и шаблоны мета

Язык: ru (основной). Для kk/en бот-рендер в первой версии не делается (общий ru-вариант); `useSeo` для людей и Google остаётся на текущих словарях.

| Страница | Путь | Индексация | title | description |
|---|---|---|---|---|
| Главная | `/` | index | `Family Shop — интернет-магазин одежды в Казахстане` | `Женская, мужская и детская одежда, обувь и сумки с быстрой доставкой по Казахстану. Минимализм и качество в каждой вещи.` (как сейчас) |
| Каталог | `/catalog` | index | `Каталог — Family Shop` | `Весь каталог одежды Family Shop — женское, мужское, детское, обувь и сумки. Быстрая доставка по Казахстану.` (как сейчас) |
| Категория | `/catalog/{slug}` | index | `{Категория} — купить в Казахстане | Family Shop` (≤ 60 симв.) | `{Категория}: {N} товаров в Family Shop. Цены от {мин. цена} ₸, быстрая доставка по Казахстану.` |
| Товар | `/product/{id}` | index | `{Название} — {цена} ₸ | Family Shop` | первые 150 символов описания товара; если пусто — `{Название} в интернет-магазине Family Shop. Доставка по Казахстану.` |
| О нас | `/about` | index | `О нас — Family Shop` | как сейчас |
| Корзина | `/cart` | **noindex** | `Корзина — Family Shop` | — |
| Оформление | `/checkout` | **noindex** | `Оформление заказа — Family Shop` | — |
| Профиль, заказы | `/account`, `/account/orders/{id}` | **noindex** | `Личный кабинет — Family Shop` | — |
| Вход | `/login` | **noindex** | `Вход — Family Shop` | — |
| Избранное | `/favorites` | **noindex** | `Избранное — Family Shop` | — |
| Админка | `/admin/*` | **noindex** | `Админка — Family Shop` | — |
| 404 | `*` | **noindex** | `Страница не найдена — Family Shop` | — |

Правила: title ≤ 60 символов, description ≤ 160 (`truncateDescription`), без спецсимволов в начале; в `og:image` у товара — первое фото (абсолютный URL; сейчас API отдаёт URL с `Uploads:PublicBaseUrl`, для внешних Unsplash/Pexels — как есть); у категорий и главной — растровая картинка 1200×630 (нужно подготовить, см. шаг B). `noindex` ставится и метой `<meta name="robots" content="noindex,nofollow">` (через `useSeo`), и в `robots.txt` — но учтите: запрещённый в `robots.txt` URL бот не открывает и мету `noindex` не увидит. Поэтому для закрытых страниц **выбираем meta noindex, а в `robots.txt` оставляем только админку** (`/admin`) и служебное (`/checkout`, `/account`), где индексирование и так маловероятно; решение владельца — см. вопрос 2.

JSON-LD товара (только в бот-HTML и, опционально, в SPA): `@type: Product`, `name`, `image`, `description`, `sku` (= id), `offers` с `price`, `priceCurrency: KZT`, `availability` (`InStock` если `Stock > 0`, иначе `OutOfStock`), `url`. Без `aggregateRating` пока `ReviewCount = 0`; при наличии отзывов — `AggregateRating` из `AverageRating`/`ReviewCount`.

## 4. sitemap.xml и robots.txt

**sitemap.xml** — динамический, с backend: `GET /sitemap.xml` на API (`AllowAnonymous`, кэш 1 час, `Content-Type: application/xml`). Содержимое: главная, `/catalog`, `/about`, все категории (`/catalog/{slug}`), все товары (`/product/{id}`). Все `<loc>` абсолютные на `https://www.familyshop10.kz` (из настройки `Seo:SiteUrl`, а не из заголовка Host — иначе подмена Host даст чужие ссылки). Лимит: 50 000 URL на файл; при приближении — sitemap-index.

- `lastmod`: у `Category` и у `Product` поля «изменён» нет, есть только `Product.CreatedAt`. Варианты: (1) `lastmod` только для товаров из `CreatedAt` (быстро, неточно — правки цены не отражены); (2) добавить `Product.UpdatedAt` — **миграция** (аддитивная, `ADD COLUMN IF NOT EXISTS`, заполнение `CreatedAt`), правка `ProductService` и сидера. Рекомендация: (2), но отдельным подшагом B2 (решение владельца, вопрос 3). Без `lastmod` поисковики sitemap принимают, поэтому не блокер.
- Раз sitemap отдаёт API, а ссылка в `robots.txt` указывает на домен фронта, нужен **`Sitemap: https://api.familyshop10.kz/sitemap.xml`** (Google разрешает sitemap на другом хосте, если он указан в `robots.txt` сайта; Яндекс.Вебмастер также принимает; но Search Console требует подтверждённого владения обоими, поэтому надёжнее вариант ниже) либо проксирование `/sitemap.xml` с домена фронта на API правилом Caddy (шаг C). Выбор — вопрос 1.
- Статичный `public/sitemap.xml` после этого удаляется (иначе два источника).

**robots.txt** — статичный, во `frontend/public/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /checkout
Disallow: /account

Sitemap: https://www.familyshop10.kz/sitemap.xml
```

`/cart`, `/login`, `/favorites` в `Disallow` не входят: их закрывает мета `noindex`, а бот увидит её только на разрешённой странице.

Параметры фильтров не должны плодить дубли: canonical в `useSeo` и так без query. Старые Railway-адреса фронта (`*.up.railway.app`) должны отдавать `Disallow: /` или редиректить на www, чтобы не появились дубли сайта в выдаче (проверить; отдельный пункт чек-листа).

## 5. План шагов B и C

Каждый шаг — отдельный «go». BE и FE не смешиваются без [FULL].

**Шаг B1 [FE] — база на сайте.** `useSeo` принимает `noindex`; `noindex` на закрытых страницах и 404; `og:image` — растровый (подготовить 1200×630 JPG/PNG, положить в `public/`); `favicon.png`/`apple-touch-icon`; `robots.txt` по п. 4; удалить статичный `sitemap.xml` (после шага B2); тесты на `useSeo`; docs. Backend не трогаем.

**Шаг B2 [BE] — sitemap и бот-страницы.** `SeoController`: `GET /sitemap.xml`, `GET /seo/product/{id}`, `GET /seo/category/{slug}`, `GET /seo/home` (минимальный HTML, экранирование всех значений, `Cache-Control: public, max-age=300`, 404 с `noindex` для несуществующих); настройка `Seo:SiteUrl`; добавить в список анонимных в `EndpointAuthorizationTests`; rate limit — общий; тесты (XSS, цена, `availability`, абсолютные URL, формат sitemap, лимит); при согласии — `Product.UpdatedAt` (миграция идемпотентная, подшагом). Доп. вопрос по CSP/заголовкам: ответы API уже с `nosniff`; HTML-ответ нужен с `Content-Type: text/html; charset=utf-8`.

**Шаг C [QA/инфра] — раздача для ботов (Caddy).** Только после установки способа раздачи фронта на Railway. Caddyfile: SPA fallback `try_files {path} /index.html`, правило бот-UA → `reverse_proxy https://api.familyshop10.kz` (`/product/*`, `/catalog/*`, `/` и при выбранном варианте `/sitemap.xml`), `Vary: User-Agent`, заголовки безопасности из `TODO.md`. Проверка до включения на staging/через `curl -A`. Откат: убрать блок правила. Трогает прод: по команде владельца.

**Шаг D (позже, по желанию).** 404 с настоящим статусом для несуществующих товаров (бот-HTML отдаёт 404), `hreflang` для kk/en, `BreadcrumbList` JSON-LD, `AggregateRating`, `Organization` JSON-LD.

## 6. Чек-лист

До начала:
- [ ] Узнать у владельца/на Railway, чем раздаётся фронт (Caddy из Railpack, свой Caddyfile, Dockerfile) и можно ли его подменить.
- [ ] Проверить на Railway, что `VITE_SITE_URL=https://www.familyshop10.kz` задана (без `/`); в боевом `index.html` не должно быть `familyshop.example`.
- [ ] Старые адреса Railway: убрать из индекса (редирект на www или `Disallow: /`).

После шага B/C:
- [ ] `curl -s https://www.familyshop10.kz/robots.txt` — нужное содержимое, `Sitemap:` указан.
- [ ] Sitemap открывается, валиден по схеме sitemaps.org, все `<loc>` на `https://www.familyshop10.kz`, товары и 8 категорий присутствуют.
- [ ] `curl -A "TelegramBot" https://www.familyshop10.kz/product/{id}` — в ответе `og:title`, `og:image`, цена, JSON-LD; тот же URL без бот-UA отдаёт обычный SPA.
- [ ] `og:image` товара открывается по абсолютному HTTPS-URL, размер ≤ 5 МБ, не SVG.
- [ ] Google Search Console: подтвердить домен (DNS), отправить sitemap, проверить «Проверка URL» для главной, категории, товара; смотреть отчёт «Индексирование» на дубли и soft-404.
- [ ] Яндекс.Вебмастер: подтвердить сайт, указать регион (Казахстан), добавить sitemap, проверить «Переобход страниц», главное зеркало — `www`.
- [ ] Превью: отправить ссылку на товар и на категорию себе в Telegram (при смене мета — сбросить кэш через бот @WebpageBot), в WhatsApp (кэш WhatsApp держится долго — проверять на новой ссылке или с `?v=2`), в Facebook Sharing Debugger.
- [ ] Rich Results Test (Google) для страницы товара: `Product` и `Offer` без ошибок.
- [ ] Закрытые страницы (`/cart`, `/account`, `/admin`) отдают `noindex`.
- [ ] Ни секретов, ни внутренних адресов в бот-HTML и sitemap нет.

## 7. Вопросы владельцу

1. Sitemap отдавать с домена API (в `robots.txt` указать ссылку на `api.familyshop10.kz`) или проксировать на домен фронта (требует шага C)? Рекомендация: проксировать, но временно допустим вариант с API.
2. Закрытые страницы: достаточно `noindex` мета плюс `Disallow` для `/admin` и `/checkout`, или оставить полный `Disallow` как сейчас? Рекомендация: мета `noindex` + короткий `Disallow`.
3. Добавить `Product.UpdatedAt` (миграция) ради `lastmod`? Рекомендация: да, отдельным подшагом.
4. Есть ли готовое брендовое фото 1200×630 для `og:image`? Без него превью главной и категорий останутся пустыми.
5. Нужен ли бот-рендер на kk/en в первой версии (рекомендация: нет, только ru)?

## 8. Решения владельца для шага B1 [FE] (2026-10-07)

- Закрытые страницы: мета `<meta name="robots" content="noindex,nofollow">` на `/cart`, `/checkout`, `/account` и `/account/orders/{id}` (в запросе владельца — «/profile»; в приложении такого маршрута нет, личный кабинет — `/account`), `/login`, `/favorites`, `/admin/*`, 404 и несуществующие товар/категория. Остальные страницы получают `index,follow`. Короткий `Disallow` в `robots.txt`: `/admin`, `/checkout`, `/account`.
- Язык мета — только ru-шаблоны из раздела 3; ключи `seo.*` в kk/en заведены для полноты словарей (тест словарей требует одинаковый набор ключей).
- Адрес сайта: `VITE_SITE_URL` (без `/` в конце) обязателен. Production-сборка без него, с нечитаемым значением или с прежней заглушкой `familyshop.example` **падает** с понятной ошибкой (`vite.config.ts`, функция `resolveSiteUrl` в `src/lib/siteUrl.ts`). В разработке и тестах запасной адрес — `http://localhost:5173`. Заглушки `familyshop.example` в коде больше нет. На Railway `VITE_SITE_URL=https://www.familyshop10.kz` нужно задать **до** пуша, иначе деплой фронта упадёт (так задумано).
- `og:image` по умолчанию — растровый `public/og-default.png` 1200×630 (палитра и логотип бренда); у товара — первое фото. Прежний `logo-icon-badge.svg` остаётся в `public/` (старые ссылки), в мете не используется.
- Статичный `sitemap.xml` пока остаётся (6 адресов), заменяется динамическим в шаге B2.
