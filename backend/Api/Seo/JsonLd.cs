using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Unicode;
using Application.DTOs;
using Application.Services;

namespace Api.Seo;

/// <summary>
/// schema.org structured data for the crawler pages (docs/Seo.md, "JSON-LD"). The format is shared with the site: the
/// frontend's <c>utils/jsonLd.ts</c> builds the same objects and both are checked against the golden files in
/// <c>docs/fixtures/jsonld/</c>. The text is serialized by the JSON encoder below, which always escapes
/// &lt; &gt; &amp; and ', so a product name can never close the <c>&lt;script&gt;</c> block it is placed in.
/// </summary>
public static class JsonLd
{
    // Cyrillic stays readable; everything outside BasicLatin and Cyrillic (and < > & ' +) becomes \uXXXX.
    private static readonly JsonSerializerOptions Options = new()
    {
        Encoder = JavaScriptEncoder.Create(UnicodeRanges.BasicLatin, UnicodeRanges.Cyrillic)
    };

    private static string Amount(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    /// <summary>The JSON for every structured-data block of a page: Product (product pages) and BreadcrumbList (when there is a trail).</summary>
    public static IReadOnlyList<string> ForPage(SeoPageDto page)
    {
        var blocks = new List<string>();
        if (page.Product is not null) blocks.Add(Serialize(Product(page, page.Product)));
        if (page.Breadcrumbs is { Count: > 0 }) blocks.Add(Serialize(BreadcrumbList(page.Breadcrumbs)));
        return blocks;
    }

    public static string Serialize(object data) => JsonSerializer.Serialize(data, Options);

    /// <summary>Product with a brand, an Offer in KZT (availability from the real stock) and an AggregateRating only when there are reviews.</summary>
    public static Dictionary<string, object?> Product(SeoPageDto page, SeoProductDto product)
    {
        var data = new Dictionary<string, object?>
        {
            ["@context"] = "https://schema.org",
            ["@type"] = "Product",
            ["name"] = product.Name,
            ["description"] = page.Description,
            ["sku"] = product.Id.ToString(CultureInfo.InvariantCulture),
            ["brand"] = new Dictionary<string, object?> { ["@type"] = "Brand", ["name"] = SeoText.SiteName },
            ["url"] = page.CanonicalUrl,
            ["image"] = product.ImageUrls.Count > 0 ? product.ImageUrls : new[] { page.ImageUrl },
            ["offers"] = new Dictionary<string, object?>
            {
                ["@type"] = "Offer",
                ["url"] = page.CanonicalUrl,
                ["price"] = Amount(product.Price),
                ["priceCurrency"] = "KZT",
                ["availability"] = product.InStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                ["itemCondition"] = "https://schema.org/NewCondition"
            }
        };
        if (product.Rating is not null && product.ReviewCount > 0)
        {
            data["aggregateRating"] = new Dictionary<string, object?>
            {
                ["@type"] = "AggregateRating",
                ["ratingValue"] = Amount(product.Rating.Value),
                ["reviewCount"] = product.ReviewCount
            };
        }
        return data;
    }

    public static Dictionary<string, object?> BreadcrumbList(IReadOnlyList<SeoCrumbDto> crumbs) => new()
    {
        ["@context"] = "https://schema.org",
        ["@type"] = "BreadcrumbList",
        ["itemListElement"] = crumbs.Select((c, i) => new Dictionary<string, object?>
        {
            ["@type"] = "ListItem",
            ["position"] = i + 1,
            ["name"] = c.Name,
            ["item"] = c.Url
        }).ToList()
    };
}
