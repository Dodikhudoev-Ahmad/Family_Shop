using Domain.Entities;

namespace Domain.Interfaces;

public interface IPromoCodeRepository : IRepository<PromoCode>
{
    Task<PromoCode?> GetByCodeAsync(string code, CancellationToken cancellationToken = default);

    Task<bool> AnyByCodeAsync(string code, int? excludeId, CancellationToken cancellationToken = default);

    Task<(IReadOnlyList<PromoCode> Items, int TotalCount)> GetByFilterAsync(
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Atomically increments UsageCount by one, but only if the promo code is still under its usage
    /// limit (or has none). Returns true if the increment was applied, false if the limit was already
    /// reached — avoids a read-then-write race between concurrent orders using the same code.
    /// </summary>
    Task<bool> TryIncrementUsageAsync(int id, CancellationToken cancellationToken = default);
}
