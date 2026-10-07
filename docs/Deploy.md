# Деплой

Источник: `CLAUDE.md` (1, 3.3, 3.4), `backend/Dockerfile`, `backend/Api/appsettings*.json`, `.github/workflows/`, `TODO.md`. Значений секретов здесь нет и быть не должно.

## Сервисы (Railway)

| Сервис | Что | Адреса |
|---|---|---|
| Frontend | Vite-сборка (React) | прод `https://www.familyshop10.kz`; корень `familyshop10.kz` редиректится на www у регистратора; старый `endearing-consideration-production-6e0c.up.railway.app` |
| Backend | ASP.NET Core, Docker (`backend/Dockerfile`, Root Directory `/backend`, порт из `PORT`, по умолчанию 8080) | прод `https://api.familyshop10.kz`; старый `familyshop-production.up.railway.app` |
| PostgreSQL | база | внутренняя строка подключения |
| Volume | на сервисе backend, mount path `/data` | фото товаров |

Автодеплой при пуше в `main`. Старые адреса Railway уберут по команде заказчика.

## Переменные окружения (только имена)

Backend:
- `ConnectionStrings__DefaultConnection` — строка подключения.
- `Jwt__SecretKey` — ≥32 байт, без `CHANGE_ME`, иначе API не стартует вне Development.
- `Seed__AdminPassword` (читается и `SEED_ADMIN_PASSWORD`) — пароль админа сидера.
- `Store__TimeZone` — по умолчанию `Asia/Almaty`.
- `AllowedHosts` — хосты через `;`; по умолчанию в `appsettings.Production.json`: `api.familyshop10.kz;familyshop-production.up.railway.app`. Новый адрес API (staging, домен) вписать сюда; запрос с другим Host получает 400.
- `Cors__AllowedOrigins` (строка через запятую/пробел) и/или `Cors__AllowedOriginsList`; складывается с массивом в `appsettings.Production.json`. Некорректный origin — ошибка запуска.
- `Auth__RefreshCookieDomain` — по умолчанию `.familyshop10.kz` в `appsettings.Production.json`.
- `Uploads__Path` — `/data/uploads` (при подключённом Volume).
- `Uploads__PublicBaseUrl` — `https://api.familyshop10.kz`.
- `ForwardedHeaders__KnownNetworks__0` — необязательно, CIDR прокси Railway (см. `TODO.md`, п. 3).
- `Pexels__ApiKey` — только в user-secrets при работе с фото, в прод не нужен.

Frontend (на этапе сборки): `VITE_API_URL` (запасное `VITE_API_BASE_URL`), `VITE_SITE_URL` (**обязательна**: `https://www.familyshop10.kz` без завершающего `/`; production-сборка без неё или с заглушкой `familyshop.example` падает с понятной ошибкой, поэтому задать на Railway до пуша), `VITE_CONTACT_*`, `VITE_SOCIAL_*` (пустая = блок контактов скрыт).
Mobile: `EXPO_PUBLIC_API_URL` (по умолчанию `https://api.familyshop10.kz/api/v1`).

## Порядок выкатки

1. Локально: `dotnet build`, `dotnet test`, `npm run test`, `tsc` — без ошибок (`CLAUDE.md`, раздел «Тестирование перед пушем»).
2. Если есть миграция — бэкап БД (см. ниже).
3. Явная команда владельца «go» на пуш. Пуш в `main` запускает автодеплой.
4. Миграции применяются при старте backend. Проверить логи запуска.
5. Если нужны новые переменные — добавить в Railway **до** пуша.
6. После деплоя: открыть `https://www.familyshop10.kz`, войти, оформить тестовый заказ, проверить `/admin/orders`.

## Откат

- Код: в Railway Deployments выбрать предыдущий успешный деплой и Redeploy (или `git revert` + пуш с разрешения владельца).
- База: миграции аддитивные, поэтому откат кода без отката схемы безопасен (новые столбцы/таблицы старый код не использует). Откат схемы вручную, только из бэкапа.
- TODO: уточнить: проверенный порядок отката на Railway (в репозитории не описан).

## Бэкапы

- TODO: уточнить: настроены ли автоматические бэкапы PostgreSQL на Railway (в репозитории не описано).
- Перед миграцией: `pg_dump` (формат custom) прод-базы владельцем, файл хранить вне репозитория.
- Фото товаров лежат в Volume `/data/uploads`; без Volume пропадают при каждом деплое, потерянные не восстановить.

## CI

`.github/workflows/tests.yml` — backend `dotnet test` и frontend `npm run test` на каждый push в `main` и PR. `security-audit.yml` — `npm audit --audit-level=high` (frontend) и поиск уязвимых пакетов dotnet (backend), на push, PR и раз в неделю по понедельникам.

## Открытые инфраструктурные вопросы

Проверить на Railway: подмена `X-Forwarded-For` и лимиты (`TODO.md`, п. 3); заголовки безопасности на хосте фронтенда; редирект корня `familyshop10.kz` на `www`.
