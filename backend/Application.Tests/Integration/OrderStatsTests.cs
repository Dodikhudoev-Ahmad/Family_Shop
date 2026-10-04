using Microsoft.EntityFrameworkCore;
using Xunit;
using Domain.Entities;
using Domain.ValueObjects;
using Application.Common;
using Application.DTOs;
using Application.Services;
using Infrastructure.Persistence;

namespace Application.Tests.Integration;

/// <summary>The admin dashboard cards ("Заказов сегодня", "Выручка сегодня") against a real database.</summary>
public class OrderStatsTests : IClassFixture<PostgresFixture>
{
    private readonly PostgresFixture _db;

    public OrderStatsTests(PostgresFixture db) => _db = db;

    private async Task<(int UserId, int ProductId)> SeedAsync()
    {
        await using var ctx = _db.CreateContext();
        var user = new User { Email = new Email($"u{Guid.NewGuid():N}@example.com"), Name = "T", PasswordHash = "x" };
        var category = new Category { Name = "T", Slug = $"t-{Guid.NewGuid():N}", HasSizes = false };
        ctx.AddRange(user, category);
        await ctx.SaveChangesAsync();
        var product = new Product { Name = "P", Price = new Money(1000), Stock = 100, CategoryId = category.Id };
        ctx.Add(product);
        await ctx.SaveChangesAsync();
        return (user.Id, product.Id);
    }

    private async Task<int> AddOrderAsync(int userId, int productId, decimal total, OrderStatus status, DateTime? createdAt = null)
    {
        await using var ctx = _db.CreateContext();
        var order = new Order { UserId = userId, Status = status, CreatedAt = createdAt ?? DateTime.UtcNow, TotalPrice = new Money(total), ContactName = "T", ContactPhone = "+7" };
        order.Items.Add(new OrderItem { ProductId = productId, Quantity = 1, Price = new Money(total) });
        ctx.Add(order);
        await ctx.SaveChangesAsync();
        return order.Id;
    }

    private async Task<Application.DTOs.OrderStatsDto> StatsAsync()
    {
        await using var ctx = _db.CreateContext();
        return await new OrderService(new UnitOfWork(ctx)).GetStatsAsync();
    }

    private async Task<int> PlaceAsync(int userId, int productId, int quantity)
    {
        await using var ctx = _db.CreateContext();
        var placed = await new OrderService(new UnitOfWork(ctx)).CreateOrderAsync(
            userId, new(new() { new(productId, quantity, null) }, "T", "+7 700 000 0001", DeliveryMethod.Pickup, null, null));
        Assert.True(placed.IsSuccess);
        return placed.Value!.Id;
    }

    private async Task MoveAsync(int orderId, params OrderStatus[] path)
    {
        foreach (var status in path)
        {
            await using var ctx = _db.CreateContext();
            Assert.True((await new OrderService(new UnitOfWork(ctx)).UpdateOrderStatusAsync(orderId, status)).IsSuccess);
        }
    }

    [PostgresFact]
    public async Task Today_IsDeliveredMoney_OpenOrCancelledBringNone()
    {
        var (userId, productId) = await SeedAsync();
        var before = await StatsAsync();

        var created = await PlaceAsync(userId, productId, 1);
        var processing = await PlaceAsync(userId, productId, 1);
        var shipped = await PlaceAsync(userId, productId, 1);
        var delivered = await PlaceAsync(userId, productId, 2);
        var cancelledFromShipped = await PlaceAsync(userId, productId, 5);
        await MoveAsync(processing, OrderStatus.Processing);
        await MoveAsync(shipped, OrderStatus.Processing, OrderStatus.Shipped);
        await MoveAsync(delivered, OrderStatus.Processing, OrderStatus.Shipped, OrderStatus.Delivered);
        await MoveAsync(cancelledFromShipped, OrderStatus.Processing, OrderStatus.Shipped, OrderStatus.Cancelled);

        var after = await StatsAsync();
        Assert.Equal(1, after.OrdersToday - before.OrdersToday);       // only the delivered one
        Assert.Equal(2_000m, after.RevenueToday - before.RevenueToday); // 2 x 1000
        Assert.Equal(5, after.TotalOrders - before.TotalOrders);        // "Всего заказов" counts every order placed
        Assert.NotEqual(0, created + processing + shipped);
    }

    [PostgresFact]
    public async Task PlacedOrder_NotInToday_UntilDelivered_CancelRestoresStock()
    {
        var (userId, productId) = await SeedAsync();
        var before = await StatsAsync();
        var orderId = await PlaceAsync(userId, productId, 3);

        var placedStats = await StatsAsync();
        Assert.Equal(0, placedStats.OrdersToday - before.OrdersToday);
        Assert.Equal(0m, placedStats.RevenueToday - before.RevenueToday);
        Assert.Equal(97, await StockAsync(productId));

        await MoveAsync(orderId, OrderStatus.Cancelled);

        var cancelledStats = await StatsAsync();
        Assert.Equal(0, cancelledStats.OrdersToday - before.OrdersToday);
        Assert.Equal(0m, cancelledStats.RevenueToday - before.RevenueToday);
        Assert.Equal(1, cancelledStats.TotalOrders - before.TotalOrders);
        Assert.Equal(100, await StockAsync(productId)); // the goods are back on sale
    }

    [PostgresFact]
    public async Task DeliveredToday_CountsToday_EarlierPaymentDoesNot()
    {
        var (userId, productId) = await SeedAsync();
        var data = new FinanceTestData(_db);
        var before = await StatsAsync();

        var placedYesterday = await AddOrderAsync(userId, productId, 50_000, OrderStatus.Shipped, DateTime.UtcNow.AddDays(-1));
        await MoveAsync(placedYesterday, OrderStatus.Delivered);

        var earlier = await AddOrderAsync(userId, productId, 70_000, OrderStatus.Delivered, DateTime.UtcNow.AddDays(-3));
        await data.AddPaymentAsync(earlier, PaymentType.Income, 70_000, DateTime.UtcNow.AddDays(-2));

        var after = await StatsAsync();
        Assert.Equal(1, after.OrdersToday - before.OrdersToday);
        Assert.Equal(50_000m, after.RevenueToday - before.RevenueToday);
        Assert.Equal(2, after.TotalOrders - before.TotalOrders);
    }

    private async Task<int> StockAsync(int productId)
    {
        await using var ctx = _db.CreateContext();
        return await ctx.Set<Product>().AsNoTracking().Where(p => p.Id == productId).Select(p => p.Stock).SingleAsync();
    }

    // ---- the shop's calendar (Asia/Almaty, UTC+5), with a fixed clock far from every other test's data ----

    // 12:00 on 15 May 2030 in Almaty (07:00 UTC).
    private static readonly DateTime FixedNowUtc = new(2030, 5, 15, 7, 0, 0, DateTimeKind.Utc);
    private static StoreClock FixedClock() => StoreClock.FromId("Asia/Almaty", () => FixedNowUtc);

    private async Task<OrderStatsDto> StatsAtFixedClockAsync()
    {
        await using var ctx = _db.CreateContext();
        return await new OrderService(new UnitOfWork(ctx), FixedClock()).GetStatsAsync();
    }

    [PostgresFact]
    public async Task Payment_AfterLocalMidnight_BelongsToNewLocalDay()
    {
        var (userId, productId) = await SeedAsync();
        var data = new FinanceTestData(_db);
        // 00:30 on 15 May in Almaty = 19:30 on 14 May UTC: UTC's calendar would call it yesterday.
        await data.AddPaymentAsync(await AddOrderAsync(userId, productId, 1_000, OrderStatus.Delivered), PaymentType.Income, 1_000, new DateTime(2030, 5, 14, 19, 30, 0, DateTimeKind.Utc));
        // 23:30 on 15 May in Almaty = 18:30 on 15 May UTC: the same local day.
        await data.AddPaymentAsync(await AddOrderAsync(userId, productId, 2_000, OrderStatus.Delivered), PaymentType.Income, 2_000, new DateTime(2030, 5, 15, 18, 30, 0, DateTimeKind.Utc));
        // 23:30 on 14 May in Almaty = 18:30 on 14 May UTC: yesterday in both calendars.
        await data.AddPaymentAsync(await AddOrderAsync(userId, productId, 4_000, OrderStatus.Delivered), PaymentType.Income, 4_000, new DateTime(2030, 5, 14, 18, 30, 0, DateTimeKind.Utc));

        var stats = await StatsAtFixedClockAsync();

        Assert.Equal(2, stats.OrdersToday);
        Assert.Equal(3_000m, stats.RevenueToday);
        Assert.Equal("Asia/Almaty", stats.StoreTimeZone);
    }

    [PostgresFact]
    public async Task TheDateFilterOfTheOrdersPage_IsTheShopsCalendarDay_BothEndsIncluded()
    {
        var (userId, productId) = await SeedAsync();
        var early = await AddOrderAsync(userId, productId, 1_000, OrderStatus.Created, new DateTime(2029, 5, 14, 19, 30, 0, DateTimeKind.Utc)); // 00:30 on 15 May local
        var late = await AddOrderAsync(userId, productId, 2_000, OrderStatus.Created, new DateTime(2029, 5, 15, 18, 30, 0, DateTimeKind.Utc));  // 23:30 on 15 May local
        var yesterday = await AddOrderAsync(userId, productId, 3_000, OrderStatus.Created, new DateTime(2029, 5, 14, 18, 30, 0, DateTimeKind.Utc)); // 23:30 on 14 May local
        var tomorrow = await AddOrderAsync(userId, productId, 4_000, OrderStatus.Created, new DateTime(2029, 5, 15, 19, 30, 0, DateTimeKind.Utc)); // 00:30 on 16 May local

        await using var ctx = _db.CreateContext();
        var page = await new OrderService(new UnitOfWork(ctx), FixedClock()).GetOrdersAsync(
            new OrderFilterDto(DateFrom: new DateTime(2029, 5, 15), DateTo: new DateTime(2029, 5, 15), Page: 1, PageSize: 50));

        var ids = page.Items.Select(o => o.Id).ToHashSet();
        Assert.Contains(early, ids);
        Assert.Contains(late, ids);
        Assert.DoesNotContain(yesterday, ids);
        Assert.DoesNotContain(tomorrow, ids);
    }
}
