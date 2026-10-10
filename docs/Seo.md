# SEO и превью ссылок

Источник: `frontend/index.html`, `frontend/src/hooks/useSeo.ts`, `frontend/src/data/seo.ts`, `frontend/src/utils/jsonLd.ts`, `frontend/public/robots.txt`, `frontend/Caddyfile`, `backend/Api/Controllers/SeoController.cs`, `backend/Api/Seo/`, `backend/Application/Services/SeoService.cs`.

Основной домен: `https://www.familyshop10.kz` (canonical везде на www). API — `https://api.familyshop10.kz`.

## 1. Задача

Краулеры WhatsApp, Telegram, Facebook и часть поисковиков не исполняют JavaScript. SPA отдаёт им одну и ту же мету из `index.html`, поэтому превью любой ссылки одинаково. Решение без SSR: сайт сам обновляет мету в браузере (`useSeo`, для Google), а для ботов веб-сервер фронтенда (Caddy) отдаёт минимальный HTML с мета-тегами и JSON-LD, который строит backend.

## 2. Что где работает

| Слой | Что делает |
|---|---|
| `useSeo` (сайт) | После рендера обновляет `document.title`, description, `og:*`, `twitter:*`, `canonical` (без query-параметров), `robots`. Вызывается на главной, каталоге, категории, товаре, «О нас» и закрытых страницах. |
| JSON-LD (сайт) | `Organization` и `WebSite` на главной; `Product` + `BreadcrumbList` на товаре; `BreadcrumbList` на категории. Блоки добавляются в `<head>` при монтировании страницы и удаляются при уходе. |
| `SeoController` (API) | `GET /seo/product/{id}`, `GET /seo/category/{slug}` — минимальный HTML (title, description, canonical, `og:*`, `product:price:*`, JSON-LD), все значения экранируются; несуществующие объекты — 404 с `noindex`. `GET /sitemap.xml` — динамическая карта сайта. Все три анонимные, без префикса `/api/v1`. |
| Caddy (`frontend/Caddyfile`) | Статика и SPA-fallback; ботам превью-сервисов — проксирование на `/seo/*`; `/sitemap.xml` любому клиенту — с API. |

## 3. Страницы и мета

Язык бот-рендера — только ru; ключи `seo.*` для kk/en заведены для полноты словарей.

| Страница | Путь | Индексация |
|---|---|---|
| Главная, каталог, категория, товар, «О нас» | `/`, `/catalog`, `/catalog/{slug}`, `/product/{id}`, `/about` | `index,follow` |
| Корзина, оформление, кабинет, вход, избранное, админка, 404, несуществующий товар/категория | `/cart`, `/checkout`, `/account`, `/account/orders/{id}`, `/login`, `/favorites`, `/admin/*`, `*` | `noindex,nofollow` (мета) |

Правила: title ≤ 60 символов, description ≤ 160 (`truncateDescription`). `og:image` товара — первое фото (абсолютный URL), по умолчанию — растровый `public/og-default.png` 1200×630 (SVG мессенджеры в превью не показывают).

`robots.txt` закрывает только `/admin`, `/checkout`, `/account`: страницу, запрещённую в `robots.txt`, бот не откроет и мету `noindex` не увидит, поэтому остальные закрытые страницы закрыты метой.

Адрес сайта на сайте — переменная `VITE_SITE_URL` (без `/` в конце). Production-сборка без неё, с нечитаемым значением или с заглушкой `familyshop.example` падает с понятной ошибкой (`vite.config.ts`, `src/lib/siteUrl.ts`). В разработке запасной адрес — `http://localhost:5173`.

## 4. sitemap.xml

`GET /sitemap.xml` на API: главная, `/catalog`, `/about`, все категории и все товары, `Content-Type: application/xml`, кеш в памяти (`Seo:SitemapCacheSeconds`). Все `<loc>` абсолютные и строятся из настройки `Seo:SiteUrl` (по умолчанию `https://www.familyshop10.kz`, неверное значение останавливает запуск), а не из заголовка `Host`. `lastmod` у товара берётся из `Product.UpdatedAt` — оно меняется только правкой карточки админом, не остатком, заказами или отзывами (миграция `AddProductUpdatedAt`, `docs/Database.md`).

Caddy проксирует `/sitemap.xml` на API, поэтому `Sitemap:` в `robots.txt` указывает на домен сайта. При сбое API sitemap отдаётся из статического `public/sitemap.xml` сборки (короткий список), при полном отказе — 502.

## 5. Раздача ботам (Caddy)

Правила `frontend/Caddyfile`, взаимоисключающие `handle` по порядку:

1. `/health` — пустой 200.
2. `GET/HEAD` от User-Agent `whatsapp|telegrambot|facebookexternalhit|twitterbot|yandexbot|slackbot|linkedinbot`: `/product/{число}` → `API/seo/product/{id}`, `/catalog/{slug}` → `API/seo/category/{slug}`. Googlebot и bingbot в список не входят: они исполняют JS и читают мету из `useSeo`.
3. `/sitemap.xml` → API.
4. Статика и SPA-fallback (`try_files {path} /index.html`). `/assets/*` — `public, max-age=31536000, immutable` (имена с хешем), остальное — `no-cache`.

Важное:

- API принимает только свои хосты (`AllowedHosts`), поэтому запрос к нему идёт с `header_up Host {upstream_hostport}`; `Cookie` и `Authorization` на API не передаются.
- Адрес API по умолчанию `https://api.familyshop10.kz`, переопределяется переменной `SEO_API_ORIGIN`.
- Сбой API (400/401/403/429/5xx, таймаут, недоступность): бот получает `index.html` со статусом 200 (общая мета). 404 от API проходит как есть (404 + `noindex`) — это настоящее «нет товара».
- Все боты приходят на API с одного адреса сервиса фронтенда и делят один лимит: для `/seo/*` и `/sitemap.xml` действует отдельная политика 600/мин на IP, а не общие 100/мин.
- Обычные пользователи в API не проксируются никогда.
- Метка DIST_DIR (двойные фигурные скобки в Caddyfile) подставляется сборщиком фронтенда; любые другие двойные фигурные скобки в файле ломают сборку.
- Если Caddyfile невалиден, сервис фронтенда не стартует. Откат — убрать `frontend/Caddyfile` (вернётся шаблон сборщика).

## 6. JSON-LD

Один формат в двух местах: сайт (`utils/jsonLd.ts`, `hooks/useJsonLd.ts`) и ответы API (`Api/Seo/JsonLd.cs`).

| Страница | Блоки |
|---|---|
| Главная | `Organization` (name, url, logo, `contactPoint` и `sameAs` только если заданы `VITE_CONTACT_*` / `VITE_SOCIAL_*`), `WebSite` (без `SearchAction`: поиск — оверлей без адреса) |
| Товар | `Product` (name, description, sku, brand = Family Shop, url, image[], `offers`: price, `KZT`, availability по `stock > 0`; `aggregateRating` только при отзывах) + `BreadcrumbList` |
| Категория | `BreadcrumbList` |

- Общий формат закреплён эталонным файлом `docs/fixtures/jsonld/product-page.json`: его читают тест `SeoRendererTests` (backend) и `utils/jsonLd.test.ts` (сайт). Меняете формат — меняйте файл, иначе тесты красные с обеих сторон.
- Экранирование: backend — `JavaScriptEncoder` (`< > & '` всегда `\uXXXX`); сайт — `serializeJsonLd` заменяет `< > &` и U+2028/2029, текст ставится через `textContent`. `</script>` в названии товара не закрывает блок.
- Отдельного поля бренда у товара нет, указан сам магазин.

## 7. Проверка

- `curl -s https://www.familyshop10.kz/robots.txt` — нужное содержимое, `Sitemap:` указан.
- Sitemap валиден по схеме sitemaps.org, все `<loc>` на `https://www.familyshop10.kz`, присутствуют товары и категории.
- `curl -A "TelegramBot" https://www.familyshop10.kz/product/{id}` — в ответе `og:title`, `og:image`, цена, JSON-LD; тот же URL без бот-UA отдаёт обычный SPA.
- `og:image` открывается по абсолютному HTTPS-URL, не SVG, ≤ 5 МБ.
- Закрытые страницы (`/cart`, `/account`, `/admin`) отдают `noindex`.
- Rich Results Test (Google) для страницы товара: `Product` и `Offer` без ошибок.
- Превью: Telegram (сброс кеша через @WebpageBot), WhatsApp (кеш держится долго — проверять на новой ссылке), Facebook Sharing Debugger.

## 8. Возможные доработки

404 с настоящим статусом для несуществующих товаров в SPA, `hreflang` для kk/en, бот-рендер на kk/en, `AggregateRating` и `Organization` в бот-HTML.
