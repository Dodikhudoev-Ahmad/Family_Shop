using Microsoft.EntityFrameworkCore;
using Application.Interfaces;
using Domain.Entities;
using Domain.ValueObjects;

namespace Infrastructure.Persistence;

public static class SeedData
{
    private const string AdminEmail = "admin@familyshop.kz";
    // Generated for the deploy-prep pass — see the chat report for this value.
    // Change it after first login if this seed ever runs against a public database.
    private const string AdminPassword = "1&@X4Y2jaFxe^iH6";
    // A few replacement photos (picked to avoid visible brand logos) live under Unsplash's
    // /flagged/ path instead of the regular CDN path — prefix the id with "flagged/" for those.
    private static string Img(string unsplashId) =>
        unsplashId.StartsWith("flagged/", StringComparison.Ordinal)
            ? $"https://images.unsplash.com/flagged/photo-{unsplashId["flagged/".Length..]}?w=600&h=800&fit=crop&q=80"
            : $"https://images.unsplash.com/photo-{unsplashId}?w=600&h=800&fit=crop&q=80";

    public static async Task SeedAsync(AppDbContext context, IPasswordHasher passwordHasher, CancellationToken cancellationToken = default)
    {
        await context.Database.MigrateAsync(cancellationToken);

        if (!await context.Users.AnyAsync(u => u.Role == UserRole.Admin, cancellationToken))
        {
            context.Users.Add(new User
            {
                Email = new Email(AdminEmail),
                Name = "Администратор",
                PasswordHash = passwordHasher.Hash(AdminPassword),
                Role = UserRole.Admin
            });
            await context.SaveChangesAsync(cancellationToken);
        }

        List<Product> women13, men13, kids13, shoesBags13;

        if (!await context.Categories.AnyAsync(cancellationToken))
        {
            var women = new Category { Name = "Женское", Slug = "women" };
            var men = new Category { Name = "Мужское", Slug = "men" };
            var kids = new Category { Name = "Детское", Slug = "kids" };
            var shoesBags = new Category { Name = "Обувь и сумки", Slug = "shoes-bags" };

            context.Categories.AddRange(women, men, kids, shoesBags);
            await context.SaveChangesAsync(cancellationToken);

            women13 = BuildWomen(women.Id).ToList();
            men13 = BuildMen(men.Id).ToList();
            kids13 = BuildKids(kids.Id).ToList();
            shoesBags13 = BuildShoesAndBags(shoesBags.Id).ToList();

            foreach (var block in new[] { women13, men13, kids13, shoesBags13 })
            {
                for (var i = 0; i < block.Count; i++)
                {
                    // Первые 3 товара блока — "новинки", 4-й и 5-й — "хиты продаж".
                    block[i].CreatedAt = DateTime.UtcNow.AddDays(-i);
                    block[i].IsBestseller = i is 3 or 4;
                }
            }

            var products = women13.Concat(men13).Concat(kids13).Concat(shoesBags13).ToList();

            context.Products.AddRange(products);
            await context.SaveChangesAsync(cancellationToken);
        }
        else
        {
            // Categories/products were already seeded by an earlier run - reload them by
            // category so review seeding (guarded independently below) can still run against
            // a database that already has its catalog populated.
            var categoriesBySlug = await context.Categories.ToDictionaryAsync(c => c.Slug, c => c.Id, cancellationToken);
            women13 = await context.Products.Where(p => p.CategoryId == categoriesBySlug["women"]).OrderBy(p => p.Id).ToListAsync(cancellationToken);
            men13 = await context.Products.Where(p => p.CategoryId == categoriesBySlug["men"]).OrderBy(p => p.Id).ToListAsync(cancellationToken);
            kids13 = await context.Products.Where(p => p.CategoryId == categoriesBySlug["kids"]).OrderBy(p => p.Id).ToListAsync(cancellationToken);
            shoesBags13 = await context.Products.Where(p => p.CategoryId == categoriesBySlug["shoes-bags"]).OrderBy(p => p.Id).ToListAsync(cancellationToken);
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
            .Select(r => new User { Email = new Email(r.Email), Name = r.Name, PasswordHash = passwordHasher.Hash("Seed123!"), Role = UserRole.Customer })
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

    private static Product Make(string name, string description, decimal price, decimal? discountPrice, int stock, int categoryId, Gender gender, string imageId) =>
        new()
        {
            Name = name,
            Description = description,
            Price = new Money(price),
            DiscountPrice = discountPrice.HasValue ? new Money(discountPrice.Value) : null,
            Stock = stock,
            CategoryId = categoryId,
            Gender = gender,
            Images = [Img(imageId)]
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
        yield return Make("Худи с капюшоном серое", "Худи из плотного футера, свободный унисекс-крой.", 10900, 8700, 24, categoryId, Gender.Male, "1594656375376-64d56e2f3ed1");
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
}
