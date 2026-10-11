# База данных

Источник: `backend/Domain/Entities/`, `backend/Infrastructure/Persistence/Configurations/`, `Migrations/`. СУБД: PostgreSQL (локально порт 5433, Homebrew postgresql@16).

## Сущности (таблицы)

| Таблица | Поля (основные) |
|---|---|
| Users | Id, Email (уникальный, ≤256), PasswordHash, Name, Role (Customer/Admin), DeletedAt, **EmailConfirmedAt** (UTC, NULL = не подтверждён; существующие пользователи остаются NULL и ничем не блокируются) |
| Categories | Id, Name, Slug (уникальный, ≤100), ParentCategoryId, HasSizes, SortOrder (int, по умолчанию 0; порядок показа, женское 10 … аксессуары 80, шаг 10) |
| Products | Id, Name, Description, Price, DiscountPrice, Stock, CategoryId, Gender, Images (список), CreatedAt, **UpdatedAt** (UTC, NOT NULL, DEFAULT now(); обновляется при правке товара админом, нужен для `lastmod` в sitemap), IsBestseller, ProductType (≤50), AvailableSizes (`text[]`, NULL = вся сетка типа), AverageRating decimal(3,2), ReviewCount |
| Orders | Id, UserId, Status, TotalPrice, DiscountAmount, CreatedAt (UTC), ContactName (≤200), ContactPhone (≤32), DeliveryMethod (Courier/Pickup), City (≤200), Address (≤500), PromoCodeId |
| OrderItems | Id, OrderId, ProductId, Quantity, Price (цена на момент заказа), Size (≤16) |
| Reviews | Id, ProductId, UserId, Rating, Comment (≤2000), CreatedAt |
| PromoCodes | Id, Code (уникальный, ≤50), DiscountType, DiscountValue, MinOrderAmount, MaxDiscountAmount, ValidFrom, ValidUntil, UsageLimit, UsageCount, IsActive |
| PromoBanners | Id, Title, Subtitle, ButtonText, ButtonLink, ImageUrl, IsActive, SortOrder, Placement |
| RefreshTokens | Id, UserId, TokenHash (SHA-256, уникальный), ExpiresAt, AbsoluteExpiresAt, CreatedAt, RevokedAt, RotatedAt, LastUsedAt, FamilyId, ClientType, DeviceIdHash, DeviceName |
| EmailTokens | Id, UserId (FK Users, CASCADE), TokenHash (SHA-256 hex, 64, уникальный), Purpose (0 Confirm / 1 Reset), ExpiresAt, UsedAt (NULL), CreatedAt |
| IdempotencyKeys | Id, Key (≤100), UserId, RequestHash (SHA-256), ResponseStatus, ResponseBody, CreatedAt |
| Payments | Id, OrderId (FK Orders), Type (0 Income / 1 Reversal), Amount decimal(18,2) > 0, CreatedAt (UTC; момент оплаты / сторно) |
| Expenses | Id, Category (0 Purchase / 1 Delivery / 2 Other), Amount decimal(18,2) > 0, ExpenseDate (UTC-момент начала дня магазина), Comment (≤500, NULL), CreatedByUserId (FK Users), CreatedAt (UTC), **IsDeleted** (bool, по умолчанию false), **DeletedAt** (UTC, NULL), **DeletedByUserId** (FK Users, NULL) |
| DataProtectionKeys | ключи шифрования сессий (чтобы не слетали при деплое) |

Деньги — `decimal(18,2)`. Все даты — UTC.

## Связи и внешние ключи

| Связь | При удалении |
|---|---|
| Orders.UserId → Users | Restrict (поэтому аккаунт анонимизируется, а не удаляется) |
| Orders.PromoCodeId → PromoCodes | Restrict |
| OrderItems.OrderId → Orders | Cascade |
| OrderItems.ProductId → Products | Restrict (товар из заказов не удалить, сервис отвечает ошибкой) |
| Products.CategoryId → Categories | Restrict |
| Categories.ParentCategoryId → Categories | Restrict |
| Reviews.ProductId, Reviews.UserId | Cascade |
| RefreshTokens.UserId → Users | Cascade |
| IdempotencyKeys.UserId → Users | Cascade |
| Payments.OrderId → Orders | Restrict (платёж не пропадает вместе с заказом; заказы не удаляются) |
| Expenses.CreatedByUserId → Users | Restrict (аккаунт анонимизируется, не удаляется) |
| Expenses.DeletedByUserId → Users | Restrict (NULL, пока расход не удалён) |

## Индексы

- Уникальные: Users.Email; Categories.Slug; PromoCodes.Code; RefreshTokens.TokenHash; Reviews (ProductId, UserId); IdempotencyKeys (UserId, Key); EmailTokens.TokenHash; **Payments (OrderId, Type)** — второй `Income` и второе сторно по заказу невозможны.
- Обычные: Products.CategoryId; Products.Gender; Orders.UserId; RefreshTokens.UserId; RefreshTokens.FamilyId; EmailTokens (UserId, Purpose); EmailTokens.ExpiresAt; IdempotencyKeys.CreatedAt; Payments.CreatedAt; Expenses.ExpenseDate; Expenses.DeletedByUserId; PromoBanners (Placement, IsActive, SortOrder).

## Миграции (`Infrastructure/Persistence/Migrations/`)

| Миграция | Идемпотентна (`IF [NOT] EXISTS` в коде) |
|---|---|
| InitialCreate, AddCategorySlugAndProductMeta, AddOrderDeliveryFields, AddReviewsAndProductRating, AddPromoCodesAndBanners, AddCategoryHasSizes, AddDataProtectionKeys, AddPromoBannerPlacement, AddProductType | нет (стандартные EF, выполняются один раз; EF не применит повторно через `__EFMigrationsHistory`) |
| MoveShoesBagsToGenderCategories | UPDATE по CategoryId без пересоздания записей (без `IF EXISTS`-обёртки) |
| HardenRefreshTokens | без `IF EXISTS`-обёртки |
| AddUserDeletedAt | да |
| AddProductAvailableSizes | да (`ADD COLUMN IF NOT EXISTS`) |
| AddIdempotencyKeys | да (`CREATE ... IF NOT EXISTS`) |
| AddProductUpdatedAt | да: `ADD COLUMN IF NOT EXISTS "UpdatedAt" timestamptz NULL`, затем `UPDATE ... SET "UpdatedAt" = "CreatedAt" WHERE "UpdatedAt" IS NULL` (трогает только строки без значения — правки, сделанные после первого запуска, повторный запуск не затирает), затем `SET DEFAULT now()` и `SET NOT NULL`. Default `now()` оставлен, чтобы код предыдущей версии (откат кода) мог вставлять товары без этой колонки. Order/OrderItem/Review и записи с FK на них не затрагиваются, товары не пересоздаются. Откат кода безопасен, откат схемы — только из бэкапа |
| AddExpenseSoftDelete | да: `ADD COLUMN IF NOT EXISTS` (`IsDeleted boolean NOT NULL DEFAULT false`, `DeletedAt`, `DeletedByUserId`), внешний ключ и индекс — только если их ещё нет. Существующие расходы не пересоздаются, получают `IsDeleted = false`; Orders/OrderItems/Reviews не затрагиваются. Откат кода безопасен (старый код колонки игнорирует), откат схемы — из бэкапа |
| AddFinance | да: `CREATE TABLE/INDEX IF NOT EXISTS`, `CHECK (Amount > 0)`; бэкфилл `Income` для заказов в `Delivered` — `INSERT ... ON CONFLICT (OrderId, Type) DO NOTHING`, повторный запуск ничего не добавляет. Существующие строки Orders/OrderItems/Reviews не затрагиваются. Откат схемы — только из бэкапа (`DROP TABLE` в `Down` — для локальной БД) |
| AddCategorySortOrder | да: `ADD COLUMN IF NOT EXISTS "SortOrder" integer NOT NULL DEFAULT 0`; `UPDATE` по Slug (women 10, men 20, kids 30, bytovaya-tehnika 40, dom-i-byt 50, posuda 60, sport 70, aksessuary 80) **только где `SortOrder = 0`**: повтор и ручные значения не перетираются, строки не создаются и не удаляются. Откат кода безопасен; откат данных — `Down` (`DROP COLUMN IF EXISTS`) или бэкап. Перед деплоем — бэкап Postgres |
| AddEmailConfirmationAndTokens | да: `ADD COLUMN IF NOT EXISTS "EmailConfirmedAt" timestamptz NULL`; `CREATE TABLE IF NOT EXISTS "EmailTokens"` с FK на Users (CASCADE) и `CREATE [UNIQUE] INDEX IF NOT EXISTS`. Существующие строки не меняются (у всех пользователей `EmailConfirmedAt = NULL`), Orders/OrderItems/Reviews не затрагиваются. Откат кода безопасен (старый код колонку и таблицу игнорирует); откат схемы — `Down` (`DROP TABLE IF EXISTS`, `DROP COLUMN IF EXISTS`) или бэкап. Перед деплоем — бэкап Postgres |
| AddHomeGoodsCategory | да, только данные (схема не меняется): `INSERT ... SELECT ... WHERE NOT EXISTS` категории «Дом и быт» (`dom-i-byt`, `HasSizes = false`); `UPDATE` товара «Этажерка для обуви», который лежит в «Бытовая техника», — `CategoryId` на `dom-i-byt` и `ProductType = 'Этажерки'` по Name, Id не меняется (Reviews/OrderItems целы). Повтор и база без такого товара ничего не меняют; одноимённый товар в другой категории не трогается. Откат кода безопасен, откат схемы не нужен (колонок и индексов нет); откат данных — `Down` (возвращает товар, удаляет категорию, только пока она пуста) или бэкап |

Правило: новые миграции только аддитивные и идемпотентные; записи с FK на Order/Review не пересоздавать (см. `.claude/commands/migration.md`).

## Сидер и старт

- Upsert по стабильному ключу: Category — по Slug (в т.ч. `dom-i-byt` — та же запись, что создала миграция `AddHomeGoodsCategory`), Product — по CategoryId+Name. Id не меняются, повтор запуска дублей не создаёт.
- `UploadUrlNormalizer` на старте переносит хост старых URL фото товаров и баннеров на `Uploads:PublicBaseUrl` (UPDATE на месте).
- `Product.Stock` — один остаток на товар (не по размерам).
