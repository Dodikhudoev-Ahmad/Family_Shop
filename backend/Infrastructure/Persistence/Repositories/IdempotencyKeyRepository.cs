using Microsoft.EntityFrameworkCore;
using Domain.Entities;
using Domain.Interfaces;

namespace Infrastructure.Persistence.Repositories;

public class IdempotencyKeyRepository : IIdempotencyKeyRepository
{
    private readonly AppDbContext _context;

    public IdempotencyKeyRepository(AppDbContext context)
    {
        _context = context;
    }

    public Task<IdempotencyKey?> GetAsync(int userId, string key, DateTime notBefore, CancellationToken cancellationToken = default) =>
        _context.Set<IdempotencyKey>()
            .AsNoTracking()
            .FirstOrDefaultAsync(k => k.UserId == userId && k.Key == key && k.CreatedAt >= notBefore, cancellationToken);

    public async Task<bool> TryClaimAsync(int userId, string key, string requestHash, DateTime now, DateTime notBefore, CancellationToken cancellationToken = default)
    {
        // An expired record that the cleanup job has not reached yet must not block a new use of the key.
        await _context.Set<IdempotencyKey>()
            .Where(k => k.UserId == userId && k.Key == key && k.CreatedAt < notBefore)
            .ExecuteDeleteAsync(cancellationToken);

        // The unique index (UserId, Key) decides a race: the second INSERT waits for the first transaction, then does nothing.
        var inserted = await _context.Database.ExecuteSqlInterpolatedAsync(
            $@"INSERT INTO ""IdempotencyKeys"" (""Key"", ""UserId"", ""RequestHash"", ""ResponseStatus"", ""CreatedAt"")
               VALUES ({key}, {userId}, {requestHash}, 0, {now})
               ON CONFLICT (""UserId"", ""Key"") DO NOTHING",
            cancellationToken);
        return inserted > 0;
    }

    public Task CompleteAsync(int userId, string key, int responseStatus, string responseBody, CancellationToken cancellationToken = default) =>
        _context.Set<IdempotencyKey>()
            .Where(k => k.UserId == userId && k.Key == key)
            .ExecuteUpdateAsync(s => s
                .SetProperty(k => k.ResponseStatus, responseStatus)
                .SetProperty(k => k.ResponseBody, responseBody), cancellationToken);

    public Task<int> DeleteOlderThanAsync(DateTime cutoff, CancellationToken cancellationToken = default) =>
        _context.Set<IdempotencyKey>().Where(k => k.CreatedAt < cutoff).ExecuteDeleteAsync(cancellationToken);
}
