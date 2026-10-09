using System.Text.Json;
using System.Xml.Linq;
using Xunit;
using Api.Seo;
using Application.DTOs;

namespace Application.Tests.Seo;

public class SeoRendererTests
{
    private const string Evil = "<script>alert(1)</script>\"'&</title><meta name=\"robots\" content=\"noindex\">";

    private static SeoPageDto ProductPage(string name = "Платье", decimal price = 12500, bool inStock = true, decimal? rating = null, int reviews = 0, string image = "https://api.familyshop10.kz/uploads/products/a.jpg") =>
        new($"{name} — 12 500 ₸ | Family Shop", "Описание", "https://www.familyshop10.kz/product/7", image, false, name, "12 500 ₸",
            new SeoProductDto(7, name, price, inStock, [image], rating, reviews));

    // ---------- HTML ----------

    [Fact]
    public void Html_HasTheMetaTagsOfAProduct()
    {
        var html = SeoRenderer.PageHtml(ProductPage());

        Assert.Contains("<title>Платье — 12 500 ₸ | Family Shop</title>", html);
        Assert.Contains("<meta name=\"description\" content=\"Описание\">", html);
        Assert.Contains("<link rel=\"canonical\" href=\"https://www.familyshop10.kz/product/7\">", html);
        Assert.Contains("<meta property=\"og:type\" content=\"product\">", html);
        Assert.Contains("<meta property=\"og:url\" content=\"https://www.familyshop10.kz/product/7\">", html);
        Assert.Contains("<meta property=\"og:image\" content=\"https://api.familyshop10.kz/uploads/products/a.jpg\">", html);
        Assert.Contains("<meta property=\"product:price:amount\" content=\"12500\">", html);
        Assert.Contains("<meta property=\"product:price:currency\" content=\"KZT\">", html);
        Assert.Contains("<meta name=\"robots\" content=\"index,follow\">", html);
        Assert.Contains("<html lang=\"ru\">", html);
        Assert.DoesNotContain("og:image:width", html); // the size of a product photo is unknown
    }

    [Fact]
    public void Html_OfACategory_HasNoProductTagsAndTheDefaultImageWithItsSize()
    {
        var page = new SeoPageDto("Женское — купить в Казахстане | Family Shop", "d", "https://www.familyshop10.kz/catalog/women",
            "https://www.familyshop10.kz/og-default.png", true, "Женское", null, null);
        var html = SeoRenderer.PageHtml(page);

        Assert.Contains("<meta property=\"og:type\" content=\"website\">", html);
        Assert.Contains("<meta property=\"og:image:width\" content=\"1200\">", html);
        Assert.Contains("<meta property=\"og:image:height\" content=\"630\">", html);
        Assert.DoesNotContain("product:price", html);
        Assert.DoesNotContain("\"@type\":\"Product\"", html); // no breadcrumbs given here, so no structured data at all
        Assert.DoesNotContain("application/ld+json", html);
    }

    [Fact]
    public void Html_EscapesEveryValueFromTheDatabase_InTextAndInAttributes()
    {
        var page = new SeoPageDto(Evil, Evil, "https://www.familyshop10.kz/catalog/" + Evil, "https://x.example/a.jpg?q=\"><script>1</script>", false, Evil, null,
            new SeoProductDto(7, Evil, 100, true, ["https://x.example/a.jpg?q=\"><script>1</script>"], null, 0));
        var html = SeoRenderer.PageHtml(page);

        // The raw payload never appears; the only <script> is the JSON-LD block, and it is closed exactly once.
        Assert.DoesNotContain("<script>alert(1)</script>", html);
        Assert.DoesNotContain("<script>1</script>", html);
        Assert.DoesNotContain("</title><meta", html);
        Assert.Equal(1, CountOf(html, "<script"));
        Assert.Equal(1, CountOf(html, "</script>"));
        Assert.Equal(1, CountOf(html, "<meta name=\"robots\""));
        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;", html);
    }

    [Fact]
    public void NotFoundHtml_IsNoindexAndHasNoCanonicalOrProductData()
    {
        var html = SeoRenderer.NotFoundHtml();
        Assert.Contains("<meta name=\"robots\" content=\"noindex,nofollow\">", html);
        Assert.DoesNotContain("canonical", html);
        Assert.DoesNotContain("og:", html);
    }

    // ---------- JSON-LD ----------

    private static JsonElement ProductLd(SeoPageDto page) => JsonDocument.Parse(Api.Seo.JsonLd.Serialize(Api.Seo.JsonLd.Product(page, page.Product!))).RootElement;

    [Fact]
    public void JsonLd_IsAProductWithAnOfferInTenge()
    {
        var root = ProductLd(ProductPage());
        Assert.Equal("https://schema.org", root.GetProperty("@context").GetString());
        Assert.Equal("Product", root.GetProperty("@type").GetString());
        Assert.Equal("Платье", root.GetProperty("name").GetString());
        Assert.Equal("7", root.GetProperty("sku").GetString());
        Assert.Equal("https://www.familyshop10.kz/product/7", root.GetProperty("url").GetString());
        Assert.Equal("https://api.familyshop10.kz/uploads/products/a.jpg", root.GetProperty("image")[0].GetString());
        var offer = root.GetProperty("offers");
        Assert.Equal("Offer", offer.GetProperty("@type").GetString());
        Assert.Equal("12500", offer.GetProperty("price").GetString());
        Assert.Equal("KZT", offer.GetProperty("priceCurrency").GetString());
        Assert.Equal("https://schema.org/InStock", offer.GetProperty("availability").GetString());
        Assert.False(root.TryGetProperty("aggregateRating", out _));
    }

    [Fact]
    public void JsonLd_OutOfStock_AndDecimalPriceWithoutTrailingZeros()
    {
        var offer = ProductLd(ProductPage(price: 9900.5m, inStock: false)).GetProperty("offers");
        Assert.Equal("https://schema.org/OutOfStock", offer.GetProperty("availability").GetString());
        Assert.Equal("9900.5", offer.GetProperty("price").GetString());
    }

    [Fact]
    public void JsonLd_HasARatingOnlyWhenThereAreReviews()
    {
        var rating = ProductLd(ProductPage(rating: 4.5m, reviews: 12)).GetProperty("aggregateRating");
        Assert.Equal("AggregateRating", rating.GetProperty("@type").GetString());
        Assert.Equal("4.5", rating.GetProperty("ratingValue").GetString());
        Assert.Equal(12, rating.GetProperty("reviewCount").GetInt32());
    }

    [Fact]
    public void JsonLd_CannotCloseTheScriptBlock_AndStaysValidJson()
    {
        var page = ProductPage(name: Evil);
        var raw = Api.Seo.JsonLd.Serialize(Api.Seo.JsonLd.Product(page, page.Product!));
        Assert.DoesNotContain("<", raw);
        Assert.DoesNotContain(">", raw);
        Assert.Equal(Evil, ProductLd(page).GetProperty("name").GetString()); // the value survives the round trip
    }

    // ---------- JSON-LD: BreadcrumbList, brand, shared format ----------

    private static string Root()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "docs", "fixtures"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("repository root not found");
    }

    private static IEnumerable<string> Blocks(string html) =>
        System.Text.RegularExpressions.Regex.Matches(html, "<script type=\"application/ld\\+json\">(.*?)</script>", System.Text.RegularExpressions.RegexOptions.Singleline)
            .Select(m => m.Groups[1].Value);

    [Fact]
    public void JsonLd_ProductHasABrand()
    {
        var brand = ProductLd(ProductPage()).GetProperty("brand");
        Assert.Equal("Brand", brand.GetProperty("@type").GetString());
        Assert.Equal("Family Shop", brand.GetProperty("name").GetString());
    }

    [Fact]
    public void ProductPage_CarriesProductAndBreadcrumbList_AsTwoBlocks()
    {
        var page = ProductPage() with { Breadcrumbs = [new("Главная", "https://www.familyshop10.kz/"), new("Платье", "https://www.familyshop10.kz/product/7")] };
        var blocks = Blocks(SeoRenderer.PageHtml(page)).Select(b => JsonDocument.Parse(b).RootElement).ToList();

        Assert.Equal(new[] { "Product", "BreadcrumbList" }, blocks.Select(b => b.GetProperty("@type").GetString()));
        var items = blocks[1].GetProperty("itemListElement");
        Assert.Equal(2, items.GetArrayLength());
        Assert.Equal(1, items[0].GetProperty("position").GetInt32());
        Assert.Equal("https://www.familyshop10.kz/product/7", items[1].GetProperty("item").GetString());
    }

    [Fact]
    public void CategoryPage_CarriesOnlyABreadcrumbList()
    {
        var page = new SeoPageDto("t", "d", "https://www.familyshop10.kz/catalog/women", "https://www.familyshop10.kz/og-default.png", true, "Женское", null, null,
            [new("Главная", "https://www.familyshop10.kz/"), new("Женское", "https://www.familyshop10.kz/catalog/women")]);
        var blocks = Blocks(SeoRenderer.PageHtml(page)).ToList();

        var only = Assert.Single(blocks);
        Assert.Equal("BreadcrumbList", JsonDocument.Parse(only).RootElement.GetProperty("@type").GetString());
    }

    [Fact]
    public void EvilNamesAndDescriptions_CannotBreakOutOfAnyJsonLdBlock_InTheWholePage()
    {
        var page = new SeoPageDto(Evil, Evil, "https://www.familyshop10.kz/product/7", "https://x.example/a.jpg", false, Evil, null,
            new SeoProductDto(7, Evil, 100, true, ["https://x.example/a.jpg?q=</script><script>alert(1)</script>"], 4m, 1),
            [new("Главная", "https://www.familyshop10.kz/"), new(Evil, "https://www.familyshop10.kz/catalog/</script>"), new(Evil, "https://www.familyshop10.kz/product/7")]);
        var html = SeoRenderer.PageHtml(page);

        // Exactly the two blocks we opened and closed ourselves; nothing in the data added a tag.
        Assert.Equal(2, System.Text.RegularExpressions.Regex.Matches(html, "<script", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Count);
        Assert.Equal(2, System.Text.RegularExpressions.Regex.Matches(html, "</script>", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Count);
        foreach (var block in Blocks(html))
        {
            Assert.DoesNotContain("<", block);
            Assert.DoesNotContain(">", block);
            Assert.DoesNotContain("&", block);
            JsonDocument.Parse(block); // still valid JSON
        }
        Assert.Equal(Evil, JsonDocument.Parse(Blocks(html).Last()).RootElement.GetProperty("itemListElement")[2].GetProperty("name").GetString());
    }

    [Fact]
    public void ProductAndBreadcrumbs_MatchTheGoldenFile_SharedWithTheSite()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(Root(), "docs", "fixtures", "jsonld", "product-page.json")));
        var input = fixture.RootElement.GetProperty("input");
        var site = input.GetProperty("siteUrl").GetString()!;
        var id = input.GetProperty("productId").GetInt32();
        var name = input.GetProperty("name").GetString()!;
        var url = $"{site}/product/{id}";
        var images = input.GetProperty("images").EnumerateArray().Select(i => i.GetString()!).ToList();
        var page = new SeoPageDto("t", input.GetProperty("description").GetString()!, url, images[0], false, name, null,
            new SeoProductDto(id, name, input.GetProperty("price").GetDecimal(), input.GetProperty("stock").GetInt32() > 0, images,
                input.GetProperty("rating").GetDecimal(), input.GetProperty("reviewCount").GetInt32()),
            [new("Главная", $"{site}/"), new(input.GetProperty("categoryName").GetString()!, $"{site}/catalog/{input.GetProperty("categorySlug").GetString()}"), new(name, url)]);

        var blocks = Blocks(SeoRenderer.PageHtml(page)).Select(b => JsonDocument.Parse(b).RootElement).ToList();
        var expected = fixture.RootElement.GetProperty("expected");

        Assert.Equal(Canonical(expected.GetProperty("product")), Canonical(blocks[0]));
        Assert.Equal(Canonical(expected.GetProperty("breadcrumbs")), Canonical(blocks[1]));
    }

    /// <summary>Property order does not matter to a parser, so compare with the keys sorted.</summary>
    private static string Canonical(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.Object => "{" + string.Join(",", e.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal).Select(p => $"\"{p.Name}\":{Canonical(p.Value)}")) + "}",
        JsonValueKind.Array => "[" + string.Join(",", e.EnumerateArray().Select(Canonical)) + "]",
        _ => e.GetRawText()
    };

    // ---------- sitemap ----------

    [Fact]
    public void Sitemap_IsValidXml_WithLastmodInUtc_AndEscapedAddresses()
    {
        var entries = new List<SitemapEntryDto>
        {
            new("https://www.familyshop10.kz/", new DateTime(2026, 10, 7, 9, 5, 3, DateTimeKind.Utc), "daily", "1.0"),
            new("https://www.familyshop10.kz/catalog/a&b<c>", null, "daily", "0.8"),
        };
        var doc = XDocument.Parse(SeoRenderer.SitemapXml(entries));
        XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
        var urls = doc.Root!.Elements(ns + "url").ToList();

        Assert.Equal(2, urls.Count);
        Assert.Equal("2026-10-07T09:05:03Z", urls[0].Element(ns + "lastmod")!.Value);
        Assert.Equal("https://www.familyshop10.kz/catalog/a&b<c>", urls[1].Element(ns + "loc")!.Value);
        Assert.Null(urls[1].Element(ns + "lastmod"));
    }

    private static int CountOf(string text, string part)
    {
        var count = 0;
        for (var i = text.IndexOf(part, StringComparison.Ordinal); i >= 0; i = text.IndexOf(part, i + part.Length, StringComparison.Ordinal)) count++;
        return count;
    }
}
