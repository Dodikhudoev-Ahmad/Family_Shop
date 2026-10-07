using Application.DTOs;

namespace Application.Interfaces;

public interface ISeoService
{
    /// <summary>The bot page of a product, or null when there is no such product.</summary>
    Task<SeoPageDto?> GetProductPageAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>The bot page of a category, or null when there is no such category.</summary>
    Task<SeoPageDto?> GetCategoryPageAsync(string slug, CancellationToken cancellationToken = default);

    /// <summary>The sitemap: the home page, the catalog, the about page, every category and every product (at most <see cref="Services.SeoService.MaxSitemapUrls"/>).</summary>
    Task<IReadOnlyList<SitemapEntryDto>> GetSitemapAsync(CancellationToken cancellationToken = default);
}
