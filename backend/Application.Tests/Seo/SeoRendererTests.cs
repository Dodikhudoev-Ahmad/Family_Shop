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

    private static JsonElement JsonLd(SeoPageDto page) => JsonDocument.Parse(SeoRenderer.ProductJsonLd(page, page.Product!)).RootElement;

    [Fact]
    public void JsonLd_IsAProductWithAnOfferInTenge()
    {
        var root = JsonLd(ProductPage());
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
        var offer = JsonLd(ProductPage(price: 9900.5m, inStock: false)).GetProperty("offers");
        Assert.Equal("https://schema.org/OutOfStock", offer.GetProperty("availability").GetString());
        Assert.Equal("9900.5", offer.GetProperty("price").GetString());
    }

    [Fact]
    public void JsonLd_HasARatingOnlyWhenThereAreReviews()
    {
        var rating = JsonLd(ProductPage(rating: 4.5m, reviews: 12)).GetProperty("aggregateRating");
        Assert.Equal("AggregateRating", rating.GetProperty("@type").GetString());
        Assert.Equal("4.5", rating.GetProperty("ratingValue").GetString());
        Assert.Equal(12, rating.GetProperty("reviewCount").GetInt32());
    }

    [Fact]
    public void JsonLd_CannotCloseTheScriptBlock_AndStaysValidJson()
    {
        var page = ProductPage(name: Evil);
        var raw = SeoRenderer.ProductJsonLd(page, page.Product!);
        Assert.DoesNotContain("<", raw);
        Assert.DoesNotContain(">", raw);
        Assert.Equal(Evil, JsonLd(page).GetProperty("name").GetString()); // the value survives the round trip
    }

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
