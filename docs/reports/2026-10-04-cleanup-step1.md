# Отчёт: Phase 14 Step 1 — чистка [BE] (2026-10-04)

## Итог
Убраны 4 предупреждения сборки, `claude.md` переименован в `CLAUDE.md`, ТЗ перенесены в `docs/`. Сборка: 0 ошибок, 0 предупреждений, все тесты зелёные. Не запушено.

## Цель
Выполнить п.1 приоритетов (`PROGRESS.md`) и снять блокер правила «0 предупреждений».

## Что изменено
- `backend/Infrastructure/Security/JwtSettingsValidator.cs:25` — `SecretKey!` (null отсеивается проверкой длины выше, поведение прежнее).
- `backend/Application.Tests/Storage/UploadsServingTests.cs` — вместо устаревших `WebHostBuilder`/`TestServer` локальный `WebApplication` (как в `ForwardedHeadersTests`), `AllowedHosts=*`.
- `backend/Application.Tests/Services/SeedShoesAndBagsTests.cs:90` — `Assert.DoesNotContain`.
- `claude.md` → `CLAUDE.md` (через `CLAUDE.tmp`), ссылки в README, PROGRESS, docs, `.claude/commands/`. Исторический отчёт `2026-10-04-process-setup.md` не правился.
- `TZ_Family_Shop.md`, `TZ_Family_Shop_v2.md` → `docs/`, ссылки в `DRIFT.md` и `/audit`.

## Тесты
dotnet test 402 passed; vitest 177 passed; jest 271 passed, 4 skipped; tsc (frontend, mobile) чисто; build 0 предупреждений.

## Коммиты
См. `git log --oneline -9`.

## Ограничения и что заметил
- **Мой промах:** коммит `f6af3de` (UploadsServingTests) попал в историю с 2 красными тестами (Host-фильтр, 400); исправлен следующим коммитом. Причина: цепочка `&&` с `tail` не остановилась на падении. История не переписывалась (не запушено); если нужна чистая история — скажи, сделаю squash этих двух коммитов.
- Новое правило имени: `CLAUDE.md` в верхнем регистре; на macOS регистр нечувствителен, на Linux (CI) важен — ссылки теперь совпадают.

## Что проверить на проде
Ничего: меняются только тесты, документы и один оператор `!` без смены поведения.

## Переменные в Railway
Нет.
