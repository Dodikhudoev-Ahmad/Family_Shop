namespace Domain.Interfaces;

/// <summary>Writes to the money ledger. Both operations are idempotent in the database (unique index on OrderId + Type).</summary>
public interface IPaymentRepository
{
    /// <summary><c>INSERT ... ON CONFLICT (OrderId, Type) DO NOTHING</c> of an income. False when the order already has one.</summary>
    Task<bool> TryAddIncomeAsync(int orderId, decimal amount, DateTime at, CancellationToken cancellationToken = default);

    /// <summary>Adds the reversal of the order's income, for the same amount as that income, in one statement. False when the
    /// order has no income or already has its reversal.</summary>
    Task<bool> TryAddReversalAsync(int orderId, DateTime at, CancellationToken cancellationToken = default);
}
