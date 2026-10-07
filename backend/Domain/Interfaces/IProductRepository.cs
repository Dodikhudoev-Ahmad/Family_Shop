using Domain.Entities;

namespace Domain.Interfaces;

public enum ProductSortOrder
{
    Newest,
    PriceAsc,
    PriceDesc,
    Popular
}

/// <summary>What the sitemap needs of a product: its address parts and when its card last changed.</summary>
public sealed record ProductSitemapRow(int Id, int CategoryId, DateTime UpdatedAt);

public interface IProductRepository : IRepository<Product>
{
    Task<(IReadOnlyList<Product> Items, int TotalCount)> GetByFilterAsync(
        Gender? gender,
        int? categoryId,
        decimal? minPrice,
        decimal? maxPrice,
        string? search,
        ProductSortOrder sortOrder,
        int page,
        int pageSize,
        string? productType,
        CancellationToken cancellationToken = default);

    Task<bool> AnyByCategoryIdAsync(int categoryId, CancellationToken cancellationToken = default);

    /// <summary>Atomic conditional write-off: <c>UPDATE ... SET Stock = Stock - q WHERE Id = id AND Stock &gt;= q</c>.
    /// False when the product doesn't exist or has fewer than <paramref name="quantity"/> units left. Bypasses the
    /// change tracker, so already-loaded Product instances keep their stale Stock.</summary>
    Task<bool> TryDecrementStockAsync(int id, int quantity, CancellationToken cancellationToken = default);

    /// <summary>Current stock straight from the database (no tracking), or null if the product doesn't exist.</summary>
    Task<int?> GetStockAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>Atomic <c>Stock = Stock + q</c> (returning cancelled stock). Bypasses the change tracker.</summary>
    Task IncrementStockAsync(int id, int quantity, CancellationToken cancellationToken = default);

    /// <summary>At most <paramref name="limit"/> products, the most recently changed first, plus the total number of products.
    /// Reads only three columns, without tracking.</summary>
    Task<(IReadOnlyList<ProductSitemapRow> Rows, int Total)> GetSitemapRowsAsync(int limit, CancellationToken cancellationToken = default);

    /// <summary>Number of products in the category and the lowest effective price (discount if any); the price is null when empty.</summary>
    Task<(int Count, decimal? MinPrice)> GetCategoryStatsAsync(int categoryId, CancellationToken cancellationToken = default);
}
