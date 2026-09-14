using Domain.Entities;

namespace Domain.Interfaces;

public enum ReviewSortOrder
{
    Newest,
    HighestRating,
    LowestRating
}

public interface IReviewRepository : IRepository<Review>
{
    Task<(IReadOnlyList<Review> Items, int TotalCount)> GetByProductIdAsync(
        int productId,
        ReviewSortOrder sortOrder,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    Task<Review?> GetByProductAndUserAsync(int productId, int userId, CancellationToken cancellationToken = default);

    Task<(decimal AverageRating, int ReviewCount)> GetAggregateAsync(int productId, CancellationToken cancellationToken = default);

    Task<IReadOnlyDictionary<int, int>> GetRatingDistributionAsync(int productId, CancellationToken cancellationToken = default);
}
