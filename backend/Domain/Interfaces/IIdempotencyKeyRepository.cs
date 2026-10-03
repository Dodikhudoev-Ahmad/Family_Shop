using Domain.Entities;

namespace Domain.Interfaces;

public interface IIdempotencyKeyRepository
{
    /// <summary>The saved record for this user and key, or null when there is none or it is older than <paramref name="notBefore"/>.</summary>
    Task<IdempotencyKey?> GetAsync(int userId, string key, DateTime notBefore, CancellationToken cancellationToken = default);

    /// <summary>Claims the key: an expired record for it is removed, then <c>INSERT ... ON CONFLICT DO NOTHING</c>. False when
    /// the key is taken. Inside a transaction a concurrent claim of the same key waits for this transaction to finish
    /// (the unique index), so exactly one of two racing requests proceeds.</summary>
    Task<bool> TryClaimAsync(int userId, string key, string requestHash, DateTime now, DateTime notBefore, CancellationToken cancellationToken = default);

    /// <summary>Stores the response of the request that holds the claim.</summary>
    Task CompleteAsync(int userId, string key, int responseStatus, string responseBody, CancellationToken cancellationToken = default);

    Task<int> DeleteOlderThanAsync(DateTime cutoff, CancellationToken cancellationToken = default);
}
