namespace Application.DTOs;

/// <summary>Product data for the bot page: what the HTML and the JSON-LD are built from.</summary>
public sealed record SeoProductDto(int Id, string Name, decimal Price, bool InStock, IReadOnlyList<string> ImageUrls, decimal? Rating, int ReviewCount);

/// <summary>Everything a crawler page needs, already worded (ru templates of docs/Seo.md) but not yet escaped for HTML.</summary>
public sealed record SeoPageDto(
    string Title,
    string Description,
    string CanonicalUrl,
    string ImageUrl,
    bool IsDefaultImage,
    string Heading,
    string? PriceText,
    SeoProductDto? Product,
    IReadOnlyList<SeoCrumbDto>? Breadcrumbs = null);

/// <summary>One step of the breadcrumb trail (JSON-LD BreadcrumbList); <see cref="Url"/> is absolute.</summary>
public sealed record SeoCrumbDto(string Name, string Url);

/// <summary>One sitemap address; <see cref="Loc"/> is absolute, <see cref="LastModified"/> is UTC or null.</summary>
public sealed record SitemapEntryDto(string Loc, DateTime? LastModified, string ChangeFrequency, string Priority);
