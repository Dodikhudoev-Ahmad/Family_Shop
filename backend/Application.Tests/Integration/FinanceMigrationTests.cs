using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Xunit;
using Domain.Entities;
using Infrastructure.Persistence;
using Infrastructure.Persistence.Migrations;

namespace Application.Tests.Integration;

/// <summary>Migration <c>AddFinance</c> and its backfill on a real PostgreSQL: repeatable, additive, constrained.</summary>
public class FinanceMigrationTests : IClassFixture<PostgresFixture>
{
    private readonly PostgresFixture _db;

    public FinanceMigrationTests(PostgresFixture db) => _db = db;

    private async Task<List<Payment>> PaymentsOfAsync(params int[] orderIds)
    {
        await using var ctx = _db.CreateContext();
        return await ctx.Payments.AsNoTracking().Where(p => orderIds.Contains(p.OrderId)).OrderBy(p => p.OrderId).ToListAsync();
    }

    private async Task RunBackfillAsync()
    {
        await using var ctx = _db.CreateContext();
        await ctx.Database.ExecuteSqlRawAsync(PaymentBackfill.Sql);
    }

    [PostgresFact]
    public async Task Backfill_CreatesIncomeOnlyForDeliveredOrders_DatedWithTheOrder_AndRoundedToWholeTenge()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var created = new DateTime(2026, 9, 20, 10, 0, 0, DateTimeKind.Utc);
        var delivered = await data.AddOrderAsync(15_000, OrderStatus.Delivered, created);
        var deliveredFraction = await data.AddOrderAsync(15_000.50m, OrderStatus.Delivered, created); // .5 rounds away from zero
        var deliveredFree = await data.AddOrderAsync(0, OrderStatus.Delivered, created);             // 100% promo: no money, no income
        var open = await data.AddOrderAsync(9_000, OrderStatus.Created, created);
        var shipped = await data.AddOrderAsync(9_000, OrderStatus.Shipped, created);
        var cancelled = await data.AddOrderAsync(9_000, OrderStatus.Cancelled, created);

        await RunBackfillAsync();

        var payments = await PaymentsOfAsync(delivered, deliveredFraction, deliveredFree, open, shipped, cancelled);
        Assert.Equal(2, payments.Count);
        Assert.All(payments, p => Assert.Equal(PaymentType.Income, p.Type));
        Assert.Equal(15_000m, payments.Single(p => p.OrderId == delivered).Amount);
        Assert.Equal(15_001m, payments.Single(p => p.OrderId == deliveredFraction).Amount);
        Assert.All(payments, p => Assert.Equal(created, p.CreatedAt));
    }

    [PostgresFact]
    public async Task Backfill_IsIdempotent_ARepeatRunChangesNothing_AndAFreshDeliveredOrderIsPickedUp()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var first = await data.AddOrderAsync(5_000, OrderStatus.Delivered);
        var second = await data.AddOrderAsync(7_000, OrderStatus.Delivered);

        await RunBackfillAsync();
        var afterFirst = await PaymentsOfAsync(first, second);
        await RunBackfillAsync();
        await RunBackfillAsync();
        var afterRepeat = await PaymentsOfAsync(first, second);

        Assert.Equal(2, afterFirst.Count);
        Assert.Equal(afterFirst.Select(p => (p.Id, p.OrderId, p.Amount, p.CreatedAt)), afterRepeat.Select(p => (p.Id, p.OrderId, p.Amount, p.CreatedAt)));

        var third = await data.AddOrderAsync(1_000, OrderStatus.Delivered);
        await RunBackfillAsync();
        var afterThird = await PaymentsOfAsync(first, second, third);
        Assert.Equal(3, afterThird.Count);
        Assert.Equal(afterFirst.Select(p => p.Id), afterThird.Where(p => p.OrderId != third).Select(p => p.Id));
    }

    [PostgresFact]
    public async Task Backfill_DoesNotTouchTheOrders()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var created = new DateTime(2026, 9, 21, 8, 0, 0, DateTimeKind.Utc);
        var id = await data.AddOrderAsync(12_345, OrderStatus.Delivered, created);

        await RunBackfillAsync();

        await using var ctx = _db.CreateContext();
        var order = await ctx.Orders.AsNoTracking().Include(o => o.Items).SingleAsync(o => o.Id == id);
        Assert.Equal(OrderStatus.Delivered, order.Status);
        Assert.Equal(12_345m, order.TotalPrice.Amount);
        Assert.Equal(created, order.CreatedAt);
        Assert.Single(order.Items);
    }

    [PostgresFact]
    public async Task TheMigration_CanBeRunAgain_WithoutErrors_AndWithoutLosingRows()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(3_000, OrderStatus.Delivered);
        await data.AddPaymentAsync(orderId, PaymentType.Income, 3_000, DateTime.UtcNow);
        await data.AddExpenseAsync(500, DateTime.UtcNow);

        await using (var ctx = _db.CreateContext())
        {
            var generator = ((IInfrastructure<IServiceProvider>)ctx).Instance.GetService(typeof(IMigrationsSqlGenerator)) as IMigrationsSqlGenerator;
            Assert.NotNull(generator);
            var up = new AddFinance().UpOperations;
            foreach (var command in generator!.Generate(up))
            {
                await ctx.Database.ExecuteSqlRawAsync(command.CommandText);
            }
        }

        Assert.Single(await PaymentsOfAsync(orderId));
        await using var after = _db.CreateContext();
        Assert.Equal(1, await after.Expenses.CountAsync(e => e.CreatedByUserId == data.AdminId));
    }

    [PostgresFact]
    public async Task TheDatabase_RefusesASecondIncomeOrReversal_ForTheSameOrder()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(3_000, OrderStatus.Delivered);
        await data.AddPaymentAsync(orderId, PaymentType.Income, 3_000, DateTime.UtcNow);
        await data.AddPaymentAsync(orderId, PaymentType.Reversal, 3_000, DateTime.UtcNow);

        foreach (var type in new[] { PaymentType.Income, PaymentType.Reversal })
        {
            var ex = await Assert.ThrowsAsync<DbUpdateException>(() => data.AddPaymentAsync(orderId, type, 3_000, DateTime.UtcNow));
            Assert.Equal("23505", ((PostgresException)ex.InnerException!).SqlState); // unique_violation
        }
    }

    [PostgresTheory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task TheDatabase_RefusesNonPositiveAmounts(int amount)
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(3_000, OrderStatus.Delivered);

        var payment = await Assert.ThrowsAsync<DbUpdateException>(() => data.AddPaymentAsync(orderId, PaymentType.Income, amount, DateTime.UtcNow));
        Assert.Equal("23514", ((PostgresException)payment.InnerException!).SqlState); // check_violation
        var expense = await Assert.ThrowsAsync<DbUpdateException>(() => data.AddExpenseAsync(amount, DateTime.UtcNow));
        Assert.Equal("23514", ((PostgresException)expense.InnerException!).SqlState);
    }

    [PostgresFact]
    public async Task APaymentKeepsItsOrderAlive_TheOrderCannotBeDeleted()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(3_000, OrderStatus.Delivered);
        await data.AddPaymentAsync(orderId, PaymentType.Income, 3_000, DateTime.UtcNow);

        await using var ctx = _db.CreateContext();
        var ex = await Assert.ThrowsAsync<PostgresException>(() =>
            ctx.Database.ExecuteSqlInterpolatedAsync($@"DELETE FROM ""Orders"" WHERE ""Id"" = {orderId}"));
        Assert.Equal("23503", ex.SqlState); // foreign_key_violation
    }

    [PostgresFact]
    public async Task SoftDeleteMigration_CanBeRunAgain_KeepsExistingExpensesNotDeleted_AndAddsTheColumns()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var expense = await data.AddExpenseAsync(500, DateTime.UtcNow);

        await using (var ctx = _db.CreateContext())
        {
            var generator = ((IInfrastructure<IServiceProvider>)ctx).Instance.GetService(typeof(IMigrationsSqlGenerator)) as IMigrationsSqlGenerator;
            foreach (var command in generator!.Generate(new AddExpenseSoftDelete().UpOperations))
            {
                await ctx.Database.ExecuteSqlRawAsync(command.CommandText);
            }
        }

        await using var after = _db.CreateContext();
        var row = await after.Expenses.AsNoTracking().SingleAsync(e => e.Id == expense);
        Assert.False(row.IsDeleted);
        Assert.Null(row.DeletedAt);
        Assert.Null(row.DeletedByUserId);
        Assert.Equal(500m, row.Amount);
    }

    [PostgresFact]
    public async Task AnExpensesDeleter_CannotBeRemovedFromUnderIt()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var admin = await data.AddAdminAsync();
        var expense = await data.AddExpenseAsync(500, DateTime.UtcNow);
        await using (var ctx = _db.CreateContext())
        {
            await new UnitOfWork(ctx).Finance.TryDeleteExpenseAsync(expense, admin, DateTime.UtcNow);
        }

        await using var again = _db.CreateContext();
        var ex = await Assert.ThrowsAsync<PostgresException>(() =>
            again.Database.ExecuteSqlInterpolatedAsync($@"DELETE FROM ""Users"" WHERE ""Id"" = {admin}"));
        Assert.Equal("23503", ex.SqlState);
    }
}
