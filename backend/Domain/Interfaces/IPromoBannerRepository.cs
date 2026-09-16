using Domain.Entities;

namespace Domain.Interfaces;

public interface IPromoBannerRepository : IRepository<PromoBanner>
{
    Task<IReadOnlyList<PromoBanner>> GetActiveAsync(CancellationToken cancellationToken = default);
}
