using Microsoft.EntityFrameworkCore;
using Domain.Entities;
using Domain.Interfaces;

namespace Infrastructure.Persistence.Repositories;

public class PaymentRepository : IPaymentRepository
{
    private readonly AppDbContext _context;

    public PaymentRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<bool> TryAddIncomeAsync(int orderId, decimal amount, DateTime at, CancellationToken cancellationToken = default)
    {
        // The unique index (OrderId, Type) decides: a second income for the same order is silently not inserted.
        var inserted = await _context.Database.ExecuteSqlInterpolatedAsync(
            $@"INSERT INTO ""Payments"" (""OrderId"", ""Type"", ""Amount"", ""CreatedAt"")
               VALUES ({orderId}, {(int)PaymentType.Income}, {amount}, {at})
               ON CONFLICT (""OrderId"", ""Type"") DO NOTHING",
            cancellationToken);
        return inserted > 0;
    }

    public async Task<bool> TryAddReversalAsync(int orderId, DateTime at, CancellationToken cancellationToken = default)
    {
        // One statement: the amount is read from the income itself, so the reversal can never differ from it, and with no
        // income there is nothing to select and nothing to reverse.
        var inserted = await _context.Database.ExecuteSqlInterpolatedAsync(
            $@"INSERT INTO ""Payments"" (""OrderId"", ""Type"", ""Amount"", ""CreatedAt"")
               SELECT ""OrderId"", {(int)PaymentType.Reversal}, ""Amount"", {at}
               FROM ""Payments""
               WHERE ""OrderId"" = {orderId} AND ""Type"" = {(int)PaymentType.Income}
               ON CONFLICT (""OrderId"", ""Type"") DO NOTHING",
            cancellationToken);
        return inserted > 0;
    }
}
