using Microsoft.EntityFrameworkCore;
using Domain.Entities;
using Domain.Interfaces;

namespace Infrastructure.Persistence.Repositories;

public class EmailTokenRepository : RepositoryBase<EmailToken>, IEmailTokenRepository
{
    public EmailTokenRepository(AppDbContext context) : base(context)
    {
    }

    public Task<EmailToken?> GetUsableAsync(string tokenHash, EmailTokenPurpose purpose, DateTime now, CancellationToken cancellationToken = default)
    {
        return DbSet.FirstOrDefaultAsync(
            t => t.TokenHash == tokenHash && t.Purpose == purpose && t.UsedAt == null && t.ExpiresAt > now, cancellationToken);
    }

    public async Task<bool> TryConsumeAsync(int id, DateTime now, CancellationToken cancellationToken = default)
    {
        // One conditional UPDATE: of two simultaneous requests with the same token only one changes the row.
        var affected = await DbSet
            .Where(t => t.Id == id && t.UsedAt == null && t.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.UsedAt, now), cancellationToken);
        return affected == 1;
    }

    public Task<int> DeleteUnusedAsync(int userId, EmailTokenPurpose purpose, CancellationToken cancellationToken = default)
    {
        return DbSet.Where(t => t.UserId == userId && t.Purpose == purpose && t.UsedAt == null).ExecuteDeleteAsync(cancellationToken);
    }

    public Task<int> DeleteAllForUserAsync(int userId, CancellationToken cancellationToken = default)
    {
        return DbSet.Where(t => t.UserId == userId).ExecuteDeleteAsync(cancellationToken);
    }

    public Task<int> DeleteDeadAsync(DateTime olderThan, CancellationToken cancellationToken = default)
    {
        return DbSet.Where(t => t.ExpiresAt < olderThan || (t.UsedAt != null && t.UsedAt < olderThan)).ExecuteDeleteAsync(cancellationToken);
    }
}
