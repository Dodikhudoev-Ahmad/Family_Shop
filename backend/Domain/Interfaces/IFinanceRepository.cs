using Domain.Entities;

namespace Domain.Interfaces;

public record FinanceTotals(decimal Income, int IncomeCount, decimal Reversals, int ReversalCount, decimal Expenses, int ExpenseCount);

/// <summary>One dated money movement for charts: a payment (<paramref name="Type"/> set) or an expense (null).</summary>
public record FinanceMovement(PaymentType? Type, decimal Amount, DateTime At);

public enum FinanceEntryKind
{
    Income,
    Reversal,
    Expense
}

public record FinanceEntry(
    FinanceEntryKind Kind,
    int Id,
    DateTime Date,
    decimal Amount,
    int? OrderId,
    ExpenseCategory? Category,
    string? Comment,
    string? Author,
    bool IsDeleted = false,
    DateTime? DeletedAt = null);

public interface IFinanceRepository
{
    /// <summary>Sums of the period; <paramref name="fromUtc"/> inclusive, <paramref name="toUtc"/> inclusive. Deleted expenses are not counted.</summary>
    Task<FinanceTotals> GetTotalsAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default);

    /// <summary>Every payment and (not deleted) expense in the period as (type, amount, instant), for grouping by the shop's calendar.</summary>
    Task<IReadOnlyList<FinanceMovement>> GetMovementsAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default);

    /// <summary>The unified journal (payments and expenses), newest first with a fixed tiebreak, optionally one kind only. Deleted
    /// expenses are left out unless <paramref name="includeDeleted"/>.</summary>
    Task<(IReadOnlyList<FinanceEntry> Items, int TotalCount)> GetJournalAsync(
        FinanceEntryKind? kind, DateTime? fromUtc, DateTime? toUtc, bool includeDeleted, int page, int pageSize, CancellationToken cancellationToken = default);

    Task<Expense> AddExpenseAsync(Expense expense, CancellationToken cancellationToken = default);

    /// <summary>One expense as a journal entry, deleted or not; null when there is no such expense.</summary>
    Task<FinanceEntry?> GetExpenseEntryAsync(int expenseId, CancellationToken cancellationToken = default);

    /// <summary>Soft delete: <c>UPDATE ... WHERE Id = id AND IsDeleted = false</c>. True only for the call that actually deleted it;
    /// a repeat (or a race loser) gets false and leaves DeletedAt / DeletedByUserId of the first delete untouched.</summary>
    Task<bool> TryDeleteExpenseAsync(int expenseId, int adminUserId, DateTime at, CancellationToken cancellationToken = default);
}
