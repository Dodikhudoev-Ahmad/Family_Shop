using Microsoft.EntityFrameworkCore;
using Xunit;
using Application.Common;
using Application.DTOs;
using Application.Services;
using Domain.Entities;
using Domain.ValueObjects;
using Infrastructure.Persistence;

namespace Application.Tests.Integration;

/// <summary>
/// Order creation and cancellation against a real PostgreSQL with real concurrency: every simulated request gets
/// its own DbContext/UnitOfWork/OrderService (like a request scope) and they are released at the same instant.
/// </summary>
public class OrderStockConcurrencyTests : IClassFixture<PostgresFixture>
{
    private readonly PostgresFixture _db;
    private int _phone;

    public OrderStockConcurrencyTests(PostgresFixture db) => _db = db;

    // ---------- helpers ----------

    private async Task<int> NewUserAsync()
    {
        await using var ctx = _db.CreateContext();
        var user = new User { Email = new Email($"u{Guid.NewGuid():N}@example.com"), Name = "Test", PasswordHash = "x" };
        ctx.Add(user);
        await ctx.SaveChangesAsync();
        return user.Id;
    }

    private async Task<int> NewCategoryAsync()
    {
        await using var ctx = _db.CreateContext();
        var category = new Category { Name = "Test", Slug = $"t-{Guid.NewGuid():N}" };
        ctx.Add(category);
        await ctx.SaveChangesAsync();
        return category.Id;
    }

    /// <summary>Creates products one after another, so ids ascend in the order of <paramref name="stocks"/>.</summary>
    private async Task<int[]> NewProductsAsync(params int[] stocks)
    {
        var categoryId = await NewCategoryAsync();
        var ids = new List<int>();
        foreach (var stock in stocks)
        {
            await using var ctx = _db.CreateContext();
            var product = new Product { Name = $"Item {Guid.NewGuid():N}"[..13], Price = new Money(1000), Stock = stock, CategoryId = categoryId };
            ctx.Add(product);
            await ctx.SaveChangesAsync();
            ids.Add(product.Id);
        }

        return ids.ToArray();
    }

    private async Task<int> StockAsync(int productId)
    {
        await using var ctx = _db.CreateContext();
        return await ctx.Set<Product>().AsNoTracking().Where(p => p.Id == productId).Select(p => p.Stock).SingleAsync();
    }

    private async Task<int> OrderCountAsync(int userId)
    {
        await using var ctx = _db.CreateContext();
        return await ctx.Set<Order>().CountAsync(o => o.UserId == userId);
    }

    private CreateOrderRequestDto Request(string? promo = null, params (int ProductId, int Qty, string? Size)[] lines) =>
        new(lines.Select(l => new CreateOrderItemDto(l.ProductId, l.Qty, l.Size)).ToList(),
            "Test", $"+7 700 000 {Interlocked.Increment(ref _phone):D4}", DeliveryMethod.Pickup, null, null, promo);

    private async Task<Result<OrderDto>> PlaceAsync(int userId, CreateOrderRequestDto request)
    {
        await using var ctx = _db.CreateContext();
        return await new OrderService(new UnitOfWork(ctx)).CreateOrderAsync(userId, request);
    }

    private async Task<Result<AdminOrderDto>> SetStatusAsync(int orderId, OrderStatus status)
    {
        await using var ctx = _db.CreateContext();
        return await new OrderService(new UnitOfWork(ctx)).UpdateOrderStatusAsync(orderId, status);
    }

    /// <summary>Runs all jobs on separate threads, released together by a gate.</summary>
    private static async Task<T[]> RaceAsync<T>(IEnumerable<Func<Task<T>>> jobs)
    {
        var gate = new TaskCompletionSource();
        var tasks = jobs.Select(job => Task.Run(async () =>
        {
            await gate.Task;
            return await job();
        })).ToArray();
        await Task.Delay(300); // let every task park on the gate (connections are pooled/opened lazily)
        gate.SetResult();
        return await Task.WhenAll(tasks);
    }

    // ---------- tests ----------

    [PostgresFact]
    public async Task TwentyParallelOrdersForAProductWithStockThree_ExactlyThreeSucceed_SeventeenGet409_StockIsZero()
    {
        var userId = await NewUserAsync();
        var productId = (await NewProductsAsync(3))[0];

        var results = await RaceAsync(Enumerable.Range(0, 20)
            .Select<int, Func<Task<Result<OrderDto>>>>(_ => () => PlaceAsync(userId, Request(null, (productId, 1, "M")))));

        Assert.Equal(3, results.Count(r => r.IsSuccess));
        Assert.Equal(17, results.Count(r => !r.IsSuccess && r.ErrorCode == ResultErrorCodes.OutOfStock));
        Assert.Equal(0, await StockAsync(productId));
        Assert.Equal(3, await OrderCountAsync(userId)); // refused requests left no order behind
    }

    [PostgresFact]
    public async Task ParallelOrdersWithBiggerQuantities_NeverOversell()
    {
        var userId = await NewUserAsync();
        var productId = (await NewProductsAsync(10))[0];

        // 12 orders of 2 units against 10 in stock -> exactly 5 fit.
        var results = await RaceAsync(Enumerable.Range(0, 12)
            .Select<int, Func<Task<Result<OrderDto>>>>(_ => () => PlaceAsync(userId, Request(null, (productId, 2, null)))));

        Assert.Equal(5, results.Count(r => r.IsSuccess));
        Assert.Equal(0, await StockAsync(productId));
    }

    [PostgresFact]
    public async Task ParallelOrdersForDifferentProducts_AllSucceed_AndNoneDeadlock_EvenWithOppositeLineOrder()
    {
        var userId = await NewUserAsync();
        var ids = await NewProductsAsync(1, 1, 1, 1, 1, 50, 50);

        // Five independent single-unit products...
        var independent = ids.Take(5).Select<int, Func<Task<Result<OrderDto>>>>(id => () => PlaceAsync(userId, Request(null, (id, 1, null))));
        // ...and 40 orders over the same two products with the lines listed in opposite orders (lock-order trap).
        var a = ids[5];
        var b = ids[6];
        var crossing = Enumerable.Range(0, 40).Select<int, Func<Task<Result<OrderDto>>>>(i => () => PlaceAsync(userId,
            i % 2 == 0 ? Request(null, (a, 1, null), (b, 1, null)) : Request(null, (b, 1, null), (a, 1, null))));

        var results = await RaceAsync(independent.Concat(crossing));

        Assert.All(results, r => Assert.True(r.IsSuccess, string.Join("; ", r.Errors)));
        Assert.All(ids.Take(5), id => Assert.Equal(0, StockAsync(id).Result));
        Assert.Equal(10, await StockAsync(a));
        Assert.Equal(10, await StockAsync(b));
    }

    [PostgresFact]
    public async Task OneProductInTwoSizes_IsWrittenOffAsOneSharedStock()
    {
        var userId = await NewUserAsync();
        var productId = (await NewProductsAsync(10))[0];

        var result = await PlaceAsync(userId, Request(null, (productId, 3, "M"), (productId, 4, "L")));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.Items.Count);
        Assert.Equal(3, await StockAsync(productId)); // 10 - 3 - 4
    }

    [PostgresFact]
    public async Task OneProductInTwoSizes_ExceedingTheCombinedStock_IsRefusedAndWritesNothingOff()
    {
        var userId = await NewUserAsync();
        var productId = (await NewProductsAsync(10))[0];

        var result = await PlaceAsync(userId, Request(null, (productId, 6, "M"), (productId, 6, "L")));

        Assert.False(result.IsSuccess);
        Assert.Equal(ResultErrorCodes.OutOfStock, result.ErrorCode);
        Assert.Equal(10, await StockAsync(productId));
        Assert.Equal(0, await OrderCountAsync(userId));
    }

    [PostgresFact]
    public async Task WhenOneOfSeveralLinesIsShort_TheWholeOrderRollsBack_AndNothingIsWrittenOff()
    {
        var userId = await NewUserAsync();
        var ids = await NewProductsAsync(5, 1); // ids ascend: the plentiful one is written off first, then rolled back

        var result = await PlaceAsync(userId, Request(null, (ids[0], 2, null), (ids[1], 2, null)));

        Assert.False(result.IsSuccess);
        Assert.Equal(ResultErrorCodes.OutOfStock, result.ErrorCode);
        Assert.Equal(5, await StockAsync(ids[0]));
        Assert.Equal(1, await StockAsync(ids[1]));
        Assert.Equal(0, await OrderCountAsync(userId));
    }

    [PostgresFact]
    public async Task WhenThePromoUsageLimitRaceIsLost_TheStockWriteOffIsRolledBackToo()
    {
        var userId = await NewUserAsync();
        var productId = (await NewProductsAsync(100))[0];
        var code = $"P{Guid.NewGuid():N}"[..10].ToUpperInvariant();
        await using (var ctx = _db.CreateContext())
        {
            ctx.Add(new PromoCode
            {
                Code = code, DiscountType = PromoCodeDiscountType.FixedAmount, DiscountValue = 100, IsActive = true,
                UsageLimit = 1, ValidFrom = DateTime.UtcNow.AddDays(-1), ValidUntil = DateTime.UtcNow.AddDays(1)
            });
            await ctx.SaveChangesAsync();
        }

        var results = await RaceAsync(Enumerable.Range(0, 6)
            .Select<int, Func<Task<Result<OrderDto>>>>(_ => () => PlaceAsync(userId, Request(code, (productId, 1, null)))));

        Assert.Equal(1, results.Count(r => r.IsSuccess));
        Assert.Equal(99, await StockAsync(productId)); // the five losers gave their unit back with the rollback
        Assert.Equal(1, await OrderCountAsync(userId));
    }

    [PostgresFact]
    public async Task CancellingTwice_ReturnsTheStockOnlyOnce()
    {
        var userId = await NewUserAsync();
        var productId = (await NewProductsAsync(5))[0];
        var order = (await PlaceAsync(userId, Request(null, (productId, 2, "M"), (productId, 1, "L")))).Value!;
        Assert.Equal(2, await StockAsync(productId));

        Assert.True((await SetStatusAsync(order.Id, OrderStatus.Cancelled)).IsSuccess);
        Assert.Equal(5, await StockAsync(productId));

        await SetStatusAsync(order.Id, OrderStatus.Cancelled); // repeat: a no-op, whatever it answers
        Assert.Equal(5, await StockAsync(productId));
    }

    [PostgresFact]
    public async Task ParallelCancellationsOfOneOrder_ReturnTheStockExactlyOnce()
    {
        var userId = await NewUserAsync();
        var productId = (await NewProductsAsync(5))[0];
        var order = (await PlaceAsync(userId, Request(null, (productId, 4, null)))).Value!;
        Assert.Equal(1, await StockAsync(productId));

        var results = await RaceAsync(Enumerable.Range(0, 10)
            .Select<int, Func<Task<Result<AdminOrderDto>>>>(_ => () => SetStatusAsync(order.Id, OrderStatus.Cancelled)));

        Assert.Contains(results, r => r.IsSuccess);
        Assert.All(results.Where(r => !r.IsSuccess), r => Assert.Equal(ResultErrorCodes.Conflict, r.ErrorCode));
        Assert.Equal(5, await StockAsync(productId)); // 1 + 4, not 1 + 4 * n
    }

    [PostgresFact]
    public async Task CancellationRacingWithShipping_OnlyOneWins_AndStockIsConsistentWithTheWinner()
    {
        var userId = await NewUserAsync();
        var productId = (await NewProductsAsync(5))[0];
        var order = (await PlaceAsync(userId, Request(null, (productId, 2, null)))).Value!;
        Assert.True((await SetStatusAsync(order.Id, OrderStatus.Processing)).IsSuccess);

        var results = await RaceAsync(new Func<Task<Result<AdminOrderDto>>>[]
        {
            () => SetStatusAsync(order.Id, OrderStatus.Cancelled),
            () => SetStatusAsync(order.Id, OrderStatus.Shipped)
        });

        await using var ctx = _db.CreateContext();
        var final = await ctx.Set<Order>().AsNoTracking().Where(o => o.Id == order.Id).Select(o => o.Status).SingleAsync();
        var stock = await StockAsync(productId);

        // Shipped can't be cancelled afterwards, and a cancelled order can't ship: either order is consistent,
        // a status/stock mismatch (cancelled but stock not returned, or shipped but stock returned) is not.
        Assert.Equal(final == OrderStatus.Cancelled ? 5 : 3, stock);
        Assert.Equal(1, results.Count(r => r.IsSuccess));
    }
}
