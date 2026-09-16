namespace Domain.Interfaces;

public interface IUnitOfWork
{
    IProductRepository Products { get; }
    ICategoryRepository Categories { get; }
    IOrderRepository Orders { get; }
    IUserRepository Users { get; }
    IRefreshTokenRepository RefreshTokens { get; }
    IReviewRepository Reviews { get; }
    IPromoCodeRepository PromoCodes { get; }
    IPromoBannerRepository PromoBanners { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Runs <paramref name="action"/> inside a database transaction, committing only if it returns
    /// true and rolling back (including any exception) otherwise. Used where a mutation must be
    /// atomic with an atomic conditional update from a repository (e.g. promo code usage vs. order
    /// creation) that falls outside the single-SaveChangesAsync boundary used elsewhere.
    /// </summary>
    Task<bool> ExecuteInTransactionAsync(Func<CancellationToken, Task<bool>> action, CancellationToken cancellationToken = default);
}
