using Microsoft.EntityFrameworkCore;
using Domain.Entities;
using Domain.Interfaces;

namespace Infrastructure.Persistence.Repositories;

public class ReviewRepository : RepositoryBase<Review>, IReviewRepository
{
    public ReviewRepository(AppDbContext context) : base(context)
    {
    }

    public async Task<(IReadOnlyList<Review> Items, int TotalCount)> GetByProductIdAsync(
        int productId,
        ReviewSortOrder sortOrder,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var query = DbSet.Include(r => r.User).Where(r => r.ProductId == productId);

        // Skip/Take requires a fully deterministic ORDER BY - Id breaks ties, same convention
        // as ProductRepository/OrderRepository.
        query = sortOrder switch
        {
            ReviewSortOrder.HighestRating => query.OrderByDescending(r => r.Rating).ThenByDescending(r => r.CreatedAt).ThenBy(r => r.Id),
            ReviewSortOrder.LowestRating => query.OrderBy(r => r.Rating).ThenByDescending(r => r.CreatedAt).ThenBy(r => r.Id),
            _ => query.OrderByDescending(r => r.CreatedAt).ThenBy(r => r.Id)
        };

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<Review?> GetByProductAndUserAsync(int productId, int userId, CancellationToken cancellationToken = default)
    {
        return await DbSet.Include(r => r.User).FirstOrDefaultAsync(r => r.ProductId == productId && r.UserId == userId, cancellationToken);
    }

    public async Task<(decimal AverageRating, int ReviewCount)> GetAggregateAsync(int productId, CancellationToken cancellationToken = default)
    {
        var ratings = await DbSet.Where(r => r.ProductId == productId).Select(r => r.Rating).ToListAsync(cancellationToken);
        if (ratings.Count == 0)
        {
            return (0m, 0);
        }

        return (Math.Round((decimal)ratings.Average(), 2), ratings.Count);
    }

    public async Task<IReadOnlyDictionary<int, int>> GetRatingDistributionAsync(int productId, CancellationToken cancellationToken = default)
    {
        var counts = await DbSet
            .Where(r => r.ProductId == productId)
            .GroupBy(r => r.Rating)
            .Select(g => new { Rating = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var distribution = Enumerable.Range(1, 5).ToDictionary(star => star, _ => 0);
        foreach (var c in counts)
        {
            distribution[c.Rating] = c.Count;
        }

        return distribution;
    }
}
