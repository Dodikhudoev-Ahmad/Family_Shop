# Отчёт: внедрение процесса разработки (2026-10-04)

## Итог
Добавлены `docs/` (обратная спецификация), `PROGRESS.md`, правила в `claude.md`, 9 slash-команд, ретро-summary четырёх фаз и pre-commit хук против утечек секретов. Код приложения не менялся, прод не трогали, ничего не запушено.

## Цель
Spec-first процесс: источник правды — `docs/`, шаги закрываются командами `/done` и `/report`.

## Что изменено
- Новые: `docs/Roles.md`, `StateMachines.md`, `Money.md`, `Database.md`, `Api.md`, `Deploy.md`, `DRIFT.md`; `PROGRESS.md`; `README.md`; `.githooks/pre-commit`; `.claude/commands/*.md`; `docs/phase-summaries/Phase{4,5,7-8,12}-summary.md`.
- Изменены: `claude.md` (приоритет docs/, Current Status, ALWAYS/NEVER, стиль, ритуал), `.gitignore` (`.claude/commands/` теперь в git).

## Тесты (на 2026-10-04, до изменений процесса; код не менялся)
- `dotnet build`: 0 ошибок, **4 предупреждения** (блокер по новому правилу).
- `dotnet test`: 402 passed.
- `vitest`: 177 passed (30 файлов).
- `jest`: 271 passed, 4 skipped.
- `tsc` frontend и mobile: чисто.
- Хук проверен на тестовом репозитории: блокирует Password=, postgresql:// с паролем, PEM, длинную строку; пропускает CHANGE_ME и обычный код.

## Коммиты
См. `git log --oneline -14` (45fbec6 … a109506 + коммит этого отчёта).

## Ограничения и что заметил, но не менял
- 4 предупреждения сборки (`JwtSettingsValidator.cs:25` CS8602; `UploadsServingTests.cs` ASPDEPR004/008; `SeedShoesAndBagsTests.cs:90` xUnit2029).
- `TZ_Family_Shop_v2.md` лежит в корне, а не в `docs/`; сверка шла с ним.
- Файл правил называется `claude.md` (строчными), как в git.
- Хук включается вручную: `git config core.hooksPath .githooks`; сейчас в этом клоне не включён.
- Поиск секретов: в HEAD и истории реальных секретов не найдено (только плейсхолдеры и `.env.example`).
- Правило «0 предупреждений» и новый ритуал конфликтуют с исходной строкой «не задавай вопросов по пунктам»; разрешено в разделе 14 (спрашивать только там, где пункты не покрывают).

## Что проверить на проде
Ничего: прод не менялся.

## Переменные в Railway
Нет.
