using Microsoft.EntityFrameworkCore;
using Domain.Entities;
using Domain.Interfaces;

namespace Infrastructure.Persistence.Repositories;

public class PromoCodeRepository : RepositoryBase<PromoCode>, IPromoCodeRepository
{
    public PromoCodeRepository(AppDbContext context) : base(context)
    {
    }

    public Task<PromoCode?> GetByCodeAsync(string code, CancellationToken cancellationToken = default)
    {
        return DbSet.FirstOrDefaultAsync(p => p.Code == code, cancellationToken);
    }

    public Task<bool> AnyByCodeAsync(string code, int? excludeId, CancellationToken cancellationToken = default)
    {
        return DbSet.AnyAsync(p => p.Code == code && p.Id != excludeId, cancellationToken);
    }

    public async Task<(IReadOnlyList<PromoCode> Items, int TotalCount)> GetByFilterAsync(
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var query = DbSet.OrderByDescending(p => p.Id);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<bool> TryIncrementUsageAsync(int id, CancellationToken cancellationToken = default)
    {
        var affected = await DbSet
            .Where(p => p.Id == id && (p.UsageLimit == null || p.UsageCount < p.UsageLimit))
            .ExecuteUpdateAsync(setters => setters.SetProperty(p => p.UsageCount, p => p.UsageCount + 1), cancellationToken);

        return affected > 0;
    }
}
