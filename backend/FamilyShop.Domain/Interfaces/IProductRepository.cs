using FamilyShop.Domain.Entities;

namespace FamilyShop.Domain.Interfaces;

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
        CancellationToken cancellationToken = default);
}
