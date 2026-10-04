# Фазы 7–8. Склад, остаток и размеры [FULL]

Ретро-отчёт, восстановлен по `git log`, `claude.md` (3.2, раздел 4) и `TODO.md`. Даты: 2026-10-02 … 2026-10-03. Тесты на реальном Postgres.
Предложенные теги: `v0.7-stock` на `32ea083`, `v0.8-sizes` на `0ec988e`. TODO: уточнить границы по хешам.

## Что построено

Остаток (2026-10-02):
- Атомарное списание `UPDATE ... WHERE Stock >= q` в одной транзакции с заказом и промокодом, возврат при отмене ровно один раз, 409 при нехватке — `c7cc686`.
- Тесты на реальном Postgres: 20 параллельных заказов на остаток 3, дедлоки, два размера, откат, двойная отмена — `a93324e`.
- Ответ 409 несёт `code` и `meta` — `cdb217b`; сайт и mobile показывают сообщение с названием и остатком — `909b134`, `32ea083`.
- Документация: `3041412`.

Размеры (2026-10-02 … 2026-10-03):
- `Product.AvailableSizes` (NULL = вся сетка типа), сетки по типу, валидация, 409 `size_unavailable` — `c2f7378`.
- На странице товара весь ряд размеров, недоступные приглушены — `54805d2` (сайт), `19720dc` (mobile).
- Страница товара запрашивает товар по id, если его нет в каталоге — `a81eb21`, `0ec988e`.

Связанное, раньше (2026-09-27 … 2026-09-30): корзина `productId+size`, агрегированный лимит по товару, детская обувная сетка 26–35, перенос «Обувь и сумки» в категории по полу (`0198130`).

## Ключевые файлы

- `backend/Application/Services/OrderService.cs`, `ProductSizeRules.cs`
- `backend/Domain/Entities/SizeGrids.cs`, `Product.cs`
- `backend/Infrastructure/Persistence/Repositories/` (`TryDecrementStockAsync`, `TryChangeStatusAsync`, `IncrementStockAsync`)
- `backend/Application.Tests/Integration/OrderStockConcurrencyTests.cs`, `SeedSizesTests.cs`

## Миграции

- `AddProductAvailableSizes` — идемпотентная (`ADD COLUMN IF NOT EXISTS`).
- `MoveShoesBagsToGenderCategories` (2026-09-30) — UPDATE по CategoryId.

## Архитектурные решения

- Один остаток на товар (общий по размерам).
- Списание по возрастанию `ProductId` (нет взаимных дедлоков).
- Смена статуса — compare-and-set; отмена возвращает остаток только победившему запросу.
- `ExecuteUpdate` не трогает change tracker: `Stock` загруженного `Product` в памяти устаревает и не используется.

## Известные ограничения

- Остаток по размерам не реализован (`PROGRESS.md`).
- QuickView не показывает полный ряд размеров (`PROGRESS.md`).
