using Microsoft.EntityFrameworkCore;
using Xunit;
using Domain.Entities;
using Application.Common;
using Application.Services;
using Infrastructure.Persistence;

namespace Application.Tests.Integration;

/// <summary>Income on delivery, storno, and the guarantee of a single income per order, on a real PostgreSQL.</summary>
public class FinanceLedgerTests : IClassFixture<PostgresFixture>
{
    private readonly PostgresFixture _db;

    public FinanceLedgerTests(PostgresFixture db) => _db = db;

    private async Task<Application.Common.Result<Application.DTOs.AdminOrderDto>> MoveAsync(int orderId, OrderStatus status)
    {
        await using var ctx = _db.CreateContext();
        return await new OrderService(new UnitOfWork(ctx)).UpdateOrderStatusAsync(orderId, status);
    }

    private async Task<List<Payment>> PaymentsAsync(int orderId)
    {
        await using var ctx = _db.CreateContext();
        return await ctx.Payments.AsNoTracking().Where(p => p.OrderId == orderId).OrderBy(p => p.Type).ToListAsync();
    }

    [PostgresFact]
    public async Task Delivering_CreatesExactlyOneIncome_OfTheOrderTotal_AtTheMomentOfDelivery()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(12_000, OrderStatus.Shipped, DateTime.UtcNow.AddDays(-2));
        var before = DateTime.UtcNow;

        Assert.True((await MoveAsync(orderId, OrderStatus.Delivered)).IsSuccess);

        var payment = Assert.Single(await PaymentsAsync(orderId));
        Assert.Equal(PaymentType.Income, payment.Type);
        Assert.Equal(12_000m, payment.Amount);
        Assert.InRange(payment.CreatedAt, before.AddSeconds(-1), DateTime.UtcNow.AddSeconds(1));
    }

    [PostgresFact]
    public async Task RepeatingTheSameStatus_IsANoOp_NoSecondIncome()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(5_000, OrderStatus.Shipped);

        Assert.True((await MoveAsync(orderId, OrderStatus.Delivered)).IsSuccess);
        Assert.True((await MoveAsync(orderId, OrderStatus.Delivered)).IsSuccess);
        Assert.True((await MoveAsync(orderId, OrderStatus.Delivered)).IsSuccess);

        Assert.Single(await PaymentsAsync(orderId));
    }

    [PostgresFact]
    public async Task ManyParallelDeliveryRequests_ProduceOneIncome_AndTheLosersGetAConflict()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(8_000, OrderStatus.Shipped);

        var results = await Task.WhenAll(Enumerable.Range(0, 12).Select(_ => Task.Run(() => MoveAsync(orderId, OrderStatus.Delivered))));

        var payment = Assert.Single(await PaymentsAsync(orderId));
        Assert.Equal(8_000m, payment.Amount);
        Assert.All(results.Where(r => !r.IsSuccess), r => Assert.Equal(ResultErrorCodes.Conflict, r.ErrorCode));
        Assert.Contains(results, r => r.IsSuccess);
    }

    [PostgresTheory]
    [InlineData(OrderStatus.Created)]
    [InlineData(OrderStatus.Processing)]
    [InlineData(OrderStatus.Shipped)]
    public async Task CancellingBeforeDelivery_CreatesNoPayments(OrderStatus from)
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(5_000, from);

        Assert.True((await MoveAsync(orderId, OrderStatus.Cancelled)).IsSuccess);

        Assert.Empty(await PaymentsAsync(orderId));
    }

    [PostgresFact]
    public async Task MovingForwardWithoutDelivery_CreatesNoPayments()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(5_000, OrderStatus.Created);

        Assert.True((await MoveAsync(orderId, OrderStatus.Processing)).IsSuccess);
        Assert.True((await MoveAsync(orderId, OrderStatus.Shipped)).IsSuccess);

        Assert.Empty(await PaymentsAsync(orderId));
    }

    [PostgresFact]
    public async Task ADeliveredOrder_CannotBeCancelled_SoNoReversalAppears()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(5_000, OrderStatus.Shipped);
        Assert.True((await MoveAsync(orderId, OrderStatus.Delivered)).IsSuccess);

        var cancel = await MoveAsync(orderId, OrderStatus.Cancelled);

        Assert.False(cancel.IsSuccess);
        Assert.Equal(PaymentType.Income, Assert.Single(await PaymentsAsync(orderId)).Type);
    }

    [PostgresFact]
    public async Task AnOrderWorthNothing_GetsNoIncome()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(0, OrderStatus.Shipped); // a 100% promo

        Assert.True((await MoveAsync(orderId, OrderStatus.Delivered)).IsSuccess);

        Assert.Empty(await PaymentsAsync(orderId));
    }

    [PostgresFact]
    public async Task TheIncomeIsWholeTenge_HalfAwayFromZero()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(1_000.50m, OrderStatus.Shipped);

        Assert.True((await MoveAsync(orderId, OrderStatus.Delivered)).IsSuccess);

        Assert.Equal(1_001m, Assert.Single(await PaymentsAsync(orderId)).Amount);
    }

    [PostgresFact]
    public async Task Ledger_ReversalOfADeliveredOrder_IsTheIncomesOwnAmount_AndOnlyOnce()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(9_999, OrderStatus.Delivered);
        await data.AddPaymentAsync(orderId, PaymentType.Income, 9_999, DateTime.UtcNow.AddHours(-3));
        var at = DateTime.UtcNow;

        await using (var ctx = _db.CreateContext())
        {
            var payments = new UnitOfWork(ctx).Payments;
            await OrderLedger.RecordTransitionAsync(payments, orderId, 1, OrderStatus.Delivered, OrderStatus.Cancelled, at);
            await OrderLedger.RecordTransitionAsync(payments, orderId, 1, OrderStatus.Delivered, OrderStatus.Cancelled, at);
        }

        var rows = await PaymentsAsync(orderId);
        Assert.Equal(new[] { PaymentType.Income, PaymentType.Reversal }, rows.Select(p => p.Type).ToArray());
        Assert.Equal(9_999m, rows[1].Amount); // taken from the income, not from the (here deliberately different) order total
    }

    [PostgresFact]
    public async Task Ledger_ReversalWithoutAnIncome_IsNotCreated_AndCancelFromOpenStatesIsIgnored()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var noIncome = await data.AddOrderAsync(5_000, OrderStatus.Delivered);
        var open = await data.AddOrderAsync(5_000, OrderStatus.Shipped);

        await using (var ctx = _db.CreateContext())
        {
            var payments = new UnitOfWork(ctx).Payments;
            await OrderLedger.RecordTransitionAsync(payments, noIncome, 5_000, OrderStatus.Delivered, OrderStatus.Cancelled, DateTime.UtcNow);
            await OrderLedger.RecordTransitionAsync(payments, open, 5_000, OrderStatus.Shipped, OrderStatus.Cancelled, DateTime.UtcNow);
        }

        Assert.Empty(await PaymentsAsync(noIncome));
        Assert.Empty(await PaymentsAsync(open));
    }

    [PostgresFact]
    public async Task Ledger_ParallelIncomeInserts_LeaveOneRow()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(4_000, OrderStatus.Delivered);

        var inserted = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => Task.Run(async () =>
        {
            await using var ctx = _db.CreateContext();
            return await new UnitOfWork(ctx).Payments.TryAddIncomeAsync(orderId, 4_000, DateTime.UtcNow);
        })));

        Assert.Equal(1, inserted.Count(x => x));
        Assert.Single(await PaymentsAsync(orderId));
    }

    [Theory]
    [InlineData(1000.4, 1000)]
    [InlineData(1000.5, 1001)]
    [InlineData(1000.6, 1001)]
    [InlineData(0.49, 0)]
    public void WholeTenge_RoundsToTheNearest_HalfAwayFromZero(double input, double expected) =>
        Assert.Equal((decimal)expected, FinanceMoney.WholeTenge((decimal)input));
}
