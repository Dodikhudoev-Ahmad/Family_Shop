using Microsoft.EntityFrameworkCore;
using Domain.Entities;
using Domain.Interfaces;

namespace Infrastructure.Persistence.Repositories;

public class RefreshTokenRepository : RepositoryBase<RefreshToken>, IRefreshTokenRepository
{
    public RefreshTokenRepository(AppDbContext context) : base(context)
    {
    }

    public async Task<RefreshToken?> GetByTokenHashAsync(string tokenHash, CancellationToken cancellationToken = default)
    {
        return await DbSet.Include(rt => rt.User).FirstOrDefaultAsync(rt => rt.TokenHash == tokenHash, cancellationToken);
    }

    public async Task<bool> TryMarkRotatedAsync(int id, DateTime now, CancellationToken cancellationToken = default)
    {
        // One conditional UPDATE: the row only changes if nobody rotated or revoked it first, so two
        // simultaneous requests with the same token can never both succeed.
        var affected = await DbSet
            .Where(rt => rt.Id == id && rt.RotatedAt == null && rt.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(rt => rt.RotatedAt, now).SetProperty(rt => rt.LastUsedAt, now), cancellationToken);
        return affected == 1;
    }

    public Task<int> RevokeFamilyAsync(Guid familyId, DateTime now, CancellationToken cancellationToken = default)
    {
        return DbSet
            .Where(rt => rt.FamilyId == familyId && rt.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(rt => rt.RevokedAt, now), cancellationToken);
    }

    public Task<int> RevokeAllForUserAsync(int userId, DateTime now, CancellationToken cancellationToken = default)
    {
        return DbSet
            .Where(rt => rt.UserId == userId && rt.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(rt => rt.RevokedAt, now), cancellationToken);
    }

    public Task<int> RevokeFamilyForUserAsync(int userId, Guid familyId, DateTime now, CancellationToken cancellationToken = default)
    {
        return DbSet
            .Where(rt => rt.UserId == userId && rt.FamilyId == familyId && rt.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(rt => rt.RevokedAt, now), cancellationToken);
    }

    public async Task<IReadOnlyList<RefreshToken>> GetActiveSessionsAsync(int userId, DateTime now, CancellationToken cancellationToken = default)
    {
        return await DbSet
            .Where(rt => rt.UserId == userId && rt.RevokedAt == null && rt.RotatedAt == null
                         && rt.ExpiresAt > now && rt.AbsoluteExpiresAt > now)
            .OrderByDescending(rt => rt.LastUsedAt ?? rt.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public Task<int> DeleteDeadTokensAsync(DateTime olderThan, CancellationToken cancellationToken = default)
    {
        return DbSet
            .Where(rt => (rt.ExpiresAt < olderThan || rt.AbsoluteExpiresAt < olderThan)
                         || (rt.RevokedAt != null && rt.RevokedAt < olderThan)
                         || (rt.RotatedAt != null && rt.RotatedAt < olderThan))
            .ExecuteDeleteAsync(cancellationToken);
    }
}
