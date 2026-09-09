using Microsoft.EntityFrameworkCore;
using FamilyShop.Domain.Entities;
using FamilyShop.Domain.Interfaces;
using FamilyShop.Domain.ValueObjects;

namespace FamilyShop.Infrastructure.Persistence.Repositories;

public class ProductRepository : RepositoryBase<Product>, IProductRepository
{
    public ProductRepository(AppDbContext context) : base(context)
    {
    }

    public async Task<(IReadOnlyList<Product> Items, int TotalCount)> GetByFilterAsync(
        Gender? gender,
        int? categoryId,
        decimal? minPrice,
        decimal? maxPrice,
        ProductSortOrder sortOrder,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var query = DbSet.AsQueryable();

        if (gender is not null)
        {
            query = query.Where(p => p.Gender == gender);
        }

        if (categoryId is not null)
        {
            query = query.Where(p => p.CategoryId == categoryId);
        }

        if (minPrice is not null)
        {
            var min = new Money(minPrice.Value);
            query = query.Where(p => (p.DiscountPrice ?? p.Price) >= min);
        }

        if (maxPrice is not null)
        {
            var max = new Money(maxPrice.Value);
            query = query.Where(p => (p.DiscountPrice ?? p.Price) <= max);
        }

        // Skip/Take requires a fully deterministic ORDER BY - ties on the primary key
        // (e.g. two products at the same price) would otherwise make row order
        // unstable across pages, letting the same product appear on two pages
        // (or be skipped) as Postgres re-plans the query. Id is unique, so it
        // always breaks ties and keeps pagination stable.
        query = sortOrder switch
        {
            ProductSortOrder.PriceAsc => query.OrderBy(p => p.DiscountPrice ?? p.Price).ThenBy(p => p.Id),
            ProductSortOrder.PriceDesc => query.OrderByDescending(p => p.DiscountPrice ?? p.Price).ThenBy(p => p.Id),
            ProductSortOrder.Popular => query.OrderByDescending(p => p.IsBestseller).ThenByDescending(p => p.CreatedAt).ThenBy(p => p.Id),
            _ => query.OrderByDescending(p => p.CreatedAt).ThenBy(p => p.Id)
        };

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }
}
