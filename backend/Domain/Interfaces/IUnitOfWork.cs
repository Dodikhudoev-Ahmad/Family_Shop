namespace Domain.Interfaces;

public interface IUnitOfWork
{
    IProductRepository Products { get; }
    ICategoryRepository Categories { get; }
    IOrderRepository Orders { get; }
    IUserRepository Users { get; }
    IRefreshTokenRepository RefreshTokens { get; }
    IReviewRepository Reviews { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
