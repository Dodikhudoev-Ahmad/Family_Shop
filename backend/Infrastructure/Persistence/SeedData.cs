using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Application.Interfaces;
using Domain.Entities;
using Domain.ValueObjects;

namespace Infrastructure.Persistence;

public static class SeedData
{
    private const string DefaultAdminEmail = "admin@familyshop.kz";
    // A few replacement photos (picked to avoid visible brand logos) live under Unsplash's
    // /flagged/ path instead of the regular CDN path — prefix the id with "flagged/" for those.
    // Some categories (bytovaya-tehnika/sport/posuda) also mix in CC0 photos from StockSnap
    // (via cdn.stocksnap.io, found through the keyword-searchable Openverse API and vetted the
    // same way — visually checked for subject match and absence of visible branding) - those are
    // passed as a full https URL and returned as-is instead of being built from an Unsplash id.
    private static string Img(string unsplashId) =>
        unsplashId.StartsWith("http", StringComparison.Ordinal)
            ? unsplashId
            : unsplashId.StartsWith("flagged/", StringComparison.Ordinal)
                ? $"https://images.unsplash.com/flagged/photo-{unsplashId["flagged/".Length..]}?w=600&h=800&fit=crop&q=80"
                : $"https://images.unsplash.com/photo-{unsplashId}?w=600&h=800&fit=crop&q=80";

    public static async Task SeedAsync(
        AppDbContext context,
        IPasswordHasher passwordHasher,
        IConfiguration configuration,
        ILogger logger,
        CancellationToken cancellationToken = default)
    {
        await context.Database.MigrateAsync(cancellationToken);

        if (!await context.Users.AnyAsync(u => u.Role == UserRole.Admin, cancellationToken))
        {
            var adminEmail = configuration["Seed:AdminEmail"] ?? DefaultAdminEmail;
            var adminPassword = configuration["Seed:AdminPassword"];

            // Never fall back to a hardcoded literal - if SEED_ADMIN_PASSWORD isn't set,
            // generate a random one and log it once so an operator can retrieve it from the
            // deploy logs on first boot, instead of shipping a credential in source control.
            if (string.IsNullOrEmpty(adminPassword))
            {
                adminPassword = GenerateRandomPassword();
                logger.LogWarning(
                    "Seed:AdminPassword / SEED_ADMIN_PASSWORD is not set. Generated a one-time admin password for {AdminEmail}: {AdminPassword} — log in and change it immediately, this value will not be shown again.",
                    adminEmail,
                    adminPassword);
            }

            context.Users.Add(new User
            {
                Email = new Email(adminEmail),
                Name = "Администратор",
                PasswordHash = passwordHasher.Hash(adminPassword),
                Role = UserRole.Admin
            });
            await context.SaveChangesAsync(cancellationToken);
        }

        // Every category the seed knows about, ensured idempotently by slug - covers both a
        // first boot and an already-deployed database that predates the newer categories.
        var categorySpecs = new (string Name, string Slug, bool HasSizes)[]
        {
            ("Женское", "women", true),
            ("Мужское", "men", true),
            ("Детское", "kids", true),
            ("Бытовая техника", "bytovaya-tehnika", false),
            ("Спортивные товары", "sport", false),
            ("Посуда", "posuda", false),
            ("Аксессуары", "aksessuary", false),
        };

        var categoriesBySlug = await context.Categories.ToDictionaryAsync(c => c.Slug, c => c, cancellationToken);
        foreach (var (name, slug, hasSizes) in categorySpecs)
        {
            if (!categoriesBySlug.ContainsKey(slug))
            {
                var category = new Category { Name = name, Slug = slug, HasSizes = hasSizes };
                context.Categories.Add(category);
                await context.SaveChangesAsync(cancellationToken);
                categoriesBySlug[slug] = category;
            }
        }

        // Idempotent catalog upsert, keyed by (CategoryId, Name) instead of re-running only on
        // an empty table: prod already has real Orders/Reviews pointing at existing product Ids
        // (e.g. FS-1, FS-2), so an existing row is only ever updated in place here - its Id,
        // Price, Stock, CreatedAt and IsBestseller are left untouched - never deleted or
        // re-inserted. Only its Images/ProductType are corrected if the seed definition changed
        // (this is how the mis-matched "Худи с капюшоном серое" photo gets fixed on redeploy).
        // A genuinely new (CategoryId, Name) - i.e. one of the *Extra() additions below - gets
        // INSERTed. Safe to run on every boot: a second run touches nothing further.
        var catalogBuilders = new (string Slug, Func<int, IEnumerable<Product>> Build)[]
        {
            // Shoes and bags are no longer a category of their own: they live in the category
            // of their gender, alongside the clothes (ProductType tells them apart).
            ("women", id => BuildWomen(id).Concat(BuildWomenExtra(id)).Concat(ShoesAndBagsFor(id, Gender.Female))),
            ("men", id => BuildMen(id).Concat(BuildMenExtra(id)).Concat(ShoesAndBagsFor(id, Gender.Male))),
            ("kids", id => BuildKids(id).Concat(BuildKidsExtra(id)).Concat(ShoesAndBagsFor(id, Gender.Kids))),
            ("bytovaya-tehnika", id => BuildAppliances(id).Concat(BuildAppliancesExtra(id))),
            ("sport", id => BuildSport(id).Concat(BuildSportExtra(id))),
            ("posuda", id => BuildDishes(id).Concat(BuildDishesExtra(id))),
            ("aksessuary", id => BuildAccessories(id).Concat(BuildAccessoriesExtra(id))),
        };

        var existingByKey = await context.Products.ToDictionaryAsync(p => (p.CategoryId, p.Name), cancellationToken);
        var catalogChanged = false;

        foreach (var (slug, build) in catalogBuilders)
        {
            var categoryId = categoriesBySlug[slug].Id;
            var newInBlock = 0;

            foreach (var def in build(categoryId))
            {
                if (existingByKey.TryGetValue((categoryId, def.Name), out var existing))
                {
                    var newImage = def.Images[0];
                    if (existing.Images.Count == 0 || existing.Images[0] != newImage)
                    {
                        existing.Images = def.Images;
                        catalogChanged = true;
                    }

                    if (existing.ProductType is null && def.ProductType is not null)
                    {
                        existing.ProductType = def.ProductType;
                        catalogChanged = true;
                    }
                }
                else
                {
                    // Той же ритм, что и в исходном сиде: первые 3 новых товара блока -
                    // "новинки", 4-й и 5-й - "хиты продаж".
                    def.CreatedAt = DateTime.UtcNow.AddDays(-newInBlock);
                    def.IsBestseller = newInBlock is 3 or 4;
                    newInBlock++;

                    context.Products.Add(def);
                    existingByKey[(categoryId, def.Name)] = def;
                    catalogChanged = true;
                }
            }
        }

        if (catalogChanged)
        {
            await context.SaveChangesAsync(cancellationToken);
        }

        var women13 = await context.Products.Where(p => p.CategoryId == categoriesBySlug["women"].Id).OrderBy(p => p.Id).ToListAsync(cancellationToken);
        var men13 = await context.Products.Where(p => p.CategoryId == categoriesBySlug["men"].Id).OrderBy(p => p.Id).ToListAsync(cancellationToken);
        var kids13 = await context.Products.Where(p => p.CategoryId == categoriesBySlug["kids"].Id).OrderBy(p => p.Id).ToListAsync(cancellationToken);
        // The original 13 seeded shoes/bags, in their definition order (they now sit in different
        // gender categories, so they're looked up by name rather than by category).
        var shoesBagsNames = BuildShoesAndBags(0).Select(p => p.Name).ToList();
        var shoesBags13 = (await context.Products.Where(p => shoesBagsNames.Contains(p.Name)).ToListAsync(cancellationToken))
            .OrderBy(p => shoesBagsNames.IndexOf(p.Name))
            .ToList();

        // Backfill product types for rows created before the column existed (idempotent).
        var untyped = await context.Products.Where(p => p.ProductType == null).ToListAsync(cancellationToken);
        foreach (var product in untyped)
        {
            product.ProductType = ProductTypeClassifier.Infer(product.Name);
        }

        if (untyped.Count > 0)
        {
            await context.SaveChangesAsync(cancellationToken);
        }

        // Guarded independently of category/product seeding (same reasoning as the admin-user
        // guard above) - otherwise reviews silently never seed on a DB that already has a catalog.
        if (!await context.Reviews.AnyAsync(cancellationToken))
        {
            await SeedReviewsAsync(context, passwordHasher, women13, men13, kids13, shoesBags13, cancellationToken);
        }
    }

    private static readonly (string Name, string Email)[] ReviewerSeeds =
    [
        ("Дана Ахметова", "reviewer1@seed.familyshop.kz"),
        ("Ерлан Сатыбалдиев", "reviewer2@seed.familyshop.kz"),
        ("Мадина Курманова", "reviewer3@seed.familyshop.kz"),
        ("Тимур Жумабеков", "reviewer4@seed.familyshop.kz"),
        ("Алия Бекова", "reviewer5@seed.familyshop.kz"),
        ("Асхат Нурлыбаев", "reviewer6@seed.familyshop.kz"),
        ("Гульнара Сериковна", "reviewer7@seed.familyshop.kz"),
        ("Бауыржан Есенов", "reviewer8@seed.familyshop.kz"),
    ];

    private static readonly (int Rating, string Comment)[] PositiveComments =
    [
        (5, "Отличное качество, село идеально по размеру. Буду заказывать ещё."),
        (5, "Очень довольна покупкой! Ткань приятная, пошив аккуратный."),
        (5, "Пришло быстро, выглядит даже лучше, чем на фото."),
        (4, "Хорошая вещь за свои деньги, но цвет чуть отличается от фото."),
        (4, "В целом качеством довольна, размер соответствует таблице."),
        (4, "Приятный материал, носится комфортно. Рекомендую."),
    ];

    private static readonly (int Rating, string Comment)[] MixedComments =
    [
        (3, "Неплохо, но ожидала немного другого качества ткани."),
        (3, "Сидит нормально, но швы могли бы быть аккуратнее."),
        (2, "Размер маломерит, пришлось заказывать на размер больше."),
        (2, "Материал тоньше, чем хотелось бы для такой цены."),
    ];

    private static async Task SeedReviewsAsync(
        AppDbContext context,
        IPasswordHasher passwordHasher,
        List<Product> women13,
        List<Product> men13,
        List<Product> kids13,
        List<Product> shoesBags13,
        CancellationToken cancellationToken)
    {
        var reviewers = ReviewerSeeds
            .Select(r => new User { Email = new Email(r.Email), Name = r.Name, PasswordHash = passwordHasher.Hash("***REMOVED***"), Role = UserRole.Customer })
            .ToList();

        context.Users.AddRange(reviewers);
        await context.SaveChangesAsync(cancellationToken);

        // 18 products across all four categories get 2-5 reviews each, mixing positive and
        // mixed feedback so the catalog/product-page demo isn't empty or artificially perfect.
        var reviewedProducts = new List<Product>
        {
            women13[0], women13[2], women13[3], women13[4], women13[5], women13[8],
            men13[0], men13[1], men13[3], men13[7],
            kids13[1], kids13[3], kids13[5],
            shoesBags13[0], shoesBags13[1], shoesBags13[4], shoesBags13[6], shoesBags13[9],
        };

        var reviewCounts = new[] { 2, 3, 4, 5, 3, 2, 4, 5, 3, 2, 3, 4, 2, 5, 3, 4, 2, 3 };
        var reviews = new List<Review>();
        var random = new Random(42);

        for (var p = 0; p < reviewedProducts.Count; p++)
        {
            var product = reviewedProducts[p];
            var count = reviewCounts[p % reviewCounts.Length];
            var shuffledReviewers = reviewers.OrderBy(_ => random.Next()).Take(count).ToList();

            for (var i = 0; i < shuffledReviewers.Count; i++)
            {
                // Mostly positive with an occasional mixed review, matching typical real-world
                // rating distributions instead of a flat/uniform spread.
                var pool = random.NextDouble() < 0.75 ? PositiveComments : MixedComments;
                var (rating, comment) = pool[random.Next(pool.Length)];

                reviews.Add(new Review
                {
                    ProductId = product.Id,
                    UserId = shuffledReviewers[i].Id,
                    Rating = rating,
                    Comment = comment,
                    CreatedAt = DateTime.UtcNow.AddDays(-random.Next(1, 90))
                });
            }
        }

        context.Reviews.AddRange(reviews);
        await context.SaveChangesAsync(cancellationToken);

        foreach (var group in reviews.GroupBy(r => r.ProductId))
        {
            var product = reviewedProducts.First(p => p.Id == group.Key);
            product.AverageRating = Math.Round((decimal)group.Average(r => r.Rating), 2);
            product.ReviewCount = group.Count();
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    private static Product Make(string name, string description, decimal price, decimal? discountPrice, int stock, int categoryId, Gender gender, string imageId, string? productType = null) =>
        new()
        {
            Name = name,
            Description = description,
            Price = new Money(price),
            DiscountPrice = discountPrice.HasValue ? new Money(discountPrice.Value) : null,
            Stock = stock,
            CategoryId = categoryId,
            Gender = gender,
            Images = [Img(imageId)],
            ProductType = productType
        };

    // Все изображения проверены визуально (не только по HTTP-статусу) на соответствие названию товара.
    private static IEnumerable<Product> BuildWomen(int categoryId)
    {
        yield return Make("Платье миди в цветочный принт", "Лёгкое платье из вискозы с цветочным принтом и длинным рукавом.", 15900, 12700, 15, categoryId, Gender.Female, "1616313253719-c46514cddee1");
        yield return Make("Комбинезон шёлковый бирюзовый", "Свободный комбинезон из искусственного шёлка с глубоким вырезом.", 18900, null, 9, categoryId, Gender.Female, "1495385794356-15371f348c31");
        yield return Make("Платье вечернее чёрное кружевное", "Приталенное вечернее платье с кружевным верхом и плиссированной юбкой.", 21900, 17500, 3, categoryId, Gender.Female, "1599662875272-64de8289f6d8");
        yield return Make("Платье с открытыми плечами", "Летнее платье на тонких бретелях с цветочным принтом.", 12900, null, 18, categoryId, Gender.Female, "1563178406-4cdc2923acbc");
        yield return Make("Сарафан летний хлопковый", "Свободный сарафан из хлопка с цветочным принтом, дышащая ткань.", 10900, 8700, 20, categoryId, Gender.Female, "1762154057377-cc9d3dd6900c");
        yield return Make("Пальто приталенное коричневое", "Однобортное пальто из шерстяной смеси с поясом, классический крой.", 32900, null, 8, categoryId, Gender.Female, "1539533113208-f6df8cc8b543");
        yield return Make("Пальто оверсайз бежевое", "Пальто свободного кроя с широкими лацканами и поясом.", 34900, 27900, 2, categoryId, Gender.Female, "1539533018447-63fcce2678e3");
        yield return Make("Тренч классический бежевый", "Плащ-тренч из плотной ткани с поясом и погонами.", 25900, null, 11, categoryId, Gender.Female, "1633821879282-0c4e91f96232");
        yield return Make("Пуховик жёлтый с капюшоном", "Тёплый пуховик с наполнителем и меховой опушкой на капюшоне.", 29900, 23900, 10, categoryId, Gender.Female, "1585215173785-7f3c2252c25a");
        yield return Make("Блузка шёлковая белая", "Классическая блузка прямого кроя с бантом на воротнике.", 9900, null, 22, categoryId, Gender.Female, "1598626431046-c7978e636c14");
        yield return Make("Комплект блузка и юбка-карандаш", "Блузка в горох и юбка-карандаш на пуговицах, деловой стиль.", 16900, 13500, 12, categoryId, Gender.Female, "1723992225365-9548a2bdf938");
        yield return Make("Жакет клетчатый серый приталенный", "Двубортный жакет из костюмной ткани в клетку.", 25900, null, 8, categoryId, Gender.Female, "1608234808654-2a8875faa7fd");
        yield return Make("Жакет с бантом приталенный", "Жакет из плотной ткани с фактурной бабочкой на груди.", 20900, null, 10, categoryId, Gender.Female, "1783095627507-9cc3980f6e10");
    }

    private static IEnumerable<Product> BuildMen(int categoryId)
    {
        yield return Make("Рубашка классическая белая", "Приталенная рубашка из хлопка, длинный рукав, классический воротник.", 9900, null, 25, categoryId, Gender.Male, "1603252109612-24fa03d145c8");
        yield return Make("Пиджак чёрный приталенный", "Однобортный пиджак из костюмной ткани с лацканами.", 29900, 23900, 0, categoryId, Gender.Male, "1598808503746-f34c53b9323e");
        yield return Make("Куртка спортивная жёлтая", "Лёгкая куртка на молнии для межсезонья.", 18900, null, 14, categoryId, Gender.Male, "1634136912882-61fd36144a3a");
        yield return Make("Куртка джинсовая синяя", "Классическая джинсовая куртка прямого кроя.", 15900, 12700, 17, categoryId, Gender.Male, "1602515931029-16b4a8ff505a");
        yield return Make("Куртка замшевая коричневая", "Куртка из искусственной замши на кнопках.", 22900, null, 10, categoryId, Gender.Male, "1786540610338-0fec664e7db4");
        yield return Make("Бомбер оливковый с меховым воротником", "Куртка-бомбер с отстёгивающимся воротником из искусственного меха.", 19900, 15900, 12, categoryId, Gender.Male, "1629353689974-af4d5c70440f");
        yield return Make("Джемпер в полоску", "Трикотажный джемпер прямого кроя в полоску.", 8900, null, 20, categoryId, Gender.Male, "1597143720583-bbbf44a6677d");
        // Заменено: исходное фото показывало женщину вместо мужчины — фото/пол не совпадали (аудит каталога).
        yield return Make("Худи с капюшоном серое", "Худи из плотного футера, свободный унисекс-крой.", 10900, 8700, 24, categoryId, Gender.Male, "https://images.pexels.com/photos/30257616/pexels-photo-30257616.jpeg?auto=compress&cs=tinysrgb&h=800&w=600");
        yield return Make("Свитер трикотажный бордовый", "Приталенный свитер с высоким горлом из мягкой пряжи.", 11900, null, 16, categoryId, Gender.Male, "1642886512785-b5fee9faad7f");
        yield return Make("Брюки чинос бежевые", "Классические брюки прямого кроя из плотного хлопка.", 11900, 9500, 19, categoryId, Gender.Male, "1711443813147-def27861b9af");
        yield return Make("Куртка коричневая на молнии", "Лёгкая куртка на молнии с накладными карманами.", 26900, null, 7, categoryId, Gender.Male, "1630724725268-8272ac390de7");
        yield return Make("Брюки классические коричневые", "Брюки прямого кроя из костюмной ткани.", 13900, null, 13, categoryId, Gender.Male, "1771310961655-b1f044b227ab");
        yield return Make("Куртка лёгкая белая", "Куртка на молнии из плащёвки, унисекс-крой.", 16900, 13500, 11, categoryId, Gender.Male, "1784850758011-3ba9c0ae192b");
    }

    private static IEnumerable<Product> BuildKids(int categoryId)
    {
        yield return Make("Блузка в горох для девочки", "Хлопковая блузка с длинным рукавом в горошек.", 5900, null, 20, categoryId, Gender.Kids, "1518831959646-742c3a14ebf7");
        yield return Make("Платье голубое для девочки", "Летнее платье небесно-голубого цвета из хлопка.", 6900, 5500, 15, categoryId, Gender.Kids, "1762005120432-407779e88016");
        yield return Make("Боди для малыша белое", "Хлопковое боди с кнопками на плечах и внизу, мягкий шов.", 3200, null, 30, categoryId, Gender.Kids, "1622290319146-7b63df48a635");
        yield return Make("Футболка для малыша белая", "Базовая футболка из органического хлопка.", 2600, 2100, 28, categoryId, Gender.Kids, "1622290291720-ac961c43ee30");
        yield return Make("Футболка белая детская", "Базовая футболка из плотного хлопка.", 2800, null, 35, categoryId, Gender.Kids, "1622290291468-a28f7a7dc6a8");
        yield return Make("Худи жёлтое для мальчика", "Тёплое худи с капюшоном и кармашком-кенгуру.", 6900, 5500, 18, categoryId, Gender.Kids, "1613155266464-b76318091db3");
        yield return Make("Куртка розовая демисезонная", "Лёгкая флисовая куртка с капюшоном для прогулок.", 9900, null, 12, categoryId, Gender.Kids, "1640405814570-82f7051d5e1a");
        yield return Make("Куртка розовая укороченная", "Куртка с капюшоном на молнии, тёплая подкладка.", 10900, 8700, 10, categoryId, Gender.Kids, "1614343623084-19e979d13b0d");
        yield return Make("Пальто жёлтое для девочки", "Демисезонный пуховик с капюшоном и опушкой.", 13900, null, 8, categoryId, Gender.Kids, "1650546585160-2995d98e6403");
        yield return Make("Пуховик синий с меховым капюшоном для девочки", "Тёплый пуховик с капюшоном на искусственном меху.", 14900, 11900, 7, categoryId, Gender.Kids, "1736571526280-2bb3863822a4");
        yield return Make("Футболка жёлтая для мальчика", "Однотонная футболка из хлопка, свободный крой.", 3000, null, 22, categoryId, Gender.Kids, "1562942673-67a4349d5cd4");
        yield return Make("Спортивный костюм детский", "Комплект: худи и брюки-джоггеры из футера, унисекс.", 9900, 7900, 16, categoryId, Gender.Kids, "1632232962967-0740a757380d");
        yield return Make("Платье жёлтое в горох для девочки", "Хлопковое платье с горошком, повседневный вариант.", 6400, null, 9, categoryId, Gender.Kids, "1560506840-ec148e82a604");
    }

    private static IEnumerable<Product> ShoesAndBagsFor(int categoryId, Gender gender) =>
        BuildShoesAndBags(categoryId).Concat(BuildShoesAndBagsExtra(categoryId)).Where(p => p.Gender == gender);

    private static IEnumerable<Product> BuildShoesAndBags(int categoryId)
    {
        yield return Make("Кроссовки разноцветные с оранжевым", "Лёгкие кроссовки в спортивном стиле с яркими вставками.", 17900, 14300, 20, categoryId, Gender.Female, "1560769629-975ec94e6a86");
        // Заменено: исходное фото было парой Nike Air Jordan 1 (виден свош + крылья Jordan) — юридический риск.
        yield return Make("Кроссовки красно-белые", "Спортивные кроссовки с амортизацией и шнуровкой.", 19900, null, 18, categoryId, Gender.Male, "1650320079970-b4ee8f0dae33");
        // Заменено: исходное фото было парой Nike Air Jordan 4 (силуэт/брендинг Jumpman) — юридический риск.
        yield return Make("Кроссовки баскетбольные", "Высокие кроссовки для активных тренировок.", 23900, 19100, 14, categoryId, Gender.Male, "flagged/1557599312-a15fc210f751");
        // Заменено: исходное фото было кроссовком Nike (чёткий свош крупным планом) — юридический риск.
        yield return Make("Кроссовки белые беговые", "Беговые кроссовки с дышащей сеткой.", 20900, null, 16, categoryId, Gender.Female, "1603808033192-082d6919d3e1");
        yield return Make("Кроссовки бежевые замшевые", "Кроссовки из замши на контрастной резиновой подошве.", 24900, 19900, 12, categoryId, Gender.Male, "1727061180303-d91cdeca6f9c");
        yield return Make("Ботинки чёрные на шпильке", "Кожаные ботильоны на тонком каблуке с молнией.", 23900, null, 10, categoryId, Gender.Female, "1605733513549-de9b150bd70d");
        yield return Make("Ботинки бежевые лаковые на каблуке", "Лаковые ботильоны на устойчивом каблуке.", 16900, 13500, 11, categoryId, Gender.Female, "1621996659490-3275b4d0d951");
        yield return Make("Ботинки замшевые коричневые высокие", "Высокие замшевые ботинки на каблуке.", 25900, null, 9, categoryId, Gender.Female, "1575425939273-46ecee6d6931");
        yield return Make("Сумка через плечо серая", "Сумка-сэтчел из фактурной кожи с золотой фурнитурой.", 20900, 16700, 13, categoryId, Gender.Female, "1605733513597-a8f8341084e6");
        yield return Make("Сумка кожаная чёрная", "Компактная сумка с двумя ручками на пряжках.", 18900, null, 15, categoryId, Gender.Female, "1705909237050-7a7625b47fac");
        yield return Make("Сумка дорожная кожаная", "Вместительная дорожная сумка из плотной кожи.", 29900, 23900, 6, categoryId, Gender.Male, "1525103504173-8dc1582c7430");
        yield return Make("Сумка бирюзовая с ручкой", "Структурная сумка с короткой ручкой и металлической застёжкой.", 10900, null, 17, categoryId, Gender.Female, "1652427019217-3ded1a356f10");
        yield return Make("Сумка-мешок чёрная", "Сумка-хобо на длинном ремне из гладкой кожи.", 15900, 12700, 12, categoryId, Gender.Female, "1702325107940-88f9cd4468c2");
    }

    // Эта сеть-песочница даёт доступ только к CDN images.unsplash.com по известному id, а не к
    // поиску/просмотру на unsplash.com напрямую — но keyword-поиск на api.openverse.org (это
    // отдельный домен, тоже доступен) позволяет находить реальные CC0-фото со StockSnap, которые
    // затем проверяются здесь так же, как Unsplash: визуально по одному, на соответствие товару
    // и на отсутствие видимого брендинга (несколько кандидатов отсеяны именно по бренду — see
    // notes below).
    private static IEnumerable<Product> BuildAppliances(int categoryId)
    {
        yield return Make("Микроволновая печь соло 20 л", "Компактная микроволновая печь с механическим управлением, 5 режимов мощности.", 54900, 44900, 8, categoryId, Gender.Male, "1585659722983-3a675dabf23d");
        yield return Make("Холодильник ретро мини бирюзовый", "Однокамерный холодильник в ретро-дизайне, вместимость 90 л.", 189900, null, 3, categoryId, Gender.Female, "1571175443880-49e1d25b2bc5");
        yield return Make("Плита газовая настольная, 2 конфорки", "Компактная газовая плита для дачи и кухни, эмалированное покрытие.", 39900, 31900, 10, categoryId, Gender.Male, "1556911220-e15b29be8c8f");
        yield return Make("Плита индукционная встраиваемая", "Варочная панель на 4 конфорки с сенсорным управлением.", 129900, null, 4, categoryId, Gender.Female, "1556909114-f6e7ad7d3136");
        yield return Make("Наушники беспроводные с кейсом", "Беспроводные наушники-вкладыши с кейсом для зарядки, до 24 часов работы.", 24900, 19900, 15, categoryId, Gender.Male, "1585155770447-2f66e2a397b5");
        yield return Make("Тостер на 2 тоста белый", "Классический тостер с регулировкой степени прожарки.", 12900, 9900, 20, categoryId, Gender.Male, "https://cdn.stocksnap.io/img-thumbs/960w/0UTZ00FWC6.jpg");
        yield return Make("Вентилятор настольный белый", "Компактный настольный вентилятор с 3 скоростями обдува.", 9900, null, 18, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/RX7FLY9B2K.jpg");
        yield return Make("Вентилятор напольный чёрный", "Напольный вентилятор с наклоном и плавным вращением.", 14900, 11900, 10, categoryId, Gender.Male, "https://cdn.stocksnap.io/img-thumbs/960w/R4XC41OERV.jpg");
        yield return Make("Вентилятор ретро металлический", "Настольный вентилятор в металлическом корпусе, ретро-дизайн.", 19900, null, 6, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/FJDU8QQIMS.jpg");
        yield return Make("Кофемолка электрическая", "Жерновая кофемолка с регулировкой степени помола.", 22900, 18300, 9, categoryId, Gender.Male, "https://cdn.stocksnap.io/img-thumbs/960w/E613O10GBW.jpg");
        yield return Make("Чайник электрический с узким носиком", "Электрический чайник для заваривания кофе методом пуровер.", 17900, null, 11, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/LVSRR5HGRB.jpg");
        yield return Make("Духовой шкаф встраиваемый", "Электрический духовой шкаф с конвекцией, объём 65 л.", 179900, 149900, 3, categoryId, Gender.Male, "https://cdn.stocksnap.io/img-thumbs/960w/BE0UGGW85Y.jpg");
        yield return Make("Колонка акустическая портативная", "Компактная акустическая колонка с чистым басом.", 24900, null, 14, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/WKV40ATLIY.jpg");
        yield return Make("Наушники накладные белые", "Накладные наушники с мягкими амбушюрами и складной конструкцией.", 13900, 10900, 17, categoryId, Gender.Male, "https://cdn.stocksnap.io/img-thumbs/960w/UXKE7VWPCY.jpg");
        yield return Make("Фен для волос профессиональный", "Мощный фен с ионизацией и несколькими насадками.", 15900, null, 13, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/D5CG6JAYN3.jpg");
    }

    private static IEnumerable<Product> BuildSport(int categoryId)
    {
        yield return Make("Штанга олимпийская с дисками 50 кг", "Гриф с набором обрезиненных дисков суммарным весом 50 кг.", 89900, null, 5, categoryId, Gender.Male, "1517836357463-d25dfeac3438");
        yield return Make("Шлем велосипедный спортивный", "Лёгкий вентилируемый шлем с регулировкой размера.", 14900, 11900, 12, categoryId, Gender.Male, "1517649763962-0c623066013b");
        yield return Make("Стойка для дисков штанги", "Металлическая стойка для хранения блинов, до 150 кг.", 34900, null, 6, categoryId, Gender.Male, "1540497077202-7c8a3999166f");
        yield return Make("Кроссовки для бега мужские", "Беговые кроссовки с амортизирующей подошвой для асфальта.", 24900, 19900, 15, categoryId, Gender.Male, "1571008887538-b36bb32f4571");
        yield return Make("Кроссовки легкоатлетические", "Лёгкие кроссовки для тренировок на стадионе.", 27900, null, 8, categoryId, Gender.Female, "1461896836934-ffe607ba8211");
        yield return Make("Ракетка для большого тенниса", "Ракетка для любителей и продвинутых игроков, вес 300 г.", 19900, 15900, 10, categoryId, Gender.Female, "1595435742656-5272d0b3fa82");
        yield return Make("Гантели наборные комплект 2-10 кг", "Набор разборных гантелей с изменяемым весом.", 44900, null, 6, categoryId, Gender.Male, "1576678927484-cc907957088c");
        yield return Make("Диски для штанги обрезиненные 10 кг", "Пара обрезиненных дисков для штанги, посадочный диаметр 51 мм.", 12900, 9900, 20, categoryId, Gender.Male, "1517963879433-6ad2b056d712");
        yield return Make("Очки для плавания зеркальные", "Очки для бассейна с антизапотевающим покрытием.", 4900, null, 25, categoryId, Gender.Female, "1600965962102-9d260a71890d");
        yield return Make("Гантель неопреновая 4 кг", "Гантель в неопреновом покрытии для фитнеса и аэробики.", 6900, 5500, 18, categoryId, Gender.Female, "1583454110551-21f2fa2afe61");
        yield return Make("Коврик для йоги двусторонний", "Коврик из вспененного каучука, 183х61 см, нескользящее покрытие.", 9900, null, 16, categoryId, Gender.Female, "1518611012118-696072aa579a");
        yield return Make("Скамья для жима регулируемая", "Скамья с изменяемым углом наклона для силовых тренировок.", 54900, 44900, 4, categoryId, Gender.Male, "1571902943202-507ec2618e8f");
        yield return Make("Тренажёр блочный для дома", "Компактный блочный тренажёр для тяги и жима дома.", 149900, null, 2, categoryId, Gender.Female, "1571731956672-f2b94d7dd0cb");
        yield return Make("Турник навесной для дома", "Навесной турник для дверного проёма, до 100 кг.", 8900, 6900, 20, categoryId, Gender.Male, "1526506118085-60ce8714f8c5");
        yield return Make("Мяч баскетбольный", "Баскетбольный мяч размер 7 для игры на улице.", 9900, null, 18, categoryId, Gender.Male, "https://cdn.stocksnap.io/img-thumbs/960w/XREEJO0CPH.jpg");
        yield return Make("Бутылка для воды спортивная", "Прозрачная спортивная бутылка для воды, 750 мл, без бисфенола-А.", 3900, 2900, 30, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/EBUJNKRBLV.jpg");
        yield return Make("Кроссовки белые повседневные унисекс", "Лёгкие кроссовки для тренировок и повседневной носки.", 21900, null, 14, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/DPNQ3PEKA0.jpg");
    }

    private static IEnumerable<Product> BuildDishes(int categoryId)
    {
        yield return Make("Кастрюля чугунная эмалированная оранжевая 4 л", "Чугунная кастрюля с крышкой, подходит для индукционных плит.", 32900, 26900, 6, categoryId, Gender.Female, "1590794056226-79ef3a8147e1");
        yield return Make("Набор тарелок керамических, 6 шт", "Набор обеденных тарелок из керамики, пастельные оттенки.", 15900, null, 12, categoryId, Gender.Female, "1578749556568-bc2c40e68b61");
        yield return Make("Набор кружек керамических, 4 шт", "Набор кружек ручной работы, объём 350 мл каждая.", 9900, 7900, 18, categoryId, Gender.Male, "1610701596007-11502861dcfa");
        yield return Make("Чашка кофейная с блюдцем", "Фарфоровая чашка для эспрессо с блюдцем, объём 90 мл.", 3900, null, 25, categoryId, Gender.Female, "1544787219-7f47ccb76574");
        yield return Make("Пара чашек для капучино", "Две керамические чашки для капучино с ручной росписью.", 6900, 5500, 14, categoryId, Gender.Male, "1495474472287-4d71bcdd2085");
        yield return Make("Тарелка обеденная плоская", "Плоская обеденная тарелка из фарфора, диаметр 27 см.", 2900, null, 30, categoryId, Gender.Female, "1533089860892-a7c6f0a88666");
        yield return Make("Набор кухонных ножей в чехле, 6 предметов", "Набор ножей из нержавеющей стали с деревянными рукоятками и чехлом.", 24900, 19900, 9, categoryId, Gender.Male, "1593618998160-e34014e67546");
        yield return Make("Органайзер кухонный для специй", "Настольная подставка для специй и кухонных мелочей.", 7900, null, 16, categoryId, Gender.Female, "1495521821757-a1efb6729352");
        yield return Make("Тарелка десертная белая", "Керамическая тарелка для десертов, диаметр 20 см.", 2400, 1900, 22, categoryId, Gender.Male, "1578775887804-699de7086ff9");
        yield return Make("Миска керамическая белая", "Глубокая миска для супа и каши, диаметр 16 см.", 2900, null, 26, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/3973FC7B7F.jpg");
        yield return Make("Бокал для вина на ножке", "Хрустальный бокал для красного вина, объём 450 мл.", 3900, 2900, 20, categoryId, Gender.Male, "https://cdn.stocksnap.io/img-thumbs/960w/F0TCNPX9PK.jpg");
        yield return Make("Набор бокалов для вина, 2 шт", "Пара бокалов для белого вина из тонкого стекла.", 6900, null, 15, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/A819A004C3.jpg");
        yield return Make("Чайник заварочный керамический чёрный", "Заварочный чайник из керамики с ситечком, объём 600 мл.", 8900, 6900, 12, categoryId, Gender.Male, "https://cdn.stocksnap.io/img-thumbs/960w/5811FEC469.jpg");
        yield return Make("Чайник заварочный белый", "Керамический заварочный чайник классической формы.", 7900, null, 14, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/RVFDXZEEFB.jpg");
        yield return Make("Чайник для плиты со свистком", "Эмалированный чайник со свистком, подходит для газовых плит, 2.5 л.", 10900, 8700, 10, categoryId, Gender.Male, "https://cdn.stocksnap.io/img-thumbs/960w/ND9JSEK2QN.jpg");
        yield return Make("Набор мисок керамических с узором, 3 шт", "Набор мисок ручной росписи разных размеров.", 11900, null, 13, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/FTFTNXN41H.jpg");
        yield return Make("Набор мисок керамических синих, 3 шт", "Набор глубоких мисок с узором, разные размеры.", 11900, 9500, 13, categoryId, Gender.Male, "https://cdn.stocksnap.io/img-thumbs/960w/GAMHRIGNDW.jpg");
        yield return Make("Набор кухонных принадлежностей деревянных", "Ложка и лопатка из бука с деревянной подставкой.", 5900, null, 19, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/49FQQBTLIN.jpg");
        yield return Make("Тарелка сервировочная с бортиком", "Плоская тарелка для сервировки, диаметр 26 см.", 3400, 2700, 24, categoryId, Gender.Male, "https://cdn.stocksnap.io/img-thumbs/960w/WZRTRRU0M7.jpg");
        yield return Make("Разделочная доска деревянная", "Разделочная доска из массива дерева с ручкой.", 6900, null, 17, categoryId, Gender.Female, "https://cdn.stocksnap.io/img-thumbs/960w/W5ZT4FSP3I.jpg");
    }

    private static IEnumerable<Product> BuildAccessories(int categoryId)
    {
        yield return Make("Колье жемчужное на цепочке", "Тонкая цепочка с подвеской из искусственного жемчуга.", 12900, null, 14, categoryId, Gender.Female, "1611085583191-a3b181a88401");
        yield return Make("Цепочка золотистая с подвеской", "Многослойная цепочка с миниатюрной подвеской, позолота.", 8900, 6900, 20, categoryId, Gender.Female, "1611652022419-a9419f74343d");
        yield return Make("Браслет-цепочка золотистый", "Массивный браслет-цепь с позолотой, регулируемый размер.", 6900, null, 22, categoryId, Gender.Female, "1596944924616-7b38e7cfac36");
        yield return Make("Набор колец с камнями, 3 шт", "Набор из трёх колец с разноцветными камнями, позолота.", 5900, 4500, 25, categoryId, Gender.Female, "1608042314453-ae338d80c427");
        yield return Make("Рюкзак городской тёмно-синий", "Городской рюкзак из плотного текстиля с отделением для ноутбука.", 15900, null, 12, categoryId, Gender.Male, "1553062407-98eeb64c6a62");
        yield return Make("Смарт-часы спортивные чёрные", "Смарт-часы с мониторингом пульса и уведомлениями, чёрный ремешок.", 34900, 27900, 9, categoryId, Gender.Male, "1553545204-4f7d339aa06a");
        yield return Make("Рюкзак кожаный коричневый", "Рюкзак из натуральной кожи с ремешком-затяжкой.", 22900, null, 7, categoryId, Gender.Male, "1622560480605-d83c853bc5c3");
        yield return Make("Кулон с кристаллом на цепочке", "Кулон с гранёным кристаллом синего цвета на тонкой цепочке.", 7900, 6300, 16, categoryId, Gender.Female, "1599643477877-530eb83abc8e");
        yield return Make("Чехол для телефона карбоновый чёрный", "Противоударный чехол с текстурой карбона, тонкий профиль.", 4900, null, 30, categoryId, Gender.Male, "1601593346740-925612772716");
    }

    // Дополнительные товары для полноты размерной/типовой сетки каталога (аудит Category x
    // ProductType). Фото подобраны через Pexels API, визуально проверены на соответствие полу/
    // возрасту и типу товара, без видимых брендов/логотипов.
    private static IEnumerable<Product> BuildWomenExtra(int categoryId)
    {
        yield return Make("Блузка графитовая с воланами", "Лёгкая блузка из плотной вискозы, графитовый оттенок, комфортный крой.", 10800, 9100, 5, categoryId, Gender.Female, "https://images.pexels.com/photos/18220443/pexels-photo-18220443.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Блузки");
        yield return Make("Блузка синяя шёлковая", "Лёгкая блузка из плотной вискозы, синий оттенок, комфортный крой.", 12700, null, 18, categoryId, Gender.Female, "https://images.pexels.com/photos/8939787/pexels-photo-8939787.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Блузки");
        yield return Make("Блузка чёрная с бантом", "Лёгкая блузка из плотной вискозы, чёрный оттенок, комфортный крой.", 13000, null, 9, categoryId, Gender.Female, "https://images.pexels.com/photos/8289271/pexels-photo-8289271.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Блузки");
        yield return Make("Блузка белая офисная", "Лёгкая блузка из плотной вискозы, белый оттенок, комфортный крой.", 12800, 10800, 6, categoryId, Gender.Female, "https://images.pexels.com/photos/10686399/pexels-photo-10686399.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Блузки");
        yield return Make("Блузка молочная с рюшами", "Лёгкая блузка из плотной вискозы, молочный оттенок, комфортный крой.", 9200, 7300, 4, categoryId, Gender.Female, "https://images.pexels.com/photos/1360136/pexels-photo-1360136.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Блузки");
        yield return Make("Комбинезон белый джинсовый", "Комбинезон свободного кроя, белый оттенок, натуральная ткань.", 20700, null, 17, categoryId, Gender.Female, "https://images.pexels.com/photos/20729716/pexels-photo-20729716.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Комбинезоны");
        yield return Make("Комбинезон коричневый широкий", "Комбинезон свободного кроя, коричневый оттенок, натуральная ткань.", 21900, null, 6, categoryId, Gender.Female, "https://images.pexels.com/photos/6144467/pexels-photo-6144467.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Комбинезоны");
        yield return Make("Комбинезон тёмно-синий на молнии", "Комбинезон свободного кроя, тёмно-синий оттенок, натуральная ткань.", 18100, 14400, 20, categoryId, Gender.Female, "https://images.pexels.com/photos/16977307/pexels-photo-16977307.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Комбинезоны");
        yield return Make("Комбинезон чёрный офисный", "Комбинезон свободного кроя, чёрный оттенок, натуральная ткань.", 18500, 15700, 7, categoryId, Gender.Female, "https://images.pexels.com/photos/38023307/pexels-photo-38023307.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Комбинезоны");
        yield return Make("Комбинезон песочный вечерний", "Комбинезон свободного кроя, песочный оттенок, натуральная ткань.", 20000, 16400, 16, categoryId, Gender.Female, "https://images.pexels.com/photos/5137870/pexels-photo-5137870.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Комбинезоны");
        yield return Make("Комбинезон бежевый с поясом", "Комбинезон свободного кроя, бежевый оттенок, натуральная ткань.", 15700, null, 4, categoryId, Gender.Female, "https://images.pexels.com/photos/6279558/pexels-photo-6279558.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Комбинезоны");
        yield return Make("Куртка изумрудная джинсовая", "Куртка прямого кроя, изумрудный оттенок, подходит на межсезонье.", 19800, 16200, 7, categoryId, Gender.Female, "https://images.pexels.com/photos/12083001/pexels-photo-12083001.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Куртки");
        yield return Make("Куртка терракотовая кожаная", "Куртка прямого кроя, терракотовый оттенок, подходит на межсезонье.", 17600, 14000, 4, categoryId, Gender.Female, "https://images.pexels.com/photos/35223914/pexels-photo-35223914.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Куртки");
        yield return Make("Куртка бордовая косуха", "Куртка прямого кроя, бордовый оттенок, подходит на межсезонье.", 16600, null, 19, categoryId, Gender.Female, "https://images.pexels.com/photos/15161530/pexels-photo-15161530.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Куртки");
        yield return Make("Куртка бежевая на молнии", "Куртка прямого кроя, бежевый оттенок, подходит на межсезонье.", 18100, null, 10, categoryId, Gender.Female, "https://images.pexels.com/photos/31307887/pexels-photo-31307887.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Куртки");
        yield return Make("Куртка песочная укороченная", "Куртка прямого кроя, песочный оттенок, подходит на межсезонье.", 21600, null, 8, categoryId, Gender.Female, "https://images.pexels.com/photos/11929019/pexels-photo-11929019.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Куртки");
        yield return Make("Куртка синяя оверсайз", "Куртка прямого кроя, синий оттенок, подходит на межсезонье.", 21200, null, 7, categoryId, Gender.Female, "https://images.pexels.com/photos/39647617/pexels-photo-39647617.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Куртки");
        yield return Make("Пальто синее классическое", "Пальто из плотной шерстяной смеси, синий оттенок, классический крой.", 30600, 24400, 14, categoryId, Gender.Female, "https://images.pexels.com/photos/6532108/pexels-photo-6532108.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пальто");
        yield return Make("Пальто бежевое оверсайз", "Пальто из плотной шерстяной смеси, бежевый оттенок, классический крой.", 31600, 25200, 6, categoryId, Gender.Female, "https://images.pexels.com/photos/16115837/pexels-photo-16115837.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пальто");
        yield return Make("Пальто бордовое приталенное", "Пальто из плотной шерстяной смеси, бордовый оттенок, классический крой.", 30500, null, 11, categoryId, Gender.Female, "https://images.pexels.com/photos/14589738/pexels-photo-14589738.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пальто");
        yield return Make("Пальто оливковое длинное", "Пальто из плотной шерстяной смеси, оливковый оттенок, классический крой.", 28000, null, 15, categoryId, Gender.Female, "https://images.pexels.com/photos/19354454/pexels-photo-19354454.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пальто");
        yield return Make("Жакет коричневый приталенный", "Жакет из костюмной ткани, коричневый оттенок, приталенный силуэт.", 21300, 18100, 21, categoryId, Gender.Female, "https://images.pexels.com/photos/4816596/pexels-photo-4816596.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пиджаки и жакеты");
        yield return Make("Пиджак серый однобортный", "Жакет из костюмной ткани, серый оттенок, приталенный силуэт.", 21400, null, 16, categoryId, Gender.Female, "https://images.pexels.com/photos/34909494/pexels-photo-34909494.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пиджаки и жакеты");
        yield return Make("Жакет чёрный классический", "Жакет из костюмной ткани, чёрный оттенок, приталенный силуэт.", 25000, null, 17, categoryId, Gender.Female, "https://images.pexels.com/photos/7970146/pexels-photo-7970146.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пиджаки и жакеты");
        yield return Make("Пиджак бордовый оверсайз", "Жакет из костюмной ткани, бордовый оттенок, приталенный силуэт.", 19500, 15600, 20, categoryId, Gender.Female, "https://images.pexels.com/photos/14631245/pexels-photo-14631245.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пиджаки и жакеты");
        yield return Make("Жакет графитовый костюмный", "Жакет из костюмной ткани, графитовый оттенок, приталенный силуэт.", 22100, 18700, 16, categoryId, Gender.Female, "https://images.pexels.com/photos/33402246/pexels-photo-33402246.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пиджаки и жакеты");
        yield return Make("Платье терракотовое прямого кроя", "Платье из плотной ткани, терракотовый оттенок, женственный силуэт.", 16500, null, 6, categoryId, Gender.Female, "https://images.pexels.com/photos/29124227/pexels-photo-29124227.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Платья");
        yield return Make("Платье графитовое приталенное", "Платье из плотной ткани, графитовый оттенок, женственный силуэт.", 17300, 13800, 5, categoryId, Gender.Female, "https://images.pexels.com/photos/39398487/pexels-photo-39398487.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Платья");
        yield return Make("Платье синее вечернее", "Платье из плотной ткани, синий оттенок, женственный силуэт.", 14400, 11800, 20, categoryId, Gender.Female, "https://images.pexels.com/photos/25111218/pexels-photo-25111218.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Платья");
    }

    private static IEnumerable<Product> BuildMenExtra(int categoryId)
    {
        yield return Make("Брюки тёмно-синие прямого кроя", "Брюки из плотного хлопка, тёмно-синий оттенок, прямой крой.", 11100, 9400, 6, categoryId, Gender.Male, "https://images.pexels.com/photos/2897533/pexels-photo-2897533.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Брюки");
        yield return Make("Брюки пудровые чинос", "Брюки из плотного хлопка, пудровый оттенок, прямой крой.", 13900, 11300, 14, categoryId, Gender.Male, "https://images.pexels.com/photos/22021124/pexels-photo-22021124.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Брюки");
        yield return Make("Брюки терракотовые классические", "Брюки из плотного хлопка, терракотовый оттенок, прямой крой.", 11700, null, 6, categoryId, Gender.Male, "https://images.pexels.com/photos/9464625/pexels-photo-9464625.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Брюки");
        yield return Make("Брюки серые зауженные", "Брюки из плотного хлопка, серый оттенок, прямой крой.", 13700, null, 5, categoryId, Gender.Male, "https://images.pexels.com/photos/29503794/pexels-photo-29503794.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Брюки");
        yield return Make("Брюки бордовые широкие", "Брюки из плотного хлопка, бордовый оттенок, прямой крой.", 15600, null, 8, categoryId, Gender.Male, "https://images.pexels.com/photos/37897865/pexels-photo-37897865.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Брюки");
        yield return Make("Пиджак коричневый однобортный", "Пиджак из костюмной ткани, коричневый оттенок, приталенный силуэт.", 29700, null, 6, categoryId, Gender.Male, "https://images.pexels.com/photos/15692014/pexels-photo-15692014.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пиджаки и жакеты");
        yield return Make("Пиджак бордовый приталенный", "Пиджак из костюмной ткани, бордовый оттенок, приталенный силуэт.", 25900, 20700, 12, categoryId, Gender.Male, "https://images.pexels.com/photos/20131887/pexels-photo-20131887.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пиджаки и жакеты");
        yield return Make("Пиджак бежевый двубортный", "Пиджак из костюмной ткани, бежевый оттенок, приталенный силуэт.", 30200, null, 16, categoryId, Gender.Male, "https://images.pexels.com/photos/27687921/pexels-photo-27687921.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пиджаки и жакеты");
        yield return Make("Пиджак пудровый классический", "Пиджак из костюмной ткани, пудровый оттенок, приталенный силуэт.", 32300, null, 18, categoryId, Gender.Male, "https://images.pexels.com/photos/29849069/pexels-photo-29849069.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пиджаки и жакеты");
        yield return Make("Пиджак серый костюмный", "Пиджак из костюмной ткани, серый оттенок, приталенный силуэт.", 31800, 27000, 4, categoryId, Gender.Male, "https://images.pexels.com/photos/18851488/pexels-photo-18851488.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пиджаки и жакеты");
        yield return Make("Пиджак чёрный офисный", "Пиджак из костюмной ткани, чёрный оттенок, приталенный силуэт.", 28800, null, 19, categoryId, Gender.Male, "https://images.pexels.com/photos/11189139/pexels-photo-11189139.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пиджаки и жакеты");
        yield return Make("Рубашка изумрудная приталенная", "Рубашка из хлопка, изумрудный оттенок, длинный рукав.", 12200, 10000, 18, categoryId, Gender.Male, "https://images.pexels.com/photos/39317887/pexels-photo-39317887.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Рубашки");
        yield return Make("Рубашка тёмно-синяя классическая", "Рубашка из хлопка, тёмно-синий оттенок, длинный рукав.", 12000, null, 14, categoryId, Gender.Male, "https://images.pexels.com/photos/38876516/pexels-photo-38876516.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Рубашки");
        yield return Make("Рубашка бордовая оксфорд", "Рубашка из хлопка, бордовый оттенок, длинный рукав.", 11400, null, 10, categoryId, Gender.Male, "https://images.pexels.com/photos/9522507/pexels-photo-9522507.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Рубашки");
        yield return Make("Рубашка терракотовая свободного кроя", "Рубашка из хлопка, терракотовый оттенок, длинный рукав.", 12900, 10300, 10, categoryId, Gender.Male, "https://images.pexels.com/photos/32778911/pexels-photo-32778911.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Рубашки");
        yield return Make("Рубашка синяя однотонная", "Рубашка из хлопка, синий оттенок, длинный рукав.", 11300, 9200, 10, categoryId, Gender.Male, "https://images.pexels.com/photos/10690912/pexels-photo-10690912.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Рубашки");
        yield return Make("Рубашка бежевая повседневная", "Рубашка из хлопка, бежевый оттенок, длинный рукав.", 9700, 7900, 5, categoryId, Gender.Male, "https://images.pexels.com/photos/17849411/pexels-photo-17849411.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Рубашки");
        yield return Make("Свитер чёрный трикотажный", "Свитер из мягкой пряжи, чёрный оттенок, приталенный крой.", 14400, null, 18, categoryId, Gender.Male, "https://images.pexels.com/photos/31888154/pexels-photo-31888154.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Свитеры");
        yield return Make("Джемпер тёмно-синий шерстяной", "Свитер из мягкой пряжи, тёмно-синий оттенок, приталенный крой.", 11900, 9500, 12, categoryId, Gender.Male, "https://images.pexels.com/photos/12338846/pexels-photo-12338846.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Свитеры");
        yield return Make("Свитер пудровый с горлом", "Свитер из мягкой пряжи, пудровый оттенок, приталенный крой.", 13700, 11600, 12, categoryId, Gender.Male, "https://images.pexels.com/photos/14966493/pexels-photo-14966493.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Свитеры");
        yield return Make("Джемпер бордовый прямого кроя", "Свитер из мягкой пряжи, бордовый оттенок, приталенный крой.", 13500, 11400, 22, categoryId, Gender.Male, "https://images.pexels.com/photos/28452452/pexels-photo-28452452.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Свитеры");
        yield return Make("Свитер синий крупной вязки", "Свитер из мягкой пряжи, синий оттенок, приталенный крой.", 10000, null, 16, categoryId, Gender.Male, "https://images.pexels.com/photos/36316077/pexels-photo-36316077.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Свитеры");
        yield return Make("Куртка пудровая кожаная", "Куртка из искусственной кожи, пудровый оттенок, на молнии.", 23100, null, 12, categoryId, Gender.Male, "https://images.pexels.com/photos/32612433/pexels-photo-32612433.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Куртки");
        yield return Make("Худи оливковое мужское", "Худи из плотного футера, оливковый оттенок, свободный крой.", 9900, 7900, 18, categoryId, Gender.Male, "https://images.pexels.com/photos/10816575/pexels-photo-10816575.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Худи");
        yield return Make("Худи бежевое оверсайз мужское", "Худи из плотного футера, бежевый оттенок, свободный крой.", 10400, null, 12, categoryId, Gender.Male, "https://images.pexels.com/photos/6140705/pexels-photo-6140705.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Худи");
        yield return Make("Худи чёрное с принтом мужское", "Худи из плотного футера, чёрный оттенок, свободный крой.", 11200, 9200, 9, categoryId, Gender.Male, "https://images.pexels.com/photos/5825332/pexels-photo-5825332.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Худи");
        yield return Make("Худи песочное мужское", "Худи из плотного футера, песочный оттенок, свободный крой.", 9600, null, 20, categoryId, Gender.Male, "https://images.pexels.com/photos/33740371/pexels-photo-33740371.png?auto=compress&cs=tinysrgb&h=650&w=940", "Худи");
        yield return Make("Худи графитовое мужское", "Худи из плотного футера, графитовый оттенок, свободный крой.", 10900, 8700, 15, categoryId, Gender.Male, "https://images.pexels.com/photos/4082538/pexels-photo-4082538.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Худи");
        yield return Make("Худи тёмно-синее мужское", "Худи из плотного футера, тёмно-синий оттенок, свободный крой.", 10200, null, 7, categoryId, Gender.Male, "https://images.pexels.com/photos/14189676/pexels-photo-14189676.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Худи");
    }

    private static IEnumerable<Product> BuildKidsExtra(int categoryId)
    {
        yield return Make("Блузка синяя для девочки", "Хлопковая блузка для девочки, синий оттенок, мягкая ткань.", 5600, 4700, 16, categoryId, Gender.Kids, "https://images.pexels.com/photos/717208/pexels-photo-717208.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Блузки");
        yield return Make("Блузка молочная хлопковая детская", "Хлопковая блузка для девочки, молочный оттенок, мягкая ткань.", 5800, null, 10, categoryId, Gender.Kids, "https://images.pexels.com/photos/30210365/pexels-photo-30210365.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Блузки");
        yield return Make("Блузка изумрудная нарядная детская", "Хлопковая блузка для девочки, изумрудный оттенок, мягкая ткань.", 7400, null, 4, categoryId, Gender.Kids, "https://images.pexels.com/photos/7462541/pexels-photo-7462541.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Блузки");
        yield return Make("Блузка белая с воланами детская", "Хлопковая блузка для девочки, белый оттенок, мягкая ткань.", 6600, null, 20, categoryId, Gender.Kids, "https://images.pexels.com/photos/9322330/pexels-photo-9322330.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Блузки");
        yield return Make("Блузка коричневая школьная", "Хлопковая блузка для девочки, коричневый оттенок, мягкая ткань.", 6400, null, 10, categoryId, Gender.Kids, "https://images.pexels.com/photos/18001393/pexels-photo-18001393.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Блузки");
        yield return Make("Блузка тёмно-синяя летняя детская", "Хлопковая блузка для девочки, тёмно-синий оттенок, мягкая ткань.", 5700, null, 7, categoryId, Gender.Kids, "https://images.pexels.com/photos/7169365/pexels-photo-7169365.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Блузки");
        yield return Make("Боди оливковое для малыша", "Боди из мягкого хлопка, оливковый оттенок, кнопки на плечах.", 3100, null, 12, categoryId, Gender.Kids, "https://images.pexels.com/photos/22484670/pexels-photo-22484670.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Боди");
        yield return Make("Боди песочное хлопковое", "Боди из мягкого хлопка, песочный оттенок, кнопки на плечах.", 3300, null, 10, categoryId, Gender.Kids, "https://images.pexels.com/photos/22484671/pexels-photo-22484671.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Боди");
        yield return Make("Боди изумрудное с кнопками", "Боди из мягкого хлопка, изумрудный оттенок, кнопки на плечах.", 3800, null, 17, categoryId, Gender.Kids, "https://images.pexels.com/photos/7973669/pexels-photo-7973669.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Боди");
        yield return Make("Боди терракотовое для новорождённого", "Боди из мягкого хлопка, терракотовый оттенок, кнопки на плечах.", 3800, 3200, 14, categoryId, Gender.Kids, "https://images.pexels.com/photos/30435363/pexels-photo-30435363.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Боди");
        yield return Make("Боди бежевое базовое", "Боди из мягкого хлопка, бежевый оттенок, кнопки на плечах.", 3600, null, 8, categoryId, Gender.Kids, "https://images.pexels.com/photos/15067460/pexels-photo-15067460.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Боди");
        yield return Make("Боди чёрное на лето", "Боди из мягкого хлопка, чёрный оттенок, кнопки на плечах.", 3300, 2800, 20, categoryId, Gender.Kids, "https://images.pexels.com/photos/18285728/pexels-photo-18285728.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Боди");
        yield return Make("Спортивный костюм бордовый детский", "Спортивный костюм из футера, бордовый оттенок, свободный крой.", 12200, null, 21, categoryId, Gender.Kids, "https://images.pexels.com/photos/14571364/pexels-photo-14571364.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Костюмы");
        yield return Make("Костюм чёрный для мальчика", "Спортивный костюм из футера, чёрный оттенок, свободный крой.", 10500, 8600, 10, categoryId, Gender.Kids, "https://images.pexels.com/photos/31637477/pexels-photo-31637477.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Костюмы");
        yield return Make("Костюм тёмно-синий для девочки", "Спортивный костюм из футера, тёмно-синий оттенок, свободный крой.", 10800, null, 21, categoryId, Gender.Kids, "https://images.pexels.com/photos/36073179/pexels-photo-36073179.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Костюмы");
        yield return Make("Костюм бежевый прогулочный детский", "Спортивный костюм из футера, бежевый оттенок, свободный крой.", 12200, 10000, 10, categoryId, Gender.Kids, "https://images.pexels.com/photos/34043982/pexels-photo-34043982.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Костюмы");
        yield return Make("Костюм синий трикотажный детский", "Спортивный костюм из футера, синий оттенок, свободный крой.", 11500, null, 20, categoryId, Gender.Kids, "https://images.pexels.com/photos/36073185/pexels-photo-36073185.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Костюмы");
        yield return Make("Костюм коричневый флисовый детский", "Спортивный костюм из футера, коричневый оттенок, свободный крой.", 8900, null, 4, categoryId, Gender.Kids, "https://images.pexels.com/photos/14571343/pexels-photo-14571343.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Костюмы");
        yield return Make("Куртка серая детская демисезонная", "Куртка с капюшоном, серый оттенок, лёгкая подкладка.", 11500, null, 16, categoryId, Gender.Kids, "https://images.pexels.com/photos/13732520/pexels-photo-13732520.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Куртки");
        yield return Make("Куртка коричневая для мальчика", "Куртка с капюшоном, коричневый оттенок, лёгкая подкладка.", 10600, 8600, 8, categoryId, Gender.Kids, "https://images.pexels.com/photos/6034785/pexels-photo-6034785.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Куртки");
        yield return Make("Куртка бежевая для девочки", "Куртка с капюшоном, бежевый оттенок, лёгкая подкладка.", 11000, 9000, 20, categoryId, Gender.Kids, "https://images.pexels.com/photos/35244458/pexels-photo-35244458.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Куртки");
        yield return Make("Куртка песочная джинсовая детская", "Куртка с капюшоном, песочный оттенок, лёгкая подкладка.", 10900, 8900, 4, categoryId, Gender.Kids, "https://images.pexels.com/photos/38778561/pexels-photo-38778561.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Куртки");
        yield return Make("Пальто синее зимнее детское", "Тёплое пальто с капюшоном, синий оттенок, зимний вариант.", 13400, null, 7, categoryId, Gender.Kids, "https://images.pexels.com/photos/4260394/pexels-photo-4260394.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пальто");
        yield return Make("Пуховик тёмно-синий для девочки", "Тёплое пальто с капюшоном, тёмно-синий оттенок, зимний вариант.", 15000, null, 7, categoryId, Gender.Kids, "https://images.pexels.com/photos/29189974/pexels-photo-29189974.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пальто");
        yield return Make("Пуховик бордовый для мальчика", "Тёплое пальто с капюшоном, бордовый оттенок, зимний вариант.", 15100, null, 10, categoryId, Gender.Kids, "https://images.pexels.com/photos/19869874/pexels-photo-19869874.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пальто");
        yield return Make("Пальто изумрудное с капюшоном детское", "Тёплое пальто с капюшоном, изумрудный оттенок, зимний вариант.", 15200, null, 4, categoryId, Gender.Kids, "https://images.pexels.com/photos/11111822/pexels-photo-11111822.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пальто");
        yield return Make("Пуховик оливковый детский тёплый", "Тёплое пальто с капюшоном, оливковый оттенок, зимний вариант.", 14300, null, 20, categoryId, Gender.Kids, "https://images.pexels.com/photos/11628209/pexels-photo-11628209.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пальто");
        yield return Make("Пальто молочное демисезонное детское", "Тёплое пальто с капюшоном, молочный оттенок, зимний вариант.", 15800, 12600, 21, categoryId, Gender.Kids, "https://images.pexels.com/photos/31484621/pexels-photo-31484621.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Пальто");
        yield return Make("Платье чёрное для девочки", "Платье из хлопка, чёрный оттенок, удобный крой для ребёнка.", 8700, null, 10, categoryId, Gender.Kids, "https://images.pexels.com/photos/18476125/pexels-photo-18476125.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Платья");
        yield return Make("Платье коричневое хлопковое детское", "Платье из хлопка, коричневый оттенок, удобный крой для ребёнка.", 8300, null, 7, categoryId, Gender.Kids, "https://images.pexels.com/photos/38247111/pexels-photo-38247111.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Платья");
        yield return Make("Платье оливковое нарядное детское", "Платье из хлопка, оливковый оттенок, удобный крой для ребёнка.", 6300, null, 8, categoryId, Gender.Kids, "https://images.pexels.com/photos/8497598/pexels-photo-8497598.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Платья");
        yield return Make("Платье белое летнее детское", "Платье из хлопка, белый оттенок, удобный крой для ребёнка.", 8200, 6700, 7, categoryId, Gender.Kids, "https://images.pexels.com/photos/36691792/pexels-photo-36691792.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Платья");
        yield return Make("Платье пудровое повседневное детское", "Платье из хлопка, пудровый оттенок, удобный крой для ребёнка.", 7200, null, 17, categoryId, Gender.Kids, "https://images.pexels.com/photos/4711737/pexels-photo-4711737.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Платья");
        yield return Make("Футболка графитовая детская", "Базовая футболка из хлопка, графитовый оттенок.", 3400, null, 10, categoryId, Gender.Kids, "https://images.pexels.com/photos/7144648/pexels-photo-7144648.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Футболки");
        yield return Make("Футболка молочная для мальчика", "Базовая футболка из хлопка, молочный оттенок.", 2700, null, 4, categoryId, Gender.Kids, "https://images.pexels.com/photos/27990627/pexels-photo-27990627.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Футболки");
        yield return Make("Футболка пудровая базовая детская", "Базовая футболка из хлопка, пудровый оттенок.", 2600, null, 20, categoryId, Gender.Kids, "https://images.pexels.com/photos/8632212/pexels-photo-8632212.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Футболки");
        yield return Make("Футболка синяя хлопковая детская", "Базовая футболка из хлопка, синий оттенок.", 3500, null, 10, categoryId, Gender.Kids, "https://images.pexels.com/photos/32071161/pexels-photo-32071161.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Футболки");
        yield return Make("Худи графитовое детское", "Худи с капюшоном, графитовый оттенок, тёплый футер.", 7600, null, 20, categoryId, Gender.Kids, "https://images.pexels.com/photos/7849950/pexels-photo-7849950.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Худи");
        yield return Make("Худи тёмно-синее для мальчика", "Худи с капюшоном, тёмно-синий оттенок, тёплый футер.", 7500, 6300, 15, categoryId, Gender.Kids, "https://images.pexels.com/photos/6623779/pexels-photo-6623779.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Худи");
        yield return Make("Худи молочное для девочки", "Худи с капюшоном, молочный оттенок, тёплый футер.", 6400, null, 5, categoryId, Gender.Kids, "https://images.pexels.com/photos/14571345/pexels-photo-14571345.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Худи");
        yield return Make("Худи оливковое с капюшоном детское", "Худи с капюшоном, оливковый оттенок, тёплый футер.", 7000, 5700, 15, categoryId, Gender.Kids, "https://images.pexels.com/photos/14544401/pexels-photo-14544401.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Худи");
        yield return Make("Худи терракотовое тёплое детское", "Худи с капюшоном, терракотовый оттенок, тёплый футер.", 8700, 6900, 9, categoryId, Gender.Kids, "https://images.pexels.com/photos/7134016/pexels-photo-7134016.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Худи");
        yield return Make("Худи синее спортивное детское", "Худи с капюшоном, синий оттенок, тёплый футер.", 6700, null, 4, categoryId, Gender.Kids, "https://images.pexels.com/photos/6093535/pexels-photo-6093535.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Худи");
    }

    private static IEnumerable<Product> BuildShoesAndBagsExtra(int categoryId)
    {
        yield return Make("Ботинки изумрудные кожаные", "Ботинки из качественной кожи, изумрудный оттенок, устойчивая подошва.", 25000, 20500, 21, categoryId, Gender.Female, "https://images.pexels.com/photos/27639594/pexels-photo-27639594.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Ботинки");
        yield return Make("Ботинки бордовые замшевые", "Ботинки из качественной кожи, бордовый оттенок, устойчивая подошва.", 24600, null, 9, categoryId, Gender.Female, "https://images.pexels.com/photos/30272899/pexels-photo-30272899.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Ботинки");
        yield return Make("Ботинки коричневые на шнуровке", "Ботинки из качественной кожи, коричневый оттенок, устойчивая подошва.", 25000, 20000, 6, categoryId, Gender.Female, "https://images.pexels.com/photos/27608725/pexels-photo-27608725.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Ботинки");
        yield return Make("Ботинки чёрные высокие", "Ботинки из качественной кожи, чёрный оттенок, устойчивая подошва.", 24200, 19300, 4, categoryId, Gender.Female, "https://images.pexels.com/photos/30156822/pexels-photo-30156822.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Ботинки");
        yield return Make("Кроссовки оливковые текстильные", "Лёгкие кроссовки, оливковый оттенок, дышащий верх.", 19300, null, 19, categoryId, Gender.Female, "https://images.pexels.com/photos/27204251/pexels-photo-27204251.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кроссовки");
        yield return Make("Кроссовки терракотовые лёгкие", "Лёгкие кроссовки, терракотовый оттенок, дышащий верх.", 21000, 16800, 16, categoryId, Gender.Female, "https://images.pexels.com/photos/27503497/pexels-photo-27503497.png?auto=compress&cs=tinysrgb&h=650&w=940", "Кроссовки");
        yield return Make("Сумка синяя кожаная", "Сумка из плотной кожи, синий оттенок, вместительное отделение.", 17900, 14600, 12, categoryId, Gender.Female, "https://images.pexels.com/photos/27174573/pexels-photo-27174573.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Сумки");
        yield return Make("Сумка тёмно-синяя структурная", "Сумка из плотной кожи, тёмно-синий оттенок, вместительное отделение.", 23600, 20000, 20, categoryId, Gender.Female, "https://images.pexels.com/photos/27100523/pexels-photo-27100523.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Сумки");
        yield return Make("Кроссовки детские белые с полосками", "Лёгкие детские кроссовки на шнуровке с контрастными вставками.", 12900, 10300, 18, categoryId, Gender.Kids, "https://images.pexels.com/photos/39516826/pexels-photo-39516826.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кроссовки");
        yield return Make("Кроссовки детские бежевые текстильные", "Мягкие текстильные кроссовки с резиновым носком, удобная колодка.", 9900, null, 24, categoryId, Gender.Kids, "https://images.pexels.com/photos/20406227/pexels-photo-20406227.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кроссовки");
        yield return Make("Кроссовки детские бирюзовые с принтом", "Яркие кроссовки на эластичных шнурках с мелким принтом.", 10900, 8700, 15, categoryId, Gender.Kids, "https://images.pexels.com/photos/15844910/pexels-photo-15844910.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кроссовки");
        yield return Make("Ботинки детские резиновые красные с зайчиками", "Непромокаемые резиновые ботинки с ремешком, весёлый принт.", 11900, null, 20, categoryId, Gender.Kids, "https://images.pexels.com/photos/37722620/pexels-photo-37722620.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Ботинки");
        yield return Make("Ботинки детские резиновые красные", "Резиновые ботинки для дождливой погоды, рифлёная подошва.", 10500, 8400, 22, categoryId, Gender.Kids, "https://images.pexels.com/photos/29662118/pexels-photo-29662118.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Ботинки");
        yield return Make("Ботинки детские кожаные коричневые", "Кожаные ботинки на шнуровке, мягкая подошва.", 14900, null, 12, categoryId, Gender.Kids, "https://images.pexels.com/photos/13822967/pexels-photo-13822967.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Ботинки");
        yield return Make("Сумка-рюкзак детская розовая", "Компактный рюкзак на две лямки с верхним клапаном.", 8900, 7100, 25, categoryId, Gender.Kids, "https://images.pexels.com/photos/4910563/pexels-photo-4910563.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Сумки");
        yield return Make("Сумка-рюкзак школьная фиолетовая", "Школьный рюкзак с жёсткой спинкой и вместительным отделением.", 17900, 14300, 14, categoryId, Gender.Kids, "https://images.pexels.com/photos/4887244/pexels-photo-4887244.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Сумки");
        yield return Make("Сумка-рюкзак детская жёлтая с нашивками", "Глянцевый рюкзак с декоративными нашивками и регулируемыми лямками.", 13900, null, 16, categoryId, Gender.Kids, "https://images.pexels.com/photos/934673/pexels-photo-934673.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Сумки");
        yield return Make("Сумка-рюкзак детская с цветочным принтом", "Рюкзак с цветочным принтом, мягкие лямки и внешний карман.", 15900, 12700, 10, categoryId, Gender.Kids, "https://images.pexels.com/photos/4887255/pexels-photo-4887255.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Сумки");
    }

    private static IEnumerable<Product> BuildAppliancesExtra(int categoryId)
    {
        yield return Make("Вентилятор ретро бежевый", "Настольный вентилятор в ретро-корпусе, бежевый оттенок.", 18300, null, 5, categoryId, Gender.Female, "https://images.pexels.com/photos/10450623/pexels-photo-10450623.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Вентиляторы");
        yield return Make("Микроволновая печь чёрная встраиваемая", "Микроволновая печь, чёрный корпус, несколько режимов мощности.", 76800, null, 13, categoryId, Gender.Male, "https://images.pexels.com/photos/32269126/pexels-photo-32269126.png?auto=compress&cs=tinysrgb&h=650&w=940", "Микроволновки");
        yield return Make("Микроволновая печь белая соло", "Микроволновая печь, белый корпус, несколько режимов мощности.", 60500, 48400, 22, categoryId, Gender.Male, "https://images.pexels.com/photos/16927363/pexels-photo-16927363.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Микроволновки");
        yield return Make("Наушники белые беспроводные", "Аудиотехника, белый корпус, длительная работа от батареи.", 20300, null, 12, categoryId, Gender.Male, "https://images.pexels.com/photos/3394648/pexels-photo-3394648.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Наушники и колонки");
        yield return Make("Колонка молочная портативная", "Аудиотехника, молочный корпус, длительная работа от батареи.", 24500, 20800, 7, categoryId, Gender.Male, "https://images.pexels.com/photos/33298190/pexels-photo-33298190.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Наушники и колонки");
        yield return Make("Наушники коричневые накладные", "Аудиотехника, коричневый корпус, длительная работа от батареи.", 24100, null, 8, categoryId, Gender.Male, "https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Наушники и колонки");
        yield return Make("Плита синяя газовая настольная", "Кухонная плита, синий корпус, эмалированное покрытие.", 51200, 40900, 17, categoryId, Gender.Male, "https://images.pexels.com/photos/16927367/pexels-photo-16927367.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Плиты и духовки");
        yield return Make("Духовой шкаф коричневый отдельностоящий", "Кухонная плита, коричневый корпус, эмалированное покрытие.", 68200, null, 22, categoryId, Gender.Male, "https://images.pexels.com/photos/36240645/pexels-photo-36240645.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Плиты и духовки");
        yield return Make("Тостер пудровый на 2 тоста", "Классический тостер, пудровый корпус, регулировка прожарки.", 13600, 11500, 22, categoryId, Gender.Male, "https://images.pexels.com/photos/17210074/pexels-photo-17210074.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Тостеры");
        yield return Make("Холодильник тёмно-синий однокамерный", "Холодильник, тёмно-синий корпус, вместительная камера.", 150800, 123600, 4, categoryId, Gender.Female, "https://images.pexels.com/photos/38853682/pexels-photo-38853682.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Холодильники");
        yield return Make("Холодильник оливковый встраиваемый", "Холодильник, оливковый корпус, вместительная камера.", 213700, 170900, 21, categoryId, Gender.Female, "https://images.pexels.com/photos/38609262/pexels-photo-38609262.png?auto=compress&cs=tinysrgb&h=650&w=940", "Холодильники");
        yield return Make("Чайник электрический тёмно-синий", "Электрический чайник, тёмно-синий корпус, автоотключение.", 16000, 13600, 8, categoryId, Gender.Female, "https://images.pexels.com/photos/10900909/pexels-photo-10900909.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Чайники");
        yield return Make("Чайник чёрный для пуровера", "Электрический чайник, чёрный корпус, автоотключение.", 19200, null, 7, categoryId, Gender.Female, "https://images.pexels.com/photos/21404851/pexels-photo-21404851.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Чайники");
    }

    private static IEnumerable<Product> BuildSportExtra(int categoryId)
    {
        yield return Make("Кроссовки чёрные беговые", "Спортивные кроссовки, чёрный оттенок, амортизирующая подошва.", 23700, null, 9, categoryId, Gender.Male, "https://images.pexels.com/photos/24702077/pexels-photo-24702077.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кроссовки");
        yield return Make("Кроссовки песочные для тренировок", "Спортивные кроссовки, песочный оттенок, амортизирующая подошва.", 24600, null, 22, categoryId, Gender.Male, "https://images.pexels.com/photos/2404959/pexels-photo-2404959.png?auto=compress&cs=tinysrgb&h=650&w=940", "Кроссовки");
        yield return Make("Кроссовки бордовые лёгкоатлетические", "Спортивные кроссовки, бордовый оттенок, амортизирующая подошва.", 22500, null, 14, categoryId, Gender.Male, "https://images.pexels.com/photos/19577866/pexels-photo-19577866.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кроссовки");
        yield return Make("Кроссовки синие повседневные унисекс", "Спортивные кроссовки, синий оттенок, амортизирующая подошва.", 22400, null, 17, categoryId, Gender.Male, "https://images.pexels.com/photos/19577867/pexels-photo-19577867.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кроссовки");
        yield return Make("Гиря серая для домашних тренировок", "Гиря для силовых тренировок дома, серый корпус.", 50200, null, 14, categoryId, Gender.Male, "https://images.pexels.com/photos/32610335/pexels-photo-32610335.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Тренажёры");
        yield return Make("Эспандер кистевой чёрный", "Эспандер для тренировки хвата, чёрный корпус, регулировка нагрузки.", 4900, 4000, 15, categoryId, Gender.Male, "https://images.pexels.com/photos/6824816/pexels-photo-6824816.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Экипировка");
    }

    private static IEnumerable<Product> BuildDishesExtra(int categoryId)
    {
        yield return Make("Бокал чёрный для вина", "Бокал из тонкого стекла, чёрный оттенок, на высокой ножке.", 6300, 5100, 20, categoryId, Gender.Female, "https://images.pexels.com/photos/15503675/pexels-photo-15503675.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Бокалы");
        yield return Make("Набор бокалов молочный, 2 шт", "Бокал из тонкого стекла, молочный оттенок, на высокой ножке.", 4900, 4000, 4, categoryId, Gender.Female, "https://images.pexels.com/photos/9639902/pexels-photo-9639902.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Бокалы");
        yield return Make("Бокал бордовый для красного вина", "Бокал из тонкого стекла, бордовый оттенок, на высокой ножке.", 5700, null, 22, categoryId, Gender.Female, "https://images.pexels.com/photos/26647497/pexels-photo-26647497.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Бокалы");
        yield return Make("Бокал серый тонкого стекла", "Бокал из тонкого стекла, серый оттенок, на высокой ножке.", 5800, null, 22, categoryId, Gender.Female, "https://images.pexels.com/photos/37794986/pexels-photo-37794986.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Бокалы");
        yield return Make("Бокал бежевый для белого вина", "Бокал из тонкого стекла, бежевый оттенок, на высокой ножке.", 5700, null, 21, categoryId, Gender.Female, "https://images.pexels.com/photos/11177974/pexels-photo-11177974.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Бокалы");
        yield return Make("Кастрюля серая с крышкой", "Кастрюля с плотно прилегающей крышкой, серый корпус.", 31800, 26000, 4, categoryId, Gender.Female, "https://images.pexels.com/photos/36552082/pexels-photo-36552082.png?auto=compress&cs=tinysrgb&h=650&w=940", "Кастрюли");
        yield return Make("Кружка серая керамическая", "Керамическая кружка, серый оттенок, объём 350 мл.", 5200, 4200, 6, categoryId, Gender.Female, "https://images.pexels.com/photos/31785816/pexels-photo-31785816.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кружки и чашки");
        yield return Make("Чашка пудровая для капучино", "Керамическая кружка, пудровый оттенок, объём 350 мл.", 2900, null, 8, categoryId, Gender.Female, "https://images.pexels.com/photos/3187013/pexels-photo-3187013.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кружки и чашки");
        yield return Make("Кружка синяя в полоску", "Керамическая кружка, синий оттенок, объём 350 мл.", 3200, null, 17, categoryId, Gender.Female, "https://images.pexels.com/photos/12480291/pexels-photo-12480291.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кружки и чашки");
        yield return Make("Кружка бежевая авторская", "Керамическая кружка, бежевый оттенок, объём 350 мл.", 3600, null, 19, categoryId, Gender.Female, "https://images.pexels.com/photos/34299318/pexels-photo-34299318.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кружки и чашки");
        yield return Make("Ложка и лопатка графитовые деревянные", "Кухонные аксессуары, графитовый оттенок, для повседневного использования.", 7800, null, 17, categoryId, Gender.Female, "https://images.pexels.com/photos/6246099/pexels-photo-6246099.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кухонные аксессуары");
        yield return Make("Набор для специй чёрный", "Кухонные аксессуары, чёрный оттенок, для повседневного использования.", 6100, null, 16, categoryId, Gender.Female, "https://images.pexels.com/photos/35828604/pexels-photo-35828604.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кухонные аксессуары");
        yield return Make("Контейнер кухонный бежевый", "Кухонные аксессуары, бежевый оттенок, для повседневного использования.", 4400, null, 21, categoryId, Gender.Female, "https://images.pexels.com/photos/9698110/pexels-photo-9698110.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кухонные аксессуары");
        yield return Make("Мерный стакан коричневый", "Кухонные аксессуары, коричневый оттенок, для повседневного использования.", 4000, null, 4, categoryId, Gender.Female, "https://images.pexels.com/photos/14207018/pexels-photo-14207018.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Кухонные аксессуары");
        yield return Make("Миска чёрная керамическая", "Керамическая миска, чёрный оттенок, диаметр 16 см.", 4000, 3200, 19, categoryId, Gender.Female, "https://images.pexels.com/photos/12756070/pexels-photo-12756070.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Миски");
        yield return Make("Миска коричневая глубокая", "Керамическая миска, коричневый оттенок, диаметр 16 см.", 3300, null, 13, categoryId, Gender.Female, "https://images.pexels.com/photos/2611817/pexels-photo-2611817.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Миски");
        yield return Make("Набор мисок молочный", "Керамическая миска, молочный оттенок, диаметр 16 см.", 4400, 3500, 5, categoryId, Gender.Female, "https://images.pexels.com/photos/9440473/pexels-photo-9440473.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Миски");
        yield return Make("Миска оливковая для супа", "Керамическая миска, оливковый оттенок, диаметр 16 см.", 4800, null, 22, categoryId, Gender.Female, "https://images.pexels.com/photos/101669/pexels-photo-101669.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Миски");
        yield return Make("Набор кухонных ножей пудровый", "Набор кухонных ножей из нержавеющей стали, пудровые рукояти.", 20500, 16800, 16, categoryId, Gender.Male, "https://images.pexels.com/photos/16443132/pexels-photo-16443132.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Ножи");
        yield return Make("Набор ножей изумрудный на подставке", "Набор кухонных ножей из нержавеющей стали, изумрудные рукояти.", 17100, null, 13, categoryId, Gender.Male, "https://images.pexels.com/photos/16603814/pexels-photo-16603814.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Ножи");
        yield return Make("Нож бордовый поварской", "Набор кухонных ножей из нержавеющей стали, бордовые рукояти.", 22900, null, 21, categoryId, Gender.Male, "https://images.pexels.com/photos/20392658/pexels-photo-20392658.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Ножи");
        yield return Make("Нож молочный универсальный", "Набор кухонных ножей из нержавеющей стали, молочные рукояти.", 21000, null, 19, categoryId, Gender.Male, "https://images.pexels.com/photos/20392663/pexels-photo-20392663.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Ножи");
        yield return Make("Тарелка терракотовая обеденная", "Тарелка из фарфора, терракотовый оттенок, диаметр 26 см.", 3600, null, 11, categoryId, Gender.Female, "https://images.pexels.com/photos/17840025/pexels-photo-17840025.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Тарелки");
        yield return Make("Тарелка бежевая плоская", "Тарелка из фарфора, бежевый оттенок, диаметр 26 см.", 3800, 3100, 15, categoryId, Gender.Female, "https://images.pexels.com/photos/8672632/pexels-photo-8672632.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Тарелки");
        yield return Make("Тарелка изумрудная сервировочная", "Тарелка из фарфора, изумрудный оттенок, диаметр 26 см.", 3100, null, 17, categoryId, Gender.Female, "https://images.pexels.com/photos/15554373/pexels-photo-15554373.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Тарелки");
        yield return Make("Чайник заварочный пудровый", "Заварочный чайник из керамики, пудровый оттенок, с ситечком.", 8300, null, 9, categoryId, Gender.Female, "https://images.pexels.com/photos/29378867/pexels-photo-29378867.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Чайники");
        yield return Make("Чайник чёрный керамический", "Заварочный чайник из керамики, чёрный оттенок, с ситечком.", 7900, 6300, 8, categoryId, Gender.Female, "https://images.pexels.com/photos/5987088/pexels-photo-5987088.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Чайники");
        yield return Make("Сервиз чайный серый", "Заварочный чайник из керамики, серый оттенок, с ситечком.", 8100, 6800, 20, categoryId, Gender.Female, "https://images.pexels.com/photos/18273371/pexels-photo-18273371.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Чайники");
        yield return Make("Чайник бордовый с узором", "Заварочный чайник из керамики, бордовый оттенок, с ситечком.", 8200, null, 18, categoryId, Gender.Female, "https://images.pexels.com/photos/18376883/pexels-photo-18376883.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Чайники");
    }

    private static IEnumerable<Product> BuildAccessoriesExtra(int categoryId)
    {
        yield return Make("Рюкзак синий городской", "Рюкзак из плотного текстиля, синий оттенок, отделение для ноутбука.", 18300, 15000, 9, categoryId, Gender.Male, "https://images.pexels.com/photos/33861296/pexels-photo-33861296.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Рюкзаки");
        yield return Make("Рюкзак бежевый спортивный", "Рюкзак из плотного текстиля, бежевый оттенок, отделение для ноутбука.", 16800, 13700, 6, categoryId, Gender.Male, "https://images.pexels.com/photos/17366606/pexels-photo-17366606.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Рюкзаки");
        yield return Make("Рюкзак терракотовый текстильный", "Рюкзак из плотного текстиля, терракотовый оттенок, отделение для ноутбука.", 18400, 15000, 6, categoryId, Gender.Male, "https://images.pexels.com/photos/8125853/pexels-photo-8125853.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Рюкзаки");
        yield return Make("Кулон коричневый на цепочке", "Кулон на тонкой цепочке, коричневый камень, позолота.", 7600, 6000, 18, categoryId, Gender.Female, "https://images.pexels.com/photos/5442469/pexels-photo-5442469.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Украшения");
        yield return Make("Подвеска бордовая с камнем", "Кулон на тонкой цепочке, бордовый камень, позолота.", 9300, 7900, 10, categoryId, Gender.Female, "https://images.pexels.com/photos/10983782/pexels-photo-10983782.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Украшения");
        yield return Make("Часы наручные изумрудные классические", "Наручные часы, изумрудный корпус, ремешок из качественных материалов.", 25000, 20000, 14, categoryId, Gender.Male, "https://images.pexels.com/photos/6157408/pexels-photo-6157408.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Часы");
        yield return Make("Часы синие спортивные", "Наручные часы, синий корпус, ремешок из качественных материалов.", 27800, null, 22, categoryId, Gender.Male, "https://images.pexels.com/photos/14312717/pexels-photo-14312717.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Часы");
        yield return Make("Часы белые механические", "Наручные часы, белый корпус, ремешок из качественных материалов.", 31900, null, 14, categoryId, Gender.Male, "https://images.pexels.com/photos/33794870/pexels-photo-33794870.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Часы");
        yield return Make("Часы чёрные на кожаном ремешке", "Наручные часы, чёрный корпус, ремешок из качественных материалов.", 31300, null, 6, categoryId, Gender.Male, "https://images.pexels.com/photos/19915596/pexels-photo-19915596.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Часы");
        yield return Make("Часы оливковые минималистичные", "Наручные часы, оливковый корпус, ремешок из качественных материалов.", 22500, 18000, 8, categoryId, Gender.Male, "https://images.pexels.com/photos/15210883/pexels-photo-15210883.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Часы");
        yield return Make("Часы серые хронограф", "Наручные часы, серый корпус, ремешок из качественных материалов.", 24400, 20000, 5, categoryId, Gender.Male, "https://images.pexels.com/photos/28977357/pexels-photo-28977357.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Часы");
        yield return Make("Чехол для телефона бежевый силиконовый", "Чехол для телефона, бежевый цвет, тонкий профиль.", 4700, null, 8, categoryId, Gender.Male, "https://images.pexels.com/photos/7989741/pexels-photo-7989741.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Чехлы");
        yield return Make("Чехол тёмно-синий противоударный", "Чехол для телефона, тёмно-синий цвет, тонкий профиль.", 5400, 4300, 16, categoryId, Gender.Male, "https://images.pexels.com/photos/20321375/pexels-photo-20321375.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Чехлы");
        yield return Make("Чехол синий матовый", "Чехол для телефона, синий цвет, тонкий профиль.", 4900, 4000, 4, categoryId, Gender.Male, "https://images.pexels.com/photos/20321385/pexels-photo-20321385.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Чехлы");
        yield return Make("Чехол коричневый прозрачный", "Чехол для телефона, коричневый цвет, тонкий профиль.", 5700, 4800, 14, categoryId, Gender.Male, "https://images.pexels.com/photos/11120516/pexels-photo-11120516.jpeg?auto=compress&cs=tinysrgb&h=650&w=940", "Чехлы");
    }

    private static string GenerateRandomPassword()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
        var bytes = RandomNumberGenerator.GetBytes(20);
        var result = new char[20];
        for (var i = 0; i < bytes.Length; i++)
        {
            result[i] = chars[bytes[i] % chars.Length];
        }
        return new string(result);
    }
}
