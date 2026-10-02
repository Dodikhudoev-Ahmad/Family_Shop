using Domain.Entities;

namespace Domain.Interfaces;

public enum ProductSortOrder
{
    Newest,
    PriceAsc,
    PriceDesc,
    Popular
}

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

    /// <summary>Atomic <c>Stock = Stock + q</c> (returning cancelled stock). Bypasses the change tracker.</summary>
    Task IncrementStockAsync(int id, int quantity, CancellationToken cancellationToken = default);
}
