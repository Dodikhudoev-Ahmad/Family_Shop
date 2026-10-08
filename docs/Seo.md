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

Caddy фронтенда матчит боты (WhatsApp, TelegramBot, facebookexternalhit, Twitterbot, YandexBot, Slackbot, vkShare и др.) для путей `/product/*` и `/catalog/*` и проксирует их на `https://api.familyshop10.kz/seo/...`. Backend отдаёт минимальный HTML: `title`, `description`, `canonical`, `og:*`, `product:price:*`, JSON-LD `Product`, внутри `<body>` короткий текст и ссылка. Люди получают обычный SPA.

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

## 9. Шаг B2 [BE]: что реализовано (2026-10-07)

- **B2a** — `Product.UpdatedAt` (миграция `AddProductUpdatedAt`, `docs/Database.md`). Обновляется только правкой товара админом (`ProductService.UpdateProductAsync`); списание остатка заказами, пересчёт рейтинга отзывами и сидер его не меняют — `lastmod` отражает изменение карточки, а не движение склада.
- **B2b/B2c** — `GET /seo/product/{id}`, `GET /seo/category/{slug}`, `GET /sitemap.xml` (`docs/Api.md`). В sitemap, помимо главной, категорий и товаров, включены `/catalog` и `/about` (публичные индексируемые страницы).
- Границы: все запросы ботов, проксированных через Caddy, придут на API с адреса сервиса фронтенда и попадут в **один** лимит — для `/seo/*` и `/sitemap.xml` он отдельный, 600/мин на IP (`RateLimitingExtensions`, не общие 100/мин) — кеш в Caddy (минуты) обязателен в шаге C. Бот-HTML только ru.
- Шаг C (Caddy) и включение на проде — отдельное «go».

## 10. Шаг C: Caddyfile для ботов (подготовлен, на ревью)

Файл `frontend/Caddyfile` лежит в рабочем каталоге **не закоммиченным** (владелец смотрит на ревью); на прод ничего не отправлялось.

### Как Railway раздаёт фронт (факты владельца и источники)
- Фронт собирает Railpack (Node 24, Root Directory `/frontend`, без Custom Build/Start), раздаёт Caddy: в логах «using config from file», «automatic HTTPS is completely disabled», порт 8080, HTTP/2 и HTTP/3 выключены. Railpack подхватывает `frontend/Caddyfile`, если он есть, и он заменяет сгенерированный.
- Сгенерированный шаблон (Node/Vite): <https://github.com/railwayapp/railpack/blob/main/core/providers/node/Caddyfile.template>. Текст прочитан с ветки `main`; версия, которую использует Railway сейчас, **не проверена**. В нём: глобально `admin off`, `persist_config off`, `auto_https off`, json-лог, `trusted_proxies static private_ranges 100.0.0.0/8`; сайт `:{$PORT:80}`; `respond /health 200`; заголовки `X-Content-Type-Options "nosniff"` и `-Server`; `root * ` с меткой DIST_DIR; `file_server { hide .git; hide .env* }`; `encode { gzip zstd }`; `try_files {path} {path}.html {path}/index.html` плюс `/index.html` при `IndexFallback`. Заголовков кеша нет.
- Свой файл: документация <https://railpack.com/languages/node> и <https://railpack.com/languages/staticfile> («overwrite this file with your own Caddyfile at the root of your project»); код `core/providers/node/spa.go`: `ctx.TemplateFiles(["Caddyfile.template", "Caddyfile"], ...)`, `DIST_DIR = path.Join("/app", outputDir)`, запуск `caddy run --config /Caddyfile --adapter caddyfile`. Следствие: **свой Caddyfile тоже проходит Go-шаблон**: метка DIST_DIR в двойных фигурных скобках заменяется на `/app/dist`, любые другие двойные фигурные скобки в файле ломают сборку. Код и документация прочитаны через пересказ страниц, дословность не гарантирована.

### Что делает файл
Стандартные настройки шаблона сохранены (порт, `auto_https off`, `/health` с пустым ответом 200, заголовки, gzip+zstd, `try_files` с SPA-fallback). Добавлено:
1. **Кеш статики:** `/assets/*` — `public, max-age=31536000, immutable` (имена с хешем); всё остальное статическое (index.html, картинки, robots.txt) — `no-cache` (проверка по ETag, новый деплой подхватывается сразу). Модуль кеша ответов в Caddy не нужен и недоступен: Railpack запускает стандартный Caddy без `cache-handler`.
2. **Бот-рендер:** `GET/HEAD` от User-Agent (без учёта регистра) `whatsapp|telegrambot|facebookexternalhit|twitterbot|yandexbot|slackbot|linkedinbot`: `/product/{число}` → `API/seo/product/{id}`, `/catalog/{slug}` → `API/seo/category/{slug}`. Путь на сайте — `/catalog/{slug}`, а не `/category/{slug}`, как в запросе (это адрес SPA; `/seo/category/` — адрес API). Остальные страницы ботам отдаются как SPA. Googlebot и bingbot в список **не входят** (решение владельца, 2026-10-07): они исполняют JS и читают мету из `useSeo`, а «динамический рендеринг» для Google — временный приём. При необходимости их можно вернуть в обе регулярки.
3. **`/sitemap.xml`** любому клиенту — с API (ответ на вопрос 1: проксируем на домен фронта, `Sitemap:` в `robots.txt` остаётся на www). `robots.txt` — статика.
4. API по умолчанию `https://api.familyshop10.kz`, переопределяется переменной `SEO_API_ORIGIN` (так файл проверен локально).

### Порядок обработчиков и риски
- **Порядок маршрутов** (по `caddy adapt`): заголовки и gzip для всех → `/health` → бот-товар → бот-категория → `/sitemap.xml` → статика и SPA (внутри: `/assets/*` с `immutable`, остальное `no-cache`, `try_files` с `/index.html`). `/health` вынесен в первый `handle`: голый `respond` Caddy ставит после всех `handle`, и catch-all статики перехватывал бы его (отвечал бы HTML SPA вместо пустого 200; в шаблоне Railpack `handle` нет, поэтому там это не проявляется).
- Вместо неявного порядка директив Caddy — взаимоисключающие `handle`: бот-товар, бот-категория, sitemap, затем всё остальное (статика + SPA). Заголовки кеша стоят только внутри последнего `handle`, поэтому не перетирают `Cache-Control` ответов API.
- `Host`: API принимает только свои хосты (`AllowedHosts`), поэтому `header_up Host {upstream_hostport}` обязателен; без него API ответит 400. Проверено эхо-сервером. Куки и `Authorization` в запрос к API не передаются. CORS не затронут (запросы серверные, не из браузера).
- **Сбой API:** ответы 400/401/403/429/5xx → бот получает `index.html` со статусом 200 (общая мета, как до шага C), sitemap → статический `public/sitemap.xml` из сборки (6 адресов). Полный отказ (соединение не устанавливается, таймаут 3 с и 8 с) → страницы получают `index.html` с 200 (запрос к самому себе, иначе в обработчике ошибок остался бы 502), sitemap → 502 (поисковик повторит позже). **404 от API проходит как есть** (404 + noindex): это настоящее «нет товара». Так сделано вопреки пункту «404 → SPA»: иначе бот получал бы 200 для несуществующего товара.
- **Лимит (до отдельной политики 600/мин для `/seo/*` и `/sitemap.xml` был общий 100/мин; теперь исправлено):** все боты приходят на API с адреса сервиса фронта (на Railway — один исходящий адрес), то есть делят одну корзину. Кеша ответов в Caddy нет. Проверено: 130 запросов бота подряд — первые 100 получили мету, остальные (429 от API) безопасно получили SPA с 200. Для людей риска нет (в API ходят только боты и sitemap), но при активном обходе Googlebot превью будут часто деградировать до общей меты. Рекомендация для отдельного шага [BE] (решение владельца: «лимит общий» был его условием): отдельная политика для `/seo/*` и `/sitemap.xml` (например, 600/мин) или приватная сеть Railway между сервисами.
- Обычные пользователи: не проксируются никогда (проверено: Safari-UA на `/product/292`, `/catalog/women`, `/` получает SPA, при сбое API тоже). Googlebot и bingbot бот-HTML не получают (убраны из регулярок): им отдаётся SPA, как и раньше, и они читают мету из `useSeo` после исполнения JS (проверено: их UA на `/product/292` получают SPA с общей метой).
- Если Caddyfile невалиден или Caddy на Railway старее 2.11.7 (на ней проверено), сервис не стартует, сайт ляжет. Откат — удалить `frontend/Caddyfile` и передеплоить (вернётся шаблон Railpack). Использованные возможности (`handle_response`, `header_up -X`, `status 5xx`, выражения в `handle_errors`) есть с Caddy 2.4+.

### Проверка без прода (2026-10-07)
Официальный Caddy 2.11.7 (контрольная сумма совпала) скачан во временный каталог, не установлен; `caddy validate` — «Valid configuration»; метка DIST_DIR подставлена на абсолютный путь локального `dist/`. Проверено через `curl` с локальным API на `localhost:5290` (БД разработки) и тестовыми заглушками вместо upstream:
- Браузерный UA: `/`, `/product/292`, `/catalog/women`, `/product/abc`, `/cart` → SPA, мета сайта. Боты (10 разных UA, включая `whatsapp/2.0` в нижнем регистре) на `/product/292` → мета товара, `Cache-Control: public, max-age=300`, `Vary: User-Agent`; `/catalog/women/?utm=1` → мета категории; несуществующие товар и категория → 404 + `noindex`; HEAD → 200; POST → 405.
- `/sitemap.xml` → 313 адресов с API; `robots.txt` — статика; `/seo/product/292` в браузере не проксируется (SPA).
- Кеш: `/assets/*.js` — `immutable`, gzip; `/`, `/product/5`, `og-default.png`, `robots.txt` — `no-cache`; `/health` — 200 с пустым телом (не HTML SPA).
- Сбой: upstream 500 и 429 → бот получает SPA с 200, sitemap — статический (6 адресов); порт закрыт → страницы SPA с 200 (за 1 мс), sitemap 502; обычный пользователь не затронут.
- Эхо-сервер: `Host` — хост upstream, а не www; `Cookie` и `Authorization` убраны; `X-Forwarded-For` добавлен.

### Не проверено
Реальная подстановка метки DIST_DIR Railpack в **пользовательский** Caddyfile (по исходному коду должна работать); версия Caddy на Railway; `AllowedHosts` на проде с `api.familyshop10.kz` (локально `*`); реальный `X-Forwarded-For` в цепочке Railway; превью в самих WhatsApp и Telegram (нужен прод).

### Что дальше
Ревью файла → «go» на коммит и пуш; после деплоя — чек-листы разделов 6 и 9 (Telegram: сбросить кеш через @WebpageBot, в WhatsApp проверять новую ссылку).
