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

## Админка (роль Admin)

| Путь | Действия |
|---|---|
| `/admin/products` | POST, PUT `{id}`, DELETE `{id}`, POST `images` (загрузка фото) |
| `/admin/categories` | POST, PUT, DELETE |
| `/admin/promo-banners` | GET, POST, PUT, DELETE |
| `/admin/promo-codes` | GET, POST, PUT, DELETE |
| `/admin/orders` | GET (фильтры, даты в поясе магазина) |
| `/admin/orders/stats` | GET (карточки, см. `Money.md`) |
| `/admin/orders/{id}/status` | PATCH (переходы — `StateMachines.md`) |
| `/admin/users/{userId}/revoke-sessions` | POST |

## Коды ошибок

| HTTP | `code` | Когда |
|---|---|---|
| 400 | — | валидация, неверный формат `Idempotency-Key`, недопустимый переход статуса, промокод не подошёл, неверный пароль при удалении аккаунта |
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
