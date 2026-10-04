# API

Источник: `backend/Api/Controllers/`, `RateLimiting/`, `CLAUDE.md`. Префикс: `/api/v1`. Ответы обёрнуты в `ApiResponse<T>` (`success`, `data`, `errors`, при ошибке с кодом — `code`, `meta`).
Прод: `https://api.familyshop10.kz`. Старый адрес Railway работает параллельно.

Доступ: Г = гость, П = покупатель (нужен токен), А = только Admin.

## Публичные и пользовательские

| Метод и путь | Доступ | Лимит | Примечание |
|---|---|---|---|
| GET `/products` | Г | общий | фильтры, пагинация, сортировка |
| GET `/products/{id}` | Г | общий | |
| GET `/categories` | Г | общий | |
| GET `/promo-banners/active` | Г | общий | |
| GET `/products/{productId}/reviews`, `/summary` | Г | общий | |
| GET `/products/{productId}/reviews/mine` | П | общий | |
| POST `/products/{productId}/reviews` | П | 5/мин | второй отзыв на товар — отказ |
| DELETE `/products/{productId}/reviews` | П | общий | свой отзыв |
| POST `/promo-codes/validate` | Г | 15/мин | предпросмотр скидки |
| POST `/orders` | П | 10/мин | заголовок `Idempotency-Key` |
| GET `/orders` | П | общий | свои заказы |

## Авторизация (веб, refresh в httpOnly cookie)

| Путь | Доступ | Лимит |
|---|---|---|
| POST `/auth/register` | Г | 5/мин |
| POST `/auth/login` | Г | 10/мин |
| POST `/auth/refresh` | Г (cookie + `X-Requested-With: fetch`) | 20/мин |
| POST `/auth/logout` | Г (cookie + `X-Requested-With: fetch`) | 10/мин |
| POST `/auth/logout-all` | П | общий |
| GET `/auth/sessions`, DELETE `/auth/sessions/{id}` | П | общий (чужой id — 404) |
| DELETE `/auth/me` (тело `{password}`) | П | 10/мин |

Мобильный контур `/auth/mobile/{register,login,refresh,logout}`: refresh в теле JSON, обязателен `deviceId`; лимиты те же, что у веб-аналогов.

Поведение сайта (`frontend/src/lib/api.ts`) при истёкшем или отозванном access-токене: один refresh на всех (`silentRefresh` при загрузке страницы и refresh после 401 делят один запрос `/auth/refresh`, в том числе при двойном запуске эффекта в StrictMode); после успешного refresh запрос повторяется один раз, без цикла. Выход из сессии (токен очищается, `user = null`) — только когда refresh ответил 401/403. Сеть, 429, 5xx и нечитаемый ответ refresh сессию **не** сбрасывают: запрос падает с ошибкой «не удалось подключиться к серверу», токен и маркер сессии сохраняются (так же, как `unavailable` в mobile).

Access-токен привязан к сессии (claim `sid`): после logout, `logout-all`, отзыва устройства или аккаунта любой защищённый запрос со старым access-токеном получает **401** сразу, не дожидаясь истечения 15 минут. Refresh-ротация сессию не прерывает: токен нового обмена живёт дальше, а access-токен, выданный до обмена, работает до своего истечения.

## Админка (роль Admin)

| Путь | Действия |
|---|---|
| `/admin/products` | POST, PUT `{id}`, DELETE `{id}`, POST `images` (загрузка фото) |
| `/admin/categories` | POST, PUT, DELETE |
| `/admin/promo-banners` | GET, POST, PUT, DELETE |
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
| 409 | `out_of_stock` | не хватает остатка; `meta`: productId, productName, available |
| 409 | `size_unavailable` | размера нет среди доступных; `meta`: productId, productName, size |
| 409 | `conflict` | гонка смены статуса, проигравший запрос |
| 409 | `active_orders` | удаление аккаунта при активном заказе (Created/Processing/Shipped) |
| 422 | `idempotency_mismatch` | тот же `Idempotency-Key` с другим телом |
| 429 | — | превышен лимит |
| 400 | — | Host не из `AllowedHosts` |
| 500 | — | `ExceptionHandlingMiddleware`, клиенту общее сообщение |

TODO: уточнить: точная форма 400 для регистрации на занятый e-mail (по `TODO.md` — 409).

## Заголовки ответа

`Idempotent-Replayed: true` при повторе заказа; ответы `auth` — `Cache-Control: no-store`; nosniff, X-Frame-Options, CSP, Referrer-Policy, HSTS.
