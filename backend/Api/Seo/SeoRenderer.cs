using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Unicode;
using System.Xml;
using Application.DTOs;
using Application.Services;

namespace Api.Seo;

/// <summary>
/// Turns <see cref="SeoPageDto"/> and the sitemap entries into the bytes a crawler gets. Every value that comes from the database
/// goes through <see cref="E"/> (text and double-quoted attributes) or the JSON encoder below, and the
/// sitemap is written by <see cref="XmlWriter"/>, which escapes by itself - nothing is concatenated into markup unescaped.
/// </summary>
public static class SeoRenderer
{
    // Cyrillic stays readable; the encoder still always escapes < > & ' and + , so a name can never close the <script> block.
    private static readonly JsonSerializerOptions JsonLdOptions = new()
    {
        Encoder = JavaScriptEncoder.Create(UnicodeRanges.BasicLatin, UnicodeRanges.Cyrillic)
    };

    // Only the five characters that can break out of text or a double-quoted attribute are replaced; everything else (Cyrillic, ₸, the
    // no-break space of prices) stays as it is. WebUtility.HtmlEncode would also turn U+00A0 into &#160;.
    private static string E(string? value) =>
        (value ?? string.Empty).Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;").Replace("'", "&#39;");

    private static string Amount(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    public static string PageHtml(SeoPageDto page)
    {
        var product = page.Product;
        var sb = new StringBuilder(2048);
        sb.Append("<!doctype html>\n<html lang=\"ru\">\n<head>\n<meta charset=\"utf-8\">\n");
        sb.Append($"<title>{E(page.Title)}</title>\n");
        sb.Append($"<meta name=\"description\" content=\"{E(page.Description)}\">\n");
        sb.Append("<meta name=\"robots\" content=\"index,follow\">\n");
        sb.Append($"<link rel=\"canonical\" href=\"{E(page.CanonicalUrl)}\">\n");
        sb.Append($"<meta property=\"og:site_name\" content=\"{SeoText.SiteName}\">\n");
        sb.Append($"<meta property=\"og:type\" content=\"{(product is null ? "website" : "product")}\">\n");
        sb.Append($"<meta property=\"og:title\" content=\"{E(page.Title)}\">\n");
        sb.Append($"<meta property=\"og:description\" content=\"{E(page.Description)}\">\n");
        sb.Append($"<meta property=\"og:url\" content=\"{E(page.CanonicalUrl)}\">\n");
        sb.Append($"<meta property=\"og:image\" content=\"{E(page.ImageUrl)}\">\n");
        if (page.IsDefaultImage)
        {
            sb.Append("<meta property=\"og:image:width\" content=\"1200\">\n<meta property=\"og:image:height\" content=\"630\">\n");
        }
        sb.Append("<meta property=\"og:locale\" content=\"ru_RU\">\n");
        sb.Append("<meta name=\"twitter:card\" content=\"summary_large_image\">\n");
        sb.Append($"<meta name=\"twitter:title\" content=\"{E(page.Title)}\">\n");
        sb.Append($"<meta name=\"twitter:description\" content=\"{E(page.Description)}\">\n");
        sb.Append($"<meta name=\"twitter:image\" content=\"{E(page.ImageUrl)}\">\n");
        if (product is not null)
        {
            sb.Append($"<meta property=\"product:price:amount\" content=\"{Amount(product.Price)}\">\n");
            sb.Append("<meta property=\"product:price:currency\" content=\"KZT\">\n");
            sb.Append($"<meta property=\"product:availability\" content=\"{(product.InStock ? "in stock" : "out of stock")}\">\n");
            sb.Append($"<script type=\"application/ld+json\">{ProductJsonLd(page, product)}</script>\n");
        }
        sb.Append("</head>\n<body>\n");
        sb.Append($"<h1>{E(page.Heading)}</h1>\n<p>{E(page.Description)}</p>\n");
        if (page.PriceText is not null) sb.Append($"<p>{E(page.PriceText)}</p>\n");
        sb.Append($"<p><a href=\"{E(page.CanonicalUrl)}\">Открыть в магазине {SeoText.SiteName}</a></p>\n");
        sb.Append("</body>\n</html>\n");
        return sb.ToString();
    }

    /// <summary>The page for an address that does not exist: 404 and kept out of search results.</summary>
    public static string NotFoundHtml() =>
        "<!doctype html>\n<html lang=\"ru\">\n<head>\n<meta charset=\"utf-8\">\n" +
        $"<title>Страница не найдена — {SeoText.SiteName}</title>\n" +
        "<meta name=\"robots\" content=\"noindex,nofollow\">\n</head>\n<body>\n<h1>Страница не найдена</h1>\n</body>\n</html>\n";

    /// <summary>schema.org Product with an Offer in KZT; an AggregateRating only when there are reviews.</summary>
    public static string ProductJsonLd(SeoPageDto page, SeoProductDto product)
    {
        var data = new Dictionary<string, object?>
        {
            ["@context"] = "https://schema.org",
            ["@type"] = "Product",
            ["name"] = product.Name,
            ["description"] = page.Description,
            ["sku"] = product.Id.ToString(CultureInfo.InvariantCulture),
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
        return JsonSerializer.Serialize(data, JsonLdOptions);
    }

    public static string SitemapXml(IReadOnlyList<SitemapEntryDto> entries)
    {
        var sb = new StringBuilder();
        using (var writer = XmlWriter.Create(sb, new XmlWriterSettings { Indent = true, Encoding = new UTF8Encoding(false), OmitXmlDeclaration = false }))
        {
            writer.WriteStartDocument();
            writer.WriteStartElement("urlset", "http://www.sitemaps.org/schemas/sitemap/0.9");
            foreach (var entry in entries)
            {
                writer.WriteStartElement("url");
                writer.WriteElementString("loc", entry.Loc);
                if (entry.LastModified is { } changed)
                {
                    writer.WriteElementString("lastmod", DateTime.SpecifyKind(changed, DateTimeKind.Utc).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture));
                }
                writer.WriteElementString("changefreq", entry.ChangeFrequency);
                writer.WriteElementString("priority", entry.Priority);
                writer.WriteEndElement();
            }
            writer.WriteEndElement();
            writer.WriteEndDocument();
        }
        return sb.ToString();
    }
}
