using Microsoft.EntityFrameworkCore;
using Xunit;
using Domain.Entities;
using Domain.ValueObjects;
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

    private async Task<int> AddOrderAsync(int userId, int productId, decimal total, OrderStatus status, DateTime createdAt)
    {
        await using var ctx = _db.CreateContext();
        var order = new Order { UserId = userId, Status = status, CreatedAt = createdAt, TotalPrice = new Money(total), ContactName = "T", ContactPhone = "+7" };
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

    [PostgresFact]
    public async Task CancelledOrders_AreNotInTodaysCountOrRevenue_ButEveryOtherStatusIs()
    {
        var (userId, productId) = await SeedAsync();
        var before = await StatsAsync();
        var now = DateTime.UtcNow;

        foreach (var status in new[] { OrderStatus.Created, OrderStatus.Processing, OrderStatus.Shipped, OrderStatus.Delivered })
        {
            await AddOrderAsync(userId, productId, 10_000, status, now);
        }

        await AddOrderAsync(userId, productId, 172_000, OrderStatus.Cancelled, now); // the FS-6 case

        var after = await StatsAsync();
        Assert.Equal(4, after.OrdersToday - before.OrdersToday);
        Assert.Equal(40_000m, after.RevenueToday - before.RevenueToday);
    }

    [PostgresFact]
    public async Task CancellingAnOrder_TakesItOutOfTodaysFigures_AndPutsTheStockBack()
    {
        var (userId, productId) = await SeedAsync();
        var before = await StatsAsync();
        int orderId;
        await using (var ctx = _db.CreateContext())
        {
            // A real order through the service: it writes the stock off.
            var placed = await new OrderService(new UnitOfWork(ctx)).CreateOrderAsync(
                userId, new(new() { new(productId, 3, null) }, "T", "+7 700 000 0001", DeliveryMethod.Pickup, null, null));
            Assert.True(placed.IsSuccess);
            orderId = placed.Value!.Id;
        }

        var placedStats = await StatsAsync();
        Assert.Equal(1, placedStats.OrdersToday - before.OrdersToday);
        Assert.Equal(3_000m, placedStats.RevenueToday - before.RevenueToday);
        Assert.Equal(97, await StockAsync(productId));

        await using (var ctx = _db.CreateContext())
        {
            Assert.True((await new OrderService(new UnitOfWork(ctx)).UpdateOrderStatusAsync(orderId, OrderStatus.Cancelled)).IsSuccess);
        }

        var cancelledStats = await StatsAsync();
        Assert.Equal(0, cancelledStats.OrdersToday - before.OrdersToday);
        Assert.Equal(0m, cancelledStats.RevenueToday - before.RevenueToday);
        Assert.Equal(1, cancelledStats.TotalOrders - before.TotalOrders); // "Всего заказов" still counts it: it was placed
        Assert.Equal(100, await StockAsync(productId)); // the goods are back on sale
    }

    [PostgresFact]
    public async Task OrdersFromEarlierDays_AreNotInToday()
    {
        var (userId, productId) = await SeedAsync();
        var before = await StatsAsync();

        await AddOrderAsync(userId, productId, 50_000, OrderStatus.Delivered, DateTime.UtcNow.Date.AddDays(-1).AddHours(12));

        var after = await StatsAsync();
        Assert.Equal(0, after.OrdersToday - before.OrdersToday);
        Assert.Equal(0m, after.RevenueToday - before.RevenueToday);
        Assert.Equal(1, after.TotalOrders - before.TotalOrders);
    }

    private async Task<int> StockAsync(int productId)
    {
        await using var ctx = _db.CreateContext();
        return await ctx.Set<Product>().AsNoTracking().Where(p => p.Id == productId).Select(p => p.Stock).SingleAsync();
    }
}
