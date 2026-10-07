using System.Text.Json;
using System.Xml.Linq;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using Api.Controllers;
using Application.Services;
using Domain.Entities;
using Domain.ValueObjects;
using Infrastructure.Persistence;

namespace Application.Tests.Integration;

/// <summary>The crawler pages and the sitemap over a real PostgreSQL: real <see cref="SeoService"/>, repositories and controller.</summary>
public class SeoPagesTests : IClassFixture<PostgresFixture>
{
    private const string Site = "https://www.familyshop10.kz";
    private const string Evil = "<script>alert(1)</script>\"'&";
    private static readonly XNamespace Ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

    private readonly PostgresFixture _db;

    public SeoPagesTests(PostgresFixture db) => _db = db;

    private async Task<(SeoController Controller, AppDbContext Context)> ControllerAsync(int cacheSeconds = 0, string? uploadsBase = "https://api.familyshop10.kz")
    {
        var ctx = _db.CreateContext();
        var settings = new SeoSettings(Site, uploadsBase, cacheSeconds);
        var service = new SeoService(new UnitOfWork(ctx), settings, NullLogger<SeoService>.Instance);
        var controller = new SeoController(service, settings, new MemoryCache(new MemoryCacheOptions()))
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        return (controller, ctx);
    }

    private async Task<int> AddCategoryAsync(string? slug = null, string name = "Категория")
    {
        await using var ctx = _db.CreateContext();
        var category = new Category { Name = name, Slug = slug ?? $"c-{Guid.NewGuid():N}", HasSizes = false };
        ctx.Add(category);
        await ctx.SaveChangesAsync();
        return category.Id;
    }

    private async Task<int> AddProductAsync(int categoryId, string name = "Платье", decimal price = 12500, decimal? discount = null, int stock = 5,
        string description = "Лёгкое платье", List<string>? images = null, DateTime? updatedAt = null, decimal rating = 0, int reviews = 0)
    {
        await using var ctx = _db.CreateContext();
        var product = new Product
        {
            Name = name, Description = description, Price = new Money(price), DiscountPrice = discount is null ? null : new Money(discount.Value),
            Stock = stock, CategoryId = categoryId, Images = images ?? ["https://api.familyshop10.kz/uploads/products/a.jpg"],
            AverageRating = rating, ReviewCount = reviews
        };
        if (updatedAt is not null) product.UpdatedAt = updatedAt.Value;
        ctx.Add(product);
        await ctx.SaveChangesAsync();
        return product.Id;
    }

    private static string Body(ContentResult result) => result.Content!;

    // ---------- product page ----------

    [PostgresFact]
    public async Task ProductPage_HasTitleDescriptionCanonicalOgPriceAndJsonLd()
    {
        var category = await AddCategoryAsync();
        var id = await AddProductAsync(category, "Платье летнее", 15000, discount: 12500, rating: 4.5m, reviews: 3);
        var (controller, ctx) = await ControllerAsync();
        await using var _ = ctx;

        var result = await controller.Product(id, default);
        var html = Body(result);

        Assert.Equal(200, result.StatusCode);
        Assert.Equal("text/html; charset=utf-8", result.ContentType);
        Assert.Contains("<title>Платье летнее — 12 500 ₸ | Family Shop</title>", html);
        Assert.Contains("<meta name=\"description\" content=\"Лёгкое платье\">", html);
        Assert.Contains($"<link rel=\"canonical\" href=\"{Site}/product/{id}\">", html);
        Assert.Contains($"<meta property=\"og:url\" content=\"{Site}/product/{id}\">", html);
        Assert.Contains("<meta property=\"og:image\" content=\"https://api.familyshop10.kz/uploads/products/a.jpg\">", html);
        Assert.Contains("<meta property=\"product:price:amount\" content=\"12500\">", html);
        Assert.Contains("<meta property=\"product:price:currency\" content=\"KZT\">", html);
        Assert.Contains("<meta name=\"robots\" content=\"index,follow\">", html);
        Assert.Equal("public, max-age=300", controller.Response.Headers.CacheControl.ToString());

        var ld = JsonDocument.Parse(Between(html, "<script type=\"application/ld+json\">", "</script>")).RootElement;
        Assert.Equal("Product", ld.GetProperty("@type").GetString());
        Assert.Equal("12500", ld.GetProperty("offers").GetProperty("price").GetString());
        Assert.Equal("KZT", ld.GetProperty("offers").GetProperty("priceCurrency").GetString());
        Assert.Equal("https://schema.org/InStock", ld.GetProperty("offers").GetProperty("availability").GetString());
        Assert.Equal(3, ld.GetProperty("aggregateRating").GetProperty("reviewCount").GetInt32());
    }

    [PostgresFact]
    public async Task ProductPage_EscapesWhatTheAdminTyped()
    {
        var category = await AddCategoryAsync();
        var id = await AddProductAsync(category, Evil, description: Evil, images: [$"https://x.example/a.jpg?q={Evil}"]);
        var (controller, ctx) = await ControllerAsync();
        await using var _ = ctx;

        var html = Body(await controller.Product(id, default));

        Assert.DoesNotContain("<script>alert(1)</script>", html);
        Assert.Equal(1, html.Split("<script").Length - 1); // only the JSON-LD block
        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;", html);
        var ld = JsonDocument.Parse(Between(html, "<script type=\"application/ld+json\">", "</script>")).RootElement;
        Assert.Equal(Evil, ld.GetProperty("name").GetString());
    }

    [PostgresFact]
    public async Task ProductPage_OutOfStock_And_NoUsablePhoto_UsesTheDefaultImage()
    {
        var category = await AddCategoryAsync();
        var id = await AddProductAsync(category, stock: 0, images: ["javascript:alert(1)", "/relative/without-origin.jpg"]);
        var (controller, ctx) = await ControllerAsync(uploadsBase: null);
        await using var _ = ctx;

        var html = Body(await controller.Product(id, default));

        Assert.Contains($"<meta property=\"og:image\" content=\"{Site}/og-default.png\">", html);
        Assert.Contains("https://schema.org/OutOfStock", html);
        Assert.DoesNotContain("javascript:", html);
    }

    [PostgresFact]
    public async Task ProductPage_ARelativeUploadPath_IsMadeAbsoluteOnTheUploadsOrigin()
    {
        var category = await AddCategoryAsync();
        var id = await AddProductAsync(category, images: ["/uploads/products/b.jpg"]);
        var (controller, ctx) = await ControllerAsync();
        await using var _ = ctx;

        Assert.Contains("<meta property=\"og:image\" content=\"https://api.familyshop10.kz/uploads/products/b.jpg\">", Body(await controller.Product(id, default)));
    }

    [PostgresFact]
    public async Task ProductPage_UnknownProduct_Is404WithNoindex()
    {
        var (controller, ctx) = await ControllerAsync();
        await using var _ = ctx;

        var result = await controller.Product(int.MaxValue, default);

        Assert.Equal(404, result.StatusCode);
        Assert.Contains("<meta name=\"robots\" content=\"noindex,nofollow\">", Body(result));
        Assert.DoesNotContain("canonical", Body(result));
    }

    // ---------- category page ----------

    [PostgresFact]
    public async Task CategoryPage_HasTheCountAndTheLowestPrice()
    {
        var slug = $"women-{Guid.NewGuid():N}";
        var category = await AddCategoryAsync(slug, "Женское");
        await AddProductAsync(category, price: 15000);
        await AddProductAsync(category, price: 20000, discount: 8000);
        await AddProductAsync(category, price: 12000);
        await AddProductAsync(await AddCategoryAsync(), price: 100); // another category: not counted
        var (controller, ctx) = await ControllerAsync();
        await using var _ = ctx;

        var result = await controller.Category(slug, default);
        var html = Body(result);

        Assert.Equal(200, result.StatusCode);
        Assert.Contains("<title>Женское — купить в Казахстане | Family Shop</title>", html);
        Assert.Contains("Женское: 3 товара в Family Shop. Цены от 8 000 ₸, быстрая доставка по Казахстану.", html);
        Assert.Contains($"<link rel=\"canonical\" href=\"{Site}/catalog/{slug}\">", html);
        Assert.Contains($"<meta property=\"og:image\" content=\"{Site}/og-default.png\">", html);
    }

    [PostgresFact]
    public async Task CategoryPage_EmptyCategory_GetsTheGenericText_AndUnknownSlugIs404WithNoindex()
    {
        var slug = $"empty-{Guid.NewGuid():N}";
        await AddCategoryAsync(slug, "Посуда");
        var (controller, ctx) = await ControllerAsync();
        await using var _ = ctx;

        Assert.Contains("Каталог «Посуда» в интернет-магазине Family Shop: широкий выбор", Body(await controller.Category(slug, default)));

        var missing = await controller.Category("no-such-category", default);
        Assert.Equal(404, missing.StatusCode);
        Assert.Contains("noindex,nofollow", Body(missing));

        var tooLong = await controller.Category(new string('a', 101), default);
        Assert.Equal(404, tooLong.StatusCode);
    }

    [PostgresFact]
    public async Task CategoryPage_EscapesTheName()
    {
        var slug = $"evil-{Guid.NewGuid():N}";
        await AddCategoryAsync(slug, Evil);
        var (controller, ctx) = await ControllerAsync();
        await using var _ = ctx;

        var html = Body(await controller.Category(slug, default));

        Assert.DoesNotContain("<script>alert(1)</script>", html);
        Assert.Contains("&lt;script&gt;", html);
    }

    // ---------- sitemap ----------

    private static List<XElement> Urls(ContentResult result) => XDocument.Parse(Body(result)).Root!.Elements(Ns + "url").ToList();
    private static string Loc(XElement url) => url.Element(Ns + "loc")!.Value;

    [PostgresFact]
    public async Task Sitemap_ListsHomeCatalogAboutEveryCategoryAndEveryProduct_AbsoluteOnWww()
    {
        var slugA = $"a-{Guid.NewGuid():N}";
        var slugB = $"b-{Guid.NewGuid():N}";
        var categoryA = await AddCategoryAsync(slugA);
        var categoryB = await AddCategoryAsync(slugB);
        var p1 = await AddProductAsync(categoryA);
        var p2 = await AddProductAsync(categoryB);
        var (controller, ctx) = await ControllerAsync();
        await using var _ = ctx;

        var result = await controller.Sitemap(default);
        var locs = Urls(result).Select(Loc).ToList();

        Assert.Equal(200, result.StatusCode);
        Assert.Equal("application/xml; charset=utf-8", result.ContentType);
        Assert.Equal("public, max-age=3600", controller.Response.Headers.CacheControl.ToString());
        Assert.All(locs, l => Assert.StartsWith($"{Site}/", l));
        Assert.Contains($"{Site}/", locs);
        Assert.Contains($"{Site}/catalog", locs);
        Assert.Contains($"{Site}/about", locs);
        Assert.Contains($"{Site}/catalog/{slugA}", locs);
        Assert.Contains($"{Site}/catalog/{slugB}", locs);
        Assert.Contains($"{Site}/product/{p1}", locs);
        Assert.Contains($"{Site}/product/{p2}", locs);
        Assert.Equal(locs.Count, locs.Distinct().Count());
    }

    [PostgresFact]
    public async Task Sitemap_HasNoClosedPages()
    {
        await AddProductAsync(await AddCategoryAsync());
        var (controller, ctx) = await ControllerAsync();
        await using var _ = ctx;

        var locs = Urls(await controller.Sitemap(default)).Select(Loc).ToList();

        foreach (var closed in new[] { "/cart", "/checkout", "/account", "/login", "/favorites", "/admin" })
        {
            Assert.DoesNotContain(locs, l => l.Contains(closed));
        }
    }

    [PostgresFact]
    public async Task Sitemap_Lastmod_IsTheProductsUpdatedAt_AndTheNewestOneForItsCategoryAndHome()
    {
        var slug = $"lm-{Guid.NewGuid():N}";
        var category = await AddCategoryAsync(slug);
        var older = new DateTime(2026, 8, 1, 10, 0, 0, DateTimeKind.Utc);
        var newer = new DateTime(2027, 1, 2, 3, 4, 5, DateTimeKind.Utc); // in the future of every other test row: the newest overall
        var p1 = await AddProductAsync(category, updatedAt: older);
        var p2 = await AddProductAsync(category, updatedAt: newer);
        var emptySlug = $"em-{Guid.NewGuid():N}";
        await AddCategoryAsync(emptySlug);
        var (controller, ctx) = await ControllerAsync();
        await using var _ = ctx;

        var urls = Urls(await controller.Sitemap(default));
        string? Lastmod(string loc) => urls.Single(u => Loc(u) == loc).Element(Ns + "lastmod")?.Value;

        Assert.Equal("2026-08-01T10:00:00Z", Lastmod($"{Site}/product/{p1}"));
        Assert.Equal("2027-01-02T03:04:05Z", Lastmod($"{Site}/product/{p2}"));
        Assert.Equal("2027-01-02T03:04:05Z", Lastmod($"{Site}/catalog/{slug}"));
        Assert.Equal("2027-01-02T03:04:05Z", Lastmod($"{Site}/"));
        Assert.Null(Lastmod($"{Site}/catalog/{emptySlug}")); // no products: no date rather than a made-up one
        Assert.Null(Lastmod($"{Site}/about"));
    }

    [PostgresFact]
    public async Task Sitemap_IsCachedForTheConfiguredTime_AndNotWhenTheTimeIsZero()
    {
        var category = await AddCategoryAsync();
        var first = await AddProductAsync(category);

        var (cached, ctx1) = await ControllerAsync(cacheSeconds: 600);
        await using (ctx1)
        {
            Assert.Contains($"{Site}/product/{first}", Urls(await cached.Sitemap(default)).Select(Loc));
            var second = await AddProductAsync(category);
            Assert.DoesNotContain($"{Site}/product/{second}", Urls(await cached.Sitemap(default)).Select(Loc)); // served from the cache

            var (fresh, ctx2) = await ControllerAsync(cacheSeconds: 0);
            await using (ctx2)
            {
                Assert.Contains($"{Site}/product/{second}", Urls(await fresh.Sitemap(default)).Select(Loc));
                var third = await AddProductAsync(category);
                Assert.Contains($"{Site}/product/{third}", Urls(await fresh.Sitemap(default)).Select(Loc)); // never cached
            }
        }
    }

    private static string Between(string text, string start, string end)
    {
        var from = text.IndexOf(start, StringComparison.Ordinal) + start.Length;
        return text[from..text.IndexOf(end, from, StringComparison.Ordinal)];
    }
}
