# API

Источник: `backend/Api/Controllers/`, `RateLimiting/`. Префикс: `/api/v1`. Ответы обёрнуты в `ApiResponse<T>` (`success`, `data`, `errors`, при ошибке с кодом — `code`, `meta`).
Прод: `https://api.familyshop10.kz`.

Доступ: Г = гость, П = покупатель (нужен токен), А = только Admin.

## Публичные и пользовательские

| Метод и путь | Доступ | Лимит | Примечание |
|---|---|---|---|
| GET `/products` | Г | общий | фильтры (в т.ч. `shoeSegment` 0 Men / 1 Women / 2 Kids / 3 Teen, `childGender` 0 Boy / 1 Girl, `size`), пагинация, сортировка. В товаре: `shoeSegment`, `childGender`, `sizes[{size, available}]` (вся сетка товара; `available` = размер продаётся и товар на складе); для обуви `availableSizes` всегда явный список |
| GET `/products/size-grids` | Г | общий | сетки обуви по сегментам `{shoes:[{segment, gender, sizes, childGenders}]}` — единственный источник диапазонов (Men 39–45, Women 35–41, Kids 27–37, Teen 37–41) |
| GET `/products/{id}` | Г | общий | |
| GET `/categories` | Г | общий | `[{id, name, slug, parentCategoryId, hasSizes, sortOrder}]`, порядок `sortOrder`, затем `id` (порядок меню); новая категория из админки получает `max(sortOrder)+10`, редактирования порядка в админке пока нет |
| GET `/promo-banners/active` | Г | общий | |
| GET `/products/{productId}/reviews`, `/summary` | Г | общий | |
| GET `/products/{productId}/reviews/mine` | П | общий | |
| POST `/products/{productId}/reviews` | П | 5/мин | второй отзыв на товар — отказ |
| DELETE `/products/{productId}/reviews` | П | общий | свой отзыв |
| POST `/promo-codes/validate` | Г | 15/мин | предпросмотр скидки |
| POST `/orders` | П | 10/мин | заголовок `Idempotency-Key` |
| GET `/orders` | П | общий | свои заказы |

## Здоровье сервиса (без префикса `/api/v1`)

Оба — гость, общий лимит 100/мин на IP, ответ JSON без `ApiResponse`, без кеша.

| Метод и путь | Ответ | Примечание |
|---|---|---|
| GET `/health` | `200 {"status":"healthy"}` / `503 {"status":"unhealthy"}` | liveness: только доступность БД (`CanConnectAsync`). Для healthcheck Railway; **не** отличает полумигрированную схему от здоровой |
| GET `/health/ready` | `200 {"status":"ready"}` / `503 {"status":"degraded","migrations":"failed\|ok","seed":"failed\|ok"}` | старт завершился без сбоев (миграции, сидер, перенос хоста URL фото). Читается из памяти (`StartupStatus`), БД не трогает. Текст ошибки не отдаётся; при сбое переноса URL фото в ответ добавляется `"uploadUrls":"failed"`. Для внешнего монитора (UptimeRobot/BetterStack) |

## SEO: sitemap и страницы для ботов (без префикса `/api/v1`)

Нужны для превью ссылок и индексации, см. `docs/Seo.md`. Все — гость, свой лимит 600/мин на IP (отдельная корзина, общие 100/мин не расходует; Caddy-прокси должен кешировать ответы), ответы без `ApiResponse`, не JSON. Адрес сайта — настройка `Seo:SiteUrl` (по умолчанию `https://www.familyshop10.kz`, без `/` в конце, неверное значение — ошибка запуска), все ссылки абсолютные на этот адрес.

| Метод и путь | Ответ | Примечание |
|---|---|---|
| GET `/seo/product/{id}` | `200 text/html` | минимальный HTML: `title`, `description`, `canonical`, `og:*`, `product:price:*`, JSON-LD `Product` с `offers` (KZT), `robots: index,follow`. Несуществующий id — **404** с `noindex` |
| GET `/seo/category/{slug}` | `200 text/html` | `title`, `description` (число товаров и минимальная цена), `canonical`, `og:*`. Неизвестный slug — **404** с `noindex` |
| GET `/sitemap.xml` | `200 application/xml` | главная, `/catalog`, `/about`, все категории, все товары; `lastmod` из `Product.UpdatedAt` (у категорий и главной — максимум по товарам); закрытых страниц нет; не более 50 000 адресов (при переполнении самые давно не менявшиеся товары отбрасываются, в лог — предупреждение); кеш в памяти `Seo:SitemapCacheSeconds` (по умолчанию 600) и `Cache-Control: public, max-age=3600` |

Значения из БД в HTML экранируются (`< > & " '`), JSON-LD сериализуется с экранированием `< > & '` (нельзя закрыть `<script>`), `og:image` — только `http(s)`-адрес, иначе картинка по умолчанию. Тексты — шаблоны ru из `docs/Seo.md`, раздел 3.

## Авторизация (веб, refresh в httpOnly cookie)

| Путь | Доступ | Лимит |
|---|---|---|
| POST `/auth/register` | Г | 5/мин |
| POST `/auth/login` | Г | 10/мин |
| POST `/auth/refresh` | Г (cookie + `X-Requested-With: fetch`) | 20/мин |
| POST `/auth/logout` | Г (cookie + `X-Requested-With: fetch`) | 10/мин |
| POST `/auth/logout-all` | П | общий |
| POST `/auth/change-password` | П | `auth` 10/мин |
| POST `/auth/email/confirm` (тело `{token}`) | Г | `auth-email-link` 10/мин |
| POST `/auth/email/resend` (тело `{email, locale?}`) | Г | `auth-email` 5/мин + 3 письма на адрес за 15 мин |
| POST `/auth/password/forgot` (тело `{email, locale?}`) | Г | `auth-email` 5/мин + 3 письма на адрес за 15 мин |
| POST `/auth/password/reset` (тело `{token, newPassword}`) | Г | `auth-email-link` 10/мин |
| GET `/auth/sessions`, DELETE `/auth/sessions/{id}` | П | общий (чужой id — 404) |
| DELETE `/auth/me` (тело `{password}`) | П | 10/мин |

### Подтверждение email и сброс пароля (Phase 21)

Четыре эндпоинта выше — без сессии и без cookie (ссылку открывают в любом браузере), поэтому **одни и те же** для сайта и приложения; CSRF-фильтр им не нужен, ответы `Cache-Control: no-store`.

- **Токен**: 32 байта из криптографического ГСЧ (base64url, 43 символа), в БД только SHA-256 (`EmailTokens.TokenHash`). Подтверждение — 24 ч, сброс — 30 мин. Одноразовый: погашение — один условный `UPDATE ... WHERE UsedAt IS NULL AND ExpiresAt > now`, из параллельных запросов успешен один. Новая выдача удаляет прежние неиспользованные токены того же назначения (работает только последнее письмо).
- **Ссылка** в письме: `{Seo:SiteUrl}/confirm-email#token=…` и `{Seo:SiteUrl}/reset-password#token=…`. Токен в **фрагменте** (`#`): он не попадает ни в логи Caddy/Railway, ни в `Referer`; страница сайта читает его, убирает из адреса и отправляет POST'ом. GET по ссылке ничего не меняет (сканеры писем не гасят токен).
- **`forgot` и `resend` отвечают всегда `200 {success: true}`** — для существующего, несуществующего, удалённого, уже подтверждённого адреса, при исчерпанном лимите на адрес и при сбое отправки. Время ответа выравнивается нижней границей 300 мс; письмо уходит через очередь в фоне, запрос не ждёт провайдера.
- `email/confirm`, `password/reset`: неверный, использованный и просроченный токен — один и тот же **400 `invalid_token`**. `password/reset` дополнительно: пароль совпадает с email — 400 `password_is_email`, пароль из утечек (если включён `Auth__BreachCheck`) — 400 `breached_password`; в обоих случаях токен не гасится. Политика пароля — как при регистрации.
- **Сброс пароля**: в одной транзакции гасится токен, меняется хеш и отзываются **все** сессии пользователя (веб и mobile); дальше вход заново. Заодно ставится `EmailConfirmedAt` (письмо дошло до ящика) и сбрасывается пауза после неверных паролей. Удаление аккаунта удаляет и его токены.
- `locale` (`ru`/`kk`/`en`, иное — `ru`) выбирает язык письма. `register` (веб и mobile) тоже принимает необязательный `locale` и отправляет письмо подтверждения; сбой отправки регистрацию не ломает. Заказ **не** блокируется до подтверждения, существующие пользователи не блокируются (`EmailConfirmedAt = NULL`).
- В ответах `login`/`register`/`refresh` (веб: `AuthResponseDto`, mobile: `MobileAuthResponseDto`) добавлено поле `emailConfirmed` — по нему сайт и приложение показывают мягкий баннер.

Мобильный контур `/auth/mobile/{register,login,refresh,logout}`: refresh в теле JSON, обязателен `deviceId`; лимиты те же, что у веб-аналогов.

Поведение сайта (`frontend/src/lib/api.ts`) при истёкшем или отозванном access-токене: один refresh на всех (`silentRefresh` при загрузке страницы и refresh после 401 делят один запрос `/auth/refresh`, в том числе при двойном запуске эффекта в StrictMode); после успешного refresh запрос повторяется один раз, без цикла. Выход из сессии (токен очищается, `user = null`) — только когда refresh ответил 401/403. Сеть, 429, 5xx и нечитаемый ответ refresh сессию **не** сбрасывают: запрос падает с ошибкой «не удалось подключиться к серверу», токен и маркер сессии сохраняются (так же, как `unavailable` в mobile).

Access-токен привязан к сессии (claim `sid`): после logout, `logout-all`, отзыва устройства или аккаунта любой защищённый запрос со старым access-токеном получает **401** сразу, не дожидаясь истечения 15 минут. Refresh-ротация сессию не прерывает: токен нового обмена живёт дальше, а access-токен, выданный до обмена, работает до своего истечения.

## Админка (роль Admin)

| Путь | Действия |
|---|---|
| `/admin/products` | POST, PUT `{id}`, DELETE `{id}`, POST `images` (загрузка фото: JPEG/PNG/WEBP/GIF до 5 МБ; файл **перекодируется** и всегда сохраняется как `/uploads/products/{guid}.webp`, качество 85, длинная сторона не более 2000 px без увеличения, метаданные EXIF не сохраняются, у GIF берётся первый кадр; сторона > 10000 px или > 40 млн пикселей, повреждённый файл и всё остальное — 400 с общим текстом ru/kk/en; обработка не дольше 5 с, не более 2 одновременно) |
| `/admin/categories` | POST, PUT, DELETE |
| `/admin/promo-banners` | GET, POST, PUT, DELETE |
| `/admin/diagnostics/client-ip` | GET: `{remoteIp, xForwardedForEntries, cfConnectingIpPresent, cloudflareTrusted, scheme}` — какой адрес клиента видит API (значения заголовков не отдаются, ответ `no-store`); общий лимит |
| `/admin/promo-codes` | GET, POST, PUT, DELETE |
| `/admin/orders` | GET (фильтры, даты в поясе магазина) |
| `/admin/orders/stats` | GET (карточки, см. `Money.md`; `ordersToday` — доставлено сегодня, `revenueToday`, `newToday` — оформлено сегодня без отменённых, `newOrdersCount`, `totalOrders`) |
| `/admin/orders/{id}/status` | PATCH (переходы — `StateMachines.md`) |
| `/admin/users/{userId}/revoke-sessions` | POST |
| `/admin/finance/*` | см. «Финансы» ниже |

### Финансы (только Admin, общий лимит; 401 без токена, 403 для покупателя)

Деньги — целые тенге, суммы положительные, знак определяет тип записи. Даты периодов — календарные дни магазина (`yyyy-MM-dd`, пояс `Store:TimeZone`). Правила — `Money.md`, раздел «Финансы».

| Метод и путь | Параметры | Ответ (`data`) |
|---|---|---|
| GET `/admin/finance/summary` | `period` = `today` \| `week` \| `month` \| `custom` (по умолчанию `month`); для `custom` обязательны `dateFrom`, `dateTo` (`dateFrom ≤ dateTo`, не больше 366 дней) | `period`, `dateFrom`, `dateTo`, `income`, `reversals`, `expenses`, `balance`, `incomeCount`, `expenseCount`, `storeTimeZone` |
| GET `/admin/finance/chart` | — | `storeTimeZone`, `months[12]` от старого к новому, текущий последний: `month` (`yyyy-MM`), `income`, `reversals`, `expenses`, `balance` |
| GET `/admin/finance/journal` | `kind` (`Income` \| `Reversal` \| `Expense`), `dateFrom`, `dateTo`, `includeDeleted` (по умолчанию `false`), `page` (≥1), `pageSize` (1–100, по умолчанию 20) | `PagedResult` записей: `kind`, `id`, `date` (UTC), `amount`, `orderId` (для платежей), `category`, `comment`, `author` (для расходов), `isDeleted`, `deletedAt`; новые сверху. Удалённые расходы видны только при `includeDeleted=true` |
| POST `/admin/finance/expenses` | тело: `category` (`Purchase` \| `Delivery` \| `Other`), `amount` (целое > 0, ≤ 1 000 000 000), `date` (`yyyy-MM-dd`, не в будущем), `comment` (≤ 500, необязателен); автор — из токена | созданная запись журнала |
| DELETE `/admin/finance/expenses/{id}` | — | мягкое удаление расхода: запись журнала с `isDeleted = true`. Повтор — тот же ответ 200, `deletedAt` не перезаписывается; нет такого id — 404 |
| GET `/admin/finance/export` | `dateFrom`, `dateTo` (по умолчанию — текущий месяц; те же ограничения) | файл `.xlsx` (листы «Журнал», «Итоги»), не более 20 000 строк, иначе 400 |

Удалённые расходы не входят в `summary`, `chart` и `export`. Расход нельзя редактировать (удалить и внести заново).

Платежи (`Income`, `Reversal`) через API не создаются и не меняются: их порождает только смена статуса заказа (`StateMachines.md`).

## Коды ошибок

| HTTP | `code` | Когда |
|---|---|---|
| 400 | — | валидация (в т.ч. сумма расхода, период финансов), неверный формат `Idempotency-Key`, недопустимый переход статуса, промокод не подошёл, неверный пароль при удалении аккаунта |
| 401 | — | нет или просрочен access-токен |
| 403 | — | не Admin на `/admin/*`; нет заголовка `X-Requested-With` / чужой Origin на cookie-эндпоинтах; удаление аккаунта админа |
| 404 | — | нет ресурса (чужая сессия — тоже 404) |
| 400 | `invalid_token` | ссылка из письма неверна, уже использована или просрочена (`email/confirm`, `password/reset`) |
| 400 | `password_is_email` | новый пароль совпадает с email (`password/reset`) |
| 400 | `breached_password` | пароль известен по утечкам (регистрация, `password/reset`; только при `Auth__BreachCheck=true`) |
| 409 | `out_of_stock` | не хватает остатка; `meta`: productId, productName, available |
| 409 | `size_unavailable` | размера нет среди доступных; `meta`: productId, productName, size |
| 409 | `conflict` | гонка смены статуса, проигравший запрос |
| 409 | `active_orders` | удаление аккаунта при активном заказе (Created/Processing/Shipped) |
| 422 | `idempotency_mismatch` | тот же `Idempotency-Key` с другим телом |
| 429 | — | превышен лимит |
| 400 | — | Host не из `AllowedHosts` |
| 500 | — | `ExceptionHandlingMiddleware`, клиенту общее сообщение |

Регистрация на занятый e-mail возвращает ошибку конфликта; точную форму ответа смотрите в `AuthController`.

## Заголовки ответа

`Idempotent-Replayed: true` при повторе заказа; ответы `auth` — `Cache-Control: no-store`; nosniff, X-Frame-Options, CSP, Referrer-Policy, HSTS.
