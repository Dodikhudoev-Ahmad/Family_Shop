# Family Shop

Интернет-магазин для Казахстана/СНГ. Сайт: React + TypeScript + Vite (`frontend/`), API: ASP.NET Core + PostgreSQL (`backend/`), приложение: Expo (`mobile/`).

Правила проекта: `claude.md`. Спецификация: `docs/`. Что сделано и что дальше: `PROGRESS.md`.

## Проверки перед коммитом

```
cd backend && dotnet build FamilyShop.slnx && dotnet test FamilyShop.slnx --no-build
cd frontend && npx tsc -b && npm run test
cd mobile && npx tsc --noEmit && npx jest
```

## Защита от утечки секретов (один раз после клонирования)

Включи хук, который блокирует коммит с паролями, ключами, строками подключения и приватными ключами:

```
git config core.hooksPath .githooks
```

Проверить, что включён: `git config core.hooksPath` должен вывести `.githooks`. Хук лежит в `.githooks/pre-commit`. Явные плейсхолдеры (`CHANGE_ME`, `example`) он пропускает.
Секреты хранятся только в user-secrets (локально) и переменных окружения Railway (прод).

## Команды Claude Code (`.claude/commands/`)

`/start` — начало сессии, `/done` — закрыть шаг, `/report` — отчёт, `/review` — самопроверка диффа, `/new-endpoint`, `/new-feature`, `/migration`, `/audit`, `/phase-done`.
