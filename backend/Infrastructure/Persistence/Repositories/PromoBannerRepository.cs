using Microsoft.EntityFrameworkCore;
using Domain.Entities;
using Domain.Interfaces;

namespace Infrastructure.Persistence.Repositories;

public class PromoBannerRepository : RepositoryBase<PromoBanner>, IPromoBannerRepository
{
    public PromoBannerRepository(AppDbContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<PromoBanner>> GetActiveAsync(PromoBannerPlacement placement, CancellationToken cancellationToken = default)
    {
        return await DbSet
            .Where(b => b.IsActive && (b.Placement == placement || b.Placement == PromoBannerPlacement.Both))
            .OrderBy(b => b.SortOrder)
            .ThenBy(b => b.Id)
            .ToListAsync(cancellationToken);
    }
}
