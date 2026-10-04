using Microsoft.EntityFrameworkCore;
using Domain.Entities;
using Domain.Interfaces;

namespace Infrastructure.Persistence.Repositories;

public class FinanceRepository : IFinanceRepository
{
    private const int ExpenseCode = 2; // journal rows: 0 = income, 1 = reversal (PaymentType values), 2 = expense

    private readonly AppDbContext _context;

    public FinanceRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<FinanceTotals> GetTotalsAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        var payments = await _context.Payments
            .AsNoTracking()
            .Where(p => p.CreatedAt >= fromUtc && p.CreatedAt <= toUtc)
            .GroupBy(p => p.Type)
            .Select(g => new { Type = g.Key, Sum = g.Sum(p => p.Amount), Count = g.Count() })
            .ToListAsync(cancellationToken);

        var expenses = await _context.Expenses
            .AsNoTracking()
            .Where(e => !e.IsDeleted && e.ExpenseDate >= fromUtc && e.ExpenseDate <= toUtc)
            .GroupBy(_ => 1)
            .Select(g => new { Sum = g.Sum(e => e.Amount), Count = g.Count() })
            .ToListAsync(cancellationToken);

        var income = payments.FirstOrDefault(p => p.Type == PaymentType.Income);
        var reversal = payments.FirstOrDefault(p => p.Type == PaymentType.Reversal);
        var expense = expenses.FirstOrDefault();
        return new FinanceTotals(
            income?.Sum ?? 0, income?.Count ?? 0,
            reversal?.Sum ?? 0, reversal?.Count ?? 0,
            expense?.Sum ?? 0, expense?.Count ?? 0);
    }

    public async Task<IReadOnlyList<FinanceMovement>> GetMovementsAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        var payments = await _context.Payments
            .AsNoTracking()
            .Where(p => p.CreatedAt >= fromUtc && p.CreatedAt <= toUtc)
            .Select(p => new { p.Type, p.Amount, At = p.CreatedAt })
            .ToListAsync(cancellationToken);

        var expenses = await _context.Expenses
            .AsNoTracking()
            .Where(e => !e.IsDeleted && e.ExpenseDate >= fromUtc && e.ExpenseDate <= toUtc)
            .Select(e => new { e.Amount, At = e.ExpenseDate })
            .ToListAsync(cancellationToken);

        return payments.Select(p => new FinanceMovement(p.Type, p.Amount, p.At))
            .Concat(expenses.Select(e => new FinanceMovement(null, e.Amount, e.At)))
            .ToList();
    }

    private sealed class JournalRow
    {
        public int KindCode { get; set; }
        public int Id { get; set; }
        public DateTime Date { get; set; }
        public decimal Amount { get; set; }
        public int? OrderId { get; set; }
        public int? Category { get; set; }
        public string? Comment { get; set; }
        public string? Author { get; set; }
        public bool IsDeleted { get; set; }
        public DateTime? DeletedAt { get; set; }
    }

    private static FinanceEntry ToEntry(JournalRow r) => new(
        r.KindCode switch
        {
            ExpenseCode => FinanceEntryKind.Expense,
            (int)PaymentType.Reversal => FinanceEntryKind.Reversal,
            _ => FinanceEntryKind.Income
        },
        r.Id, r.Date, r.Amount, r.OrderId, r.Category is { } c ? (ExpenseCategory)c : null, r.Comment, r.Author, r.IsDeleted, r.DeletedAt);

    public async Task<(IReadOnlyList<FinanceEntry> Items, int TotalCount)> GetJournalAsync(
        FinanceEntryKind? kind, DateTime? fromUtc, DateTime? toUtc, bool includeDeleted, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        IQueryable<JournalRow> rows;
        var payments = _context.Payments.AsNoTracking()
            .Where(p => (fromUtc == null || p.CreatedAt >= fromUtc) && (toUtc == null || p.CreatedAt <= toUtc))
            .Select(p => new JournalRow
            {
                KindCode = (int)p.Type, Id = p.Id, Date = p.CreatedAt, Amount = p.Amount,
                OrderId = p.OrderId, Category = null, Comment = null, Author = null, IsDeleted = false, DeletedAt = null
            });
        var expenses = _context.Expenses.AsNoTracking()
            .Where(e => (includeDeleted || !e.IsDeleted) && (fromUtc == null || e.ExpenseDate >= fromUtc) && (toUtc == null || e.ExpenseDate <= toUtc))
            .Select(e => new JournalRow
            {
                KindCode = ExpenseCode, Id = e.Id, Date = e.ExpenseDate, Amount = e.Amount,
                OrderId = null, Category = (int)e.Category, Comment = e.Comment, Author = e.CreatedBy!.Name,
                IsDeleted = e.IsDeleted, DeletedAt = e.DeletedAt
            });

        rows = kind switch
        {
            FinanceEntryKind.Income => payments.Where(r => r.KindCode == (int)PaymentType.Income),
            FinanceEntryKind.Reversal => payments.Where(r => r.KindCode == (int)PaymentType.Reversal),
            FinanceEntryKind.Expense => expenses,
            _ => payments.Concat(expenses)
        };

        var total = await rows.CountAsync(cancellationToken);
        var items = await rows
            .OrderByDescending(r => r.Date).ThenByDescending(r => r.KindCode).ThenByDescending(r => r.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items.Select(ToEntry).ToList(), total);
    }

    public async Task<Expense> AddExpenseAsync(Expense expense, CancellationToken cancellationToken = default)
    {
        _context.Expenses.Add(expense);
        await _context.SaveChangesAsync(cancellationToken);
        return expense;
    }

    public async Task<FinanceEntry?> GetExpenseEntryAsync(int expenseId, CancellationToken cancellationToken = default)
    {
        var row = await _context.Expenses.AsNoTracking()
            .Where(e => e.Id == expenseId)
            .Select(e => new JournalRow
            {
                KindCode = ExpenseCode, Id = e.Id, Date = e.ExpenseDate, Amount = e.Amount,
                OrderId = null, Category = (int)e.Category, Comment = e.Comment, Author = e.CreatedBy!.Name,
                IsDeleted = e.IsDeleted, DeletedAt = e.DeletedAt
            })
            .FirstOrDefaultAsync(cancellationToken);
        return row is null ? null : ToEntry(row);
    }

    public async Task<bool> TryDeleteExpenseAsync(int expenseId, int adminUserId, DateTime at, CancellationToken cancellationToken = default)
    {
        // The condition IsDeleted = false is what makes a repeat harmless: the second delete matches nothing, so it cannot
        // overwrite who deleted the expense and when.
        var affected = await _context.Expenses
            .Where(e => e.Id == expenseId && !e.IsDeleted)
            .ExecuteUpdateAsync(s => s
                .SetProperty(e => e.IsDeleted, true)
                .SetProperty(e => e.DeletedAt, at)
                .SetProperty(e => e.DeletedByUserId, adminUserId), cancellationToken);
        return affected > 0;
    }
}
