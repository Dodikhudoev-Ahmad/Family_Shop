# Отчёт: Фаза 14, шаг 4 — модуль «Финансы» [FULL]

Дата: 2026-10-04.

## 1. Итог

Добавлен журнал денег магазина: приход создаётся один раз при переходе заказа в «Доставлен», расходы вносятся вручную, баланс = приход − сторно − расходы. В админке есть страница «Финансы» (итоги за сегодня/неделю/месяц/период, график 12 месяцев, журнал, форма расхода, выгрузка Excel). Карточки «Заказов сегодня» и «Выручка сегодня» теперь считаются по платежам. Mobile не менялся.

## 2. Причина или цель

Пункт 4 из `PROGRESS.md`; решения владельца переданы в задаче (Income/Reversal, уникальный индекс `(OrderId, Type)`, ручные расходы, только Admin, роли «Бухгалтер» нет, целые тенге, `StoreClock`). Порядок соблюдён: docs → тесты → код → отчёт.

## 3. Что изменено

- Docs (первым коммитом): [docs/Money.md](../Money.md) (раздел «Финансы», карточки статистики), [docs/Database.md](../Database.md), [docs/Api.md](../Api.md), [docs/StateMachines.md](../StateMachines.md), [docs/Roles.md](../Roles.md).
- Домен и БД: [Payment.cs](../../backend/Domain/Entities/Payment.cs), [Expense.cs](../../backend/Domain/Entities/Expense.cs), [PaymentConfiguration.cs](../../backend/Infrastructure/Persistence/Configurations/PaymentConfiguration.cs) (уникальный индекс, `CHECK Amount > 0`, FK Restrict), репозитории [PaymentRepository.cs](../../backend/Infrastructure/Persistence/Repositories/PaymentRepository.cs) (`INSERT ... ON CONFLICT DO NOTHING`; сторно — одним `INSERT ... SELECT` из `Income`) и [FinanceRepository.cs](../../backend/Infrastructure/Persistence/Repositories/FinanceRepository.cs) (суммы, объединённый журнал `UNION ALL`).
- Миграция `AddFinance` ([Migrations/*_AddFinance.cs](../../backend/Infrastructure/Persistence/Migrations/)): `CREATE ... IF NOT EXISTS`, затем бэкфилл [PaymentBackfill.cs](../../backend/Infrastructure/Persistence/PaymentBackfill.cs). Таблицы Orders/OrderItems/Reviews не затрагиваются.
- Логика: [OrderLedger.cs](../../backend/Application/Services/OrderLedger.cs) (вызывается из транзакции смены статуса в [OrderService.cs](../../backend/Application/Services/OrderService.cs)), [FinanceService.cs](../../backend/Application/Services/FinanceService.cs), [FinanceValidators.cs](../../backend/Application/Validators/FinanceValidators.cs), [FinanceMoney.cs](../../backend/Application/Common/FinanceMoney.cs), `StoreClock` — без изменений, используется.
- API: [AdminFinanceController.cs](../../backend/Api/Controllers/AdminFinanceController.cs) — `summary`, `chart`, `journal`, `expenses` (POST), `export`; `[Authorize(Roles = "Admin")]`.
- Excel: [FinanceExcelWriter.cs](../../backend/Infrastructure/Export/FinanceExcelWriter.cs) (пакет ClosedXML 0.104.2; текст людей — строка с quote-prefix, не формула).
- Карточки «сегодня»: [OrderRepository.cs](../../backend/Infrastructure/Persistence/Repositories/OrderRepository.cs) `GetStatsAsync` читает `Payments`.
- Сайт: [AdminFinancePage.tsx](../../frontend/src/pages/admin/AdminFinancePage.tsx) + css, [api.ts](../../frontend/src/lib/api.ts) (раздел Finance), [financeRules.ts](../../frontend/src/utils/financeRules.ts), [storeTime.ts](../../frontend/src/utils/storeTime.ts), маршрут `/admin/finance` в [App.tsx](../../frontend/src/App.tsx), пункт меню в [AdminLayout.tsx](../../frontend/src/components/AdminLayout/AdminLayout.tsx).
- [PROGRESS.md](../../PROGRESS.md), [CLAUDE.md](../../CLAUDE.md) (Current Status и описание модуля).

## 4. Тесты

- `dotnet build`: 0 ошибок, 0 предупреждений. `dotnet test`: **503 passed**, 0 failed, 0 skipped (было 411; +92). Postgres на 5433 был доступен, интеграционные тесты выполнялись на временных БД `familyshop_test_*`.
- Что покрыто на Postgres: идемпотентность бэкфилла (повтор, новый доставленный заказ, округление .5, нулевой заказ, отмена/открытые заказы без платежей, заказы не меняются), повторный запуск миграции, уникальный индекс (второй Income и второе сторно — `23505`), `CHECK` (`23514`), FK Restrict (`23503`), нет двойного Income при 12 параллельных запросах «Доставлен», отмена до доставки без платежей, границы часового пояса (00:00 / 23:59:59.999 местных суток, неделя с понедельника, месяц, график по местному месяцу), журнал (виды, даты, пагинация без пропусков и повторов).
- 401/403/400 на реальном контроллере с настоящим middleware авторизации: 401 без токена, 403 для покупателя, 200 для Admin по всем 5 эндпоинтам; автор расхода берётся из токена; плохие периоды, `pageSize`, суммы, даты, категории — 400.
- `vitest`: **238 passed** в 34 файлах (было 182 в 31). `tsc -b` и `tsc --noEmit` (mobile): чисто. `jest`: 271 passed, 4 skipped, 1 набор пропущен (без изменений). `bash .githooks/test-pre-commit.sh`: 12/12.
- Живая проверка на реальном API (отдельная БД `familyshop_live_check` на локальном Postgres, после проверки удалена; `familyshop` не трогалась): 401/403 на всех эндпоинтах; доставка — приход, повторная «Доставлен» — без второго прихода; отмена из `Shipped` — без платежей; `Delivered → Cancelled` — 400; расходы и их плохие варианты; итоги за день/неделю/месяц; график; журнал; карточки статистики; выгрузка Excel прочитана openpyxl (формула из комментария хранится строкой с quote-prefix, время — по Алматы).
- Визуально (headless Chromium из `playwright-core`, обе темы × 320/375/390/430/1280): горизонтального overflow нет, элементы ≥ 44 px, модалка расхода проверена. Найдены и исправлены: переполнение карточек журнала на 320 px (4 px), кнопки пагинации 34 px, график начинался не с текущего месяца.

## 5. Коммиты

- `e4ea78d` Phase 14 Step 4 [QA]: docs модуля «Финансы»
- `514beff` Phase 14 Step 4 [BE]: таблицы Payments и Expenses, миграция AddFinance, бэкфилл
- `d7f34d6` Phase 14 Step 4 [BE]: Income при доставке, OrderLedger, карточки «сегодня» из Payments
- `000f0e8` Phase 14 Step 4 [BE]: FinanceService и /admin/finance
- `addbe21` Phase 14 Step 4 [BE]: экспорт в Excel
- `e51a088` Phase 14 Step 4 [FE]: страница «Финансы»
- `46df539` Phase 14 Step 4 [QA]: PROGRESS.md и Current Status

Тесты коммитились вместе с кодом своего слоя (тест без кода был бы красным коммитом, а правило — каждый коммит зелёный). Не запушено.

## 6. Ограничения и что заметил, но не менял

1. **Сторно пока не возникает.** `Delivered` по `docs/StateMachines.md` финальный, `Delivered → Cancelled` запрещён (побеждают `docs/`). Логика сторно написана и проверена напрямую (`OrderLedger`, `TryAddReversalAsync`), включится вместе с разрешением перехода. Тогда же нужно решить, возвращается ли остаток на склад: сейчас код вернул бы его на любой переход в `Cancelled`.
2. **Смысл карточки «Заказов сегодня» изменился:** это заказы, доставленные сегодня, а не оформленные. Подпись на сайте не менял. Предлагаю переименовать (например, «Доставлено сегодня») отдельным шагом [FE] с ru/kk/en.
3. **Бэкфилл:** у заказа нет времени доставки, дата прихода старых заказов = дата оформления, их выручка попадёт в месяц оформления. Заказ с итогом, округлённым до 0 (промокод 100 %), прихода не получает.
4. **Расходы нельзя править и удалять** (в решении не сказано). Ошибочный расход исправить нельзя. Нужно решение: сторно расходов или удаление админом.
5. Дата расхода не может быть в будущем (моё решение), период запросов — не более 366 дней, выгрузка — не более 20 000 строк.
6. **Окно деплоя:** если старая версия API успеет перевести заказ в «Доставлен» после миграции, но до выкладки нового кода, у него не будет прихода. Исправляется повторным запуском бэкфилла (SQL в `PaymentBackfill.Sql`, идемпотентный).
7. Mobile: админских экранов в нём нет, не менялся. TODO: уточнить, нужен ли просмотр финансов в приложении.
8. Страница «Финансы» только на русском, как остальная админка. `oxlint` выдаёт для неё те же предупреждения `set-state-in-effect`, что и для существующих страниц (38 в целом по проекту).
9. Ошибка по ходу: команда `dotnet ef migrations remove` удалила файлы миграции `AddIdempotencyKeys` (вместо пустой `AddFinance`); восстановил из git до коммита, в истории изменений этой миграции нет.
10. Chrome-инструменты пользователь отклонил; проверку сделал отдельным headless Chromium, чужие вкладки и прод не затрагивались. `playwright-core` поставлен в scratchpad, не в репозиторий.

## 7. Что проверить на проде после деплоя

0. **До пуша — `pg_dump` прода** (миграция добавляет две таблицы и пишет строки в `Payments`). Откат: код откатывается безопасно, схема остаётся; откат схемы — только из бэкапа.
1. Миграция `AddFinance` применилась; `SELECT count(*) FROM "Payments"` равно числу заказов в `Delivered` с ненулевой суммой (на проде это, в частности, FS-1/FS-2, если они доставлены).
2. `/admin/finance`: итоги за месяц совпадают с суммой доставленных заказов; баланс = приход − сторно − расходы.
3. Перевести тестовый заказ в «Доставлен» — появляется один приход; повтор — без второго.
4. Добавить и (позже) учесть пробный расход; скачать Excel и открыть в Excel/Numbers.
5. Карточки на `/admin/orders`: «Выручка сегодня» равна приходам за сегодня по времени Алматы.
6. Гость и покупатель получают 401/403 на `/admin/finance/*`.

## 8. Нужны ли переменные в Railway

Нет. Новых переменных нет; используется существующая `Store__TimeZone` (по умолчанию `Asia/Almaty`).
