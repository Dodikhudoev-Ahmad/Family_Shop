using Application.DTOs;
using Application.Interfaces;
using Domain.Interfaces;
using Microsoft.Extensions.Logging;

namespace Application.Services;

/// <summary>
/// The data behind the crawler pages and the sitemap (docs/Seo.md). Read-only; the HTML and XML are produced by the Api layer.
/// All addresses are absolute on <see cref="SeoSettings.SiteUrl"/>.
/// </summary>
public class SeoService : ISeoService
{
    /// <summary>The sitemap protocol allows 50 000 addresses per file.</summary>
    public const int MaxSitemapUrls = 50_000;

    private readonly IUnitOfWork _unitOfWork;
    private readonly SeoSettings _settings;
    private readonly ILogger<SeoService> _logger;

    public SeoService(IUnitOfWork unitOfWork, SeoSettings settings, ILogger<SeoService> logger)
    {
        _unitOfWork = unitOfWork;
        _settings = settings;
        _logger = logger;
    }

    public async Task<SeoPageDto?> GetProductPageAsync(int id, CancellationToken cancellationToken = default)
    {
        var product = await _unitOfWork.Products.GetByIdAsync(id, cancellationToken);
        if (product is null) return null;

        var price = product.EffectivePrice.Amount;
        var images = product.Images.Select(ToAbsoluteImage).OfType<string>().ToList();
        var ogImage = images.FirstOrDefault();
        var category = await _unitOfWork.Categories.GetByIdAsync(product.CategoryId, cancellationToken);
        var canonical = $"{_settings.SiteUrl}/product/{product.Id}";
        var crumbs = new List<SeoCrumbDto> { new(SeoText.HomeName, $"{_settings.SiteUrl}/") };
        if (category is not null) crumbs.Add(new(category.Name, CategoryUrl(category.Slug)));
        crumbs.Add(new(product.Name, canonical));

        return new SeoPageDto(
            Title: SeoText.ProductTitle(product.Name, price),
            Description: SeoText.ProductDescription(product.Name, product.Description),
            CanonicalUrl: canonical,
            ImageUrl: ogImage ?? _settings.DefaultImageUrl,
            IsDefaultImage: ogImage is null,
            Heading: product.Name,
            PriceText: SeoText.FormatTenge(price),
            Product: new SeoProductDto(product.Id, product.Name, price, product.Stock > 0, images,
                product.ReviewCount > 0 ? product.AverageRating : null, product.ReviewCount),
            Breadcrumbs: crumbs);
    }

    public async Task<SeoPageDto?> GetCategoryPageAsync(string slug, CancellationToken cancellationToken = default)
    {
        var category = await _unitOfWork.Categories.GetBySlugAsync(slug, cancellationToken);
        if (category is null) return null;

        var (count, minPrice) = await _unitOfWork.Products.GetCategoryStatsAsync(category.Id, cancellationToken);
        return new SeoPageDto(
            Title: SeoText.CategoryTitle(category.Name),
            Description: SeoText.CategoryDescription(category.Name, count, minPrice),
            CanonicalUrl: CategoryUrl(category.Slug),
            ImageUrl: _settings.DefaultImageUrl,
            IsDefaultImage: true,
            Heading: category.Name,
            PriceText: null,
            Product: null,
            Breadcrumbs: [new(SeoText.HomeName, $"{_settings.SiteUrl}/"), new(category.Name, CategoryUrl(category.Slug))]);
    }

    private string CategoryUrl(string slug) => $"{_settings.SiteUrl}/catalog/{Uri.EscapeDataString(slug)}";

    public async Task<IReadOnlyList<SitemapEntryDto>> GetSitemapAsync(CancellationToken cancellationToken = default)
    {
        var categories = await _unitOfWork.Categories.GetAllAsync(cancellationToken);
        // Pages that are not products: home, catalog, about + one per category.
        var fixedCount = 3 + categories.Count;
        var (rows, total) = await _unitOfWork.Products.GetSitemapRowsAsync(Math.Max(0, MaxSitemapUrls - fixedCount), cancellationToken);
        if (rows.Count < total)
        {
            _logger.LogWarning("Sitemap limit reached: {Included} of {Total} products fit into {Max} addresses; the longest unchanged ones are left out.",
                rows.Count, total, MaxSitemapUrls);
        }

        var newest = rows.Count == 0 ? (DateTime?)null : rows.Max(r => r.UpdatedAt);
        var newestByCategory = rows.GroupBy(r => r.CategoryId).ToDictionary(g => g.Key, g => g.Max(r => r.UpdatedAt));
        var site = _settings.SiteUrl;

        var entries = new List<SitemapEntryDto>(fixedCount + rows.Count)
        {
            new($"{site}/", newest, "daily", "1.0"),
            new($"{site}/catalog", newest, "daily", "0.9")
        };
        foreach (var category in categories.OrderBy(c => c.Id))
        {
            entries.Add(new($"{site}/catalog/{Uri.EscapeDataString(category.Slug)}",
                newestByCategory.TryGetValue(category.Id, out var changed) ? changed : null, "daily", "0.8"));
        }
        entries.Add(new($"{site}/about", null, "monthly", "0.5"));
        entries.AddRange(rows.OrderBy(r => r.Id).Select(r => new SitemapEntryDto($"{site}/product/{r.Id}", r.UpdatedAt, "weekly", "0.6")));
        return entries;
    }

    /// <summary>A photo address a crawler can fetch: absolute http(s) as is, a site-relative upload path on the uploads origin,
    /// anything else (javascript:, data:, a relative path with no known origin) is dropped.</summary>
    private string? ToAbsoluteImage(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        var trimmed = url.Trim();
        if (trimmed.StartsWith('/') && !trimmed.StartsWith("//"))
        {
            return _settings.UploadsBaseUrl is null ? null : $"{_settings.UploadsBaseUrl}{trimmed}";
        }
        return Uri.TryCreate(trimmed, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
            ? trimmed
            : null;
    }
}
