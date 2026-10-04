# База данных

Источник: `backend/Domain/Entities/`, `backend/Infrastructure/Persistence/Configurations/`, `Migrations/`. СУБД: PostgreSQL (локально порт 5433, Homebrew postgresql@16).

## Сущности (таблицы)

| Таблица | Поля (основные) |
|---|---|
| Users | Id, Email (уникальный, ≤256), PasswordHash, Name, Role (Customer/Admin), DeletedAt |
| Categories | Id, Name, Slug (уникальный, ≤100), ParentCategoryId, HasSizes |
| Products | Id, Name, Description, Price, DiscountPrice, Stock, CategoryId, Gender, Images (список), CreatedAt, IsBestseller, ProductType (≤50), AvailableSizes (`text[]`, NULL = вся сетка типа), AverageRating decimal(3,2), ReviewCount |
| Orders | Id, UserId, Status, TotalPrice, DiscountAmount, CreatedAt (UTC), ContactName (≤200), ContactPhone (≤32), DeliveryMethod (Courier/Pickup), City (≤200), Address (≤500), PromoCodeId |
| OrderItems | Id, OrderId, ProductId, Quantity, Price (цена на момент заказа), Size (≤16) |
| Reviews | Id, ProductId, UserId, Rating, Comment (≤2000), CreatedAt |
| PromoCodes | Id, Code (уникальный, ≤50), DiscountType, DiscountValue, MinOrderAmount, MaxDiscountAmount, ValidFrom, ValidUntil, UsageLimit, UsageCount, IsActive |
| PromoBanners | Id, Title, Subtitle, ButtonText, ButtonLink, ImageUrl, IsActive, SortOrder, Placement |
| RefreshTokens | Id, UserId, TokenHash (SHA-256, уникальный), ExpiresAt, AbsoluteExpiresAt, CreatedAt, RevokedAt, RotatedAt, LastUsedAt, FamilyId, ClientType, DeviceIdHash, DeviceName |
| IdempotencyKeys | Id, Key (≤100), UserId, RequestHash (SHA-256), ResponseStatus, ResponseBody, CreatedAt |
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

## Индексы

- Уникальные: Users.Email; Categories.Slug; PromoCodes.Code; RefreshTokens.TokenHash; Reviews (ProductId, UserId); IdempotencyKeys (UserId, Key).
- Обычные: Products.CategoryId; Products.Gender; Orders.UserId; RefreshTokens.UserId; RefreshTokens.FamilyId; IdempotencyKeys.CreatedAt; PromoBanners (Placement, IsActive, SortOrder).

## Миграции (`Infrastructure/Persistence/Migrations/`)

| Миграция | Идемпотентна (`IF [NOT] EXISTS` в коде) |
|---|---|
| InitialCreate, AddCategorySlugAndProductMeta, AddOrderDeliveryFields, AddReviewsAndProductRating, AddPromoCodesAndBanners, AddCategoryHasSizes, AddDataProtectionKeys, AddPromoBannerPlacement, AddProductType | нет (стандартные EF, выполняются один раз; EF не применит повторно через `__EFMigrationsHistory`) |
| MoveShoesBagsToGenderCategories | нет в виде `IF EXISTS`; по `CLAUDE.md` это UPDATE по CategoryId без пересоздания записей. TODO: уточнить, безопасен ли повторный запуск |
| HardenRefreshTokens | нет. TODO: уточнить |
| AddUserDeletedAt | да |
| AddProductAvailableSizes | да (`ADD COLUMN IF NOT EXISTS`) |
| AddIdempotencyKeys | да (`CREATE ... IF NOT EXISTS`) |

Правило: новые миграции только аддитивные и идемпотентные; записи с FK на Order/Review не пересоздавать (см. `.claude/commands/migration.md`).

## Сидер и старт

- Upsert по стабильному ключу: Category — по Slug, Product — по CategoryId+Name. Id не меняются, повтор запуска дублей не создаёт.
- `UploadUrlNormalizer` на старте переносит хост старых URL фото товаров и баннеров на `Uploads:PublicBaseUrl` (UPDATE на месте).
- `Product.Stock` — один остаток на товар (не по размерам).
