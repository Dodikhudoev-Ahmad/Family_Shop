# Фаза 4. Аудит безопасности [BE]

Ретро-отчёт, восстановлен по `git log` и `CLAUDE.md`. Даты: 2026-10-01. Диапазон коммитов: `6a6f830..ab6b27d` (6 коммитов) и `9900997` (документация), `c46a4be` (лимиты).
Предложенный тег: `v0.4-security` на `ab6b27d`.

## Что построено

- Ключ JWT проверяется при старте (≥32 байт, без `CHANGE_ME` вне Development), алгоритм HS256 закреплён; все эндпоинты закрыты по умолчанию (`FallbackPolicy`) — `6a6f830`.
- Семейства refresh-токенов с ротацией, мобильный контур с привязкой к устройству, список и отзыв сессий, CSRF-защита cookie-эндпоинтов — `a48b38d`.
- Фронтенд шлёт `X-Requested-With` на refresh/logout — `d4396c7`.
- Валидаторы фильтров списков реально выполняются, лимиты ввода заказа, демо-аккаунты без известного пароля — `f46909c`.
- Пароль админа сидера из `Seed__AdminPassword`, вне Development без пароля админ не создаётся — `532c4d8`.
- Запрет ссылок `//host`, `javascript:`, `data:` в админке, не больше 10 картинок у товара — `ab6b27d`.
- Управление сессиями вынесено из строгого лимита входа — `c46a4be`.
- Задачи на будущее записаны в `TODO.md` — `3e4765b`.

## Ключевые файлы

- `backend/Infrastructure/Security/JwtSettingsValidator.cs`
- `backend/Api/Filters/CookieCsrfFilter.cs`
- `backend/Api/Security/ActiveAccountTokenValidator.cs` (добавлен позже, в фазе 6)
- `backend/Application/Services/AuthService.cs`
- `backend/Api/Controllers/AuthController.cs`, `MobileAuthController.cs`
- `backend/Application.Tests/Security/EndpointAuthorizationTests.cs`

## Миграции

`20261001130122_HardenRefreshTokens` — поля семейств токенов (не идемпотентная по `IF EXISTS`, стандартная EF; TODO: уточнить безопасность повторного применения).

## Архитектурные решения

- Тип клиента определяет маршрут и сохранённый тип токена, а не заголовок.
- Refresh-токен хранится только как SHA-256; повтор обменянного токена спустя 10 с отзывает всю семью.
- Веб: refresh только в httpOnly cookie; мобильный: в теле JSON с device binding.
- `[AllowAnonymous]` только на действиях.

## Известные ограничения

- Access-токен живёт до 15 минут после отзыва сессии (`TODO.md`, п. 2).
- Проверка `X-Forwarded-For` на Railway — на платформе (`TODO.md`, п. 3).
- Нет смены/сброса пароля, лимита попыток на аккаунт, перекодирования загруженных изображений.
