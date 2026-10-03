using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Api.Background;
using Api.Common;
using Api.Controllers;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Application.Services;
using Domain.Entities;
using Domain.ValueObjects;
using Infrastructure.Persistence;

namespace Application.Tests.Integration;

/// <summary>Idempotency-Key on order creation, against a real PostgreSQL with real concurrency.</summary>
public class IdempotencyKeyTests : IClassFixture<PostgresFixture>
{
    private readonly PostgresFixture _db;

    public IdempotencyKeyTests(PostgresFixture db) => _db = db;

    // ---------- helpers ----------

    private async Task<int> NewUserAsync()
    {
        await using var ctx = _db.CreateContext();
        var user = new User { Email = new Email($"u{Guid.NewGuid():N}@example.com"), Name = "Test", PasswordHash = "x" };
        ctx.Add(user);
        await ctx.SaveChangesAsync();
        return user.Id;
    }

    private async Task<int> NewProductAsync(int stock)
    {
        await using var ctx = _db.CreateContext();
        var category = new Category { Name = "Test", Slug = $"t-{Guid.NewGuid():N}", HasSizes = false };
        ctx.Add(category);
        await ctx.SaveChangesAsync();
        var product = new Product { Name = $"Item {Guid.NewGuid():N}"[..13], Price = new Money(1000), Stock = stock, CategoryId = category.Id };
        ctx.Add(product);
        await ctx.SaveChangesAsync();
        return product.Id;
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

    private static CreateOrderRequestDto Body(int productId, int quantity = 1, string phone = "+7 700 000 0001") =>
        new([new CreateOrderItemDto(productId, quantity, null)], "Test", phone, DeliveryMethod.Pickup, null, null);

    private async Task<Result<OrderDto>> PlaceAsync(int userId, CreateOrderRequestDto request, string? key)
    {
        await using var ctx = _db.CreateContext();
        return await new OrderService(new UnitOfWork(ctx)).CreateOrderAsync(userId, request, key);
    }

    private static string NewKey() => Guid.NewGuid().ToString();

    // ---------- behaviour ----------

    [PostgresFact]
    public async Task RepeatingTheRequest_ReturnsTheSavedAnswer_WithoutASecondOrderOrASecondWriteOff()
    {
        var userId = await NewUserAsync();
        var productId = await NewProductAsync(5);
        var key = NewKey();

        var first = await PlaceAsync(userId, Body(productId, 2), key);
        var second = await PlaceAsync(userId, Body(productId, 2), key);
        var third = await PlaceAsync(userId, Body(productId, 2), key);

        Assert.True(first.IsSuccess);
        Assert.False(first.IsReplay);
        Assert.True(second.IsSuccess && third.IsSuccess);
        Assert.True(second.IsReplay && third.IsReplay);
        Assert.Equal(first.Value!.Id, second.Value!.Id);
        // the very same answer, down to the totals, the lines and the creation time
        Assert.Equal(System.Text.Json.JsonSerializer.Serialize(first.Value), System.Text.Json.JsonSerializer.Serialize(second.Value));
        Assert.Equal(1, await OrderCountAsync(userId));
        Assert.Equal(3, await StockAsync(productId)); // 5 - 2, once
    }

    [PostgresFact]
    public async Task TwentyParallelRequestsWithOneKey_CreateExactlyOneOrder_AndAllGetThatAnswer()
    {
        var userId = await NewUserAsync();
        var productId = await NewProductAsync(10);
        var key = NewKey();

        var gate = new TaskCompletionSource();
        var tasks = Enumerable.Range(0, 20).Select(_ => Task.Run(async () =>
        {
            await gate.Task;
            return await PlaceAsync(userId, Body(productId), key);
        })).ToArray();
        await Task.Delay(300);
        gate.SetResult();
        var results = await Task.WhenAll(tasks);

        Assert.All(results, r => Assert.True(r.IsSuccess, string.Join("; ", r.Errors)));
        Assert.Single(results.Select(r => r.Value!.Id).Distinct());
        Assert.Equal(1, results.Count(r => !r.IsReplay)); // one executed, nineteen replayed
        Assert.Equal(1, await OrderCountAsync(userId));
        Assert.Equal(9, await StockAsync(productId));
    }

    [PostgresFact]
    public async Task TheSameKeyWithADifferentBody_IsRefused_AndNothingChanges()
    {
        var userId = await NewUserAsync();
        var productId = await NewProductAsync(5);
        var key = NewKey();
        await PlaceAsync(userId, Body(productId, 1), key);

        var otherQuantity = await PlaceAsync(userId, Body(productId, 3), key);
        var otherPhone = await PlaceAsync(userId, Body(productId, 1, "+7 700 999 9999"), key);

        foreach (var refused in new[] { otherQuantity, otherPhone })
        {
            Assert.False(refused.IsSuccess);
            Assert.Equal(ResultErrorCodes.IdempotencyMismatch, refused.ErrorCode);
        }

        Assert.Equal(1, await OrderCountAsync(userId));
        Assert.Equal(4, await StockAsync(productId));
    }

    [PostgresFact]
    public async Task ParallelRequestsWithOneKeyButDifferentBodies_OneWins_TheOthersAreRefused()
    {
        var userId = await NewUserAsync();
        var productId = await NewProductAsync(50);
        var key = NewKey();

        var gate = new TaskCompletionSource();
        var tasks = Enumerable.Range(1, 6).Select(quantity => Task.Run(async () =>
        {
            await gate.Task;
            return await PlaceAsync(userId, Body(productId, quantity), key);
        })).ToArray();
        await Task.Delay(300);
        gate.SetResult();
        var results = await Task.WhenAll(tasks);

        Assert.Equal(1, results.Count(r => r.IsSuccess));
        Assert.All(results.Where(r => !r.IsSuccess), r => Assert.Equal(ResultErrorCodes.IdempotencyMismatch, r.ErrorCode));
        Assert.Equal(1, await OrderCountAsync(userId));
        Assert.Equal(50 - results.Single(r => r.IsSuccess).Value!.Items.Single().Quantity, await StockAsync(productId));
    }

    [PostgresFact]
    public async Task AKeyBelongsToItsUser_TheSameKeyOfAnotherUserIsAnotherRequest()
    {
        var alice = await NewUserAsync();
        var bob = await NewUserAsync();
        var productId = await NewProductAsync(5);
        var key = NewKey();

        var a = await PlaceAsync(alice, Body(productId), key);
        var b = await PlaceAsync(bob, Body(productId), key);

        Assert.True(a.IsSuccess && b.IsSuccess);
        Assert.False(b.IsReplay);
        Assert.NotEqual(a.Value!.Id, b.Value!.Id);
        Assert.Equal(3, await StockAsync(productId));
    }

    [PostgresFact]
    public async Task ARefusedRequest_DoesNotUseUpTheKey_ARetryAfterTheCauseIsGoneWorks()
    {
        var userId = await NewUserAsync();
        var productId = await NewProductAsync(0);
        var key = NewKey();

        var refused = await PlaceAsync(userId, Body(productId), key);
        Assert.Equal(ResultErrorCodes.OutOfStock, refused.ErrorCode);
        await using (var ctx = _db.CreateContext())
        {
            await ctx.Set<Product>().Where(p => p.Id == productId).ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, 4));
        }

        var retry = await PlaceAsync(userId, Body(productId), key);

        Assert.True(retry.IsSuccess);
        Assert.False(retry.IsReplay);
        Assert.Equal(3, await StockAsync(productId));
    }

    [PostgresFact]
    public async Task WithoutAKey_EveryRequestIsAnOrder_AsBefore()
    {
        var userId = await NewUserAsync();
        var productId = await NewProductAsync(5);

        await PlaceAsync(userId, Body(productId), null);
        await PlaceAsync(userId, Body(productId), null);

        Assert.Equal(2, await OrderCountAsync(userId));
        Assert.Equal(3, await StockAsync(productId));
    }

    [PostgresFact]
    public async Task AnExpiredKey_IsForgotten_AndTheNextRequestIsANewOrder()
    {
        var userId = await NewUserAsync();
        var productId = await NewProductAsync(5);
        var key = NewKey();
        var first = await PlaceAsync(userId, Body(productId), key);
        await using (var ctx = _db.CreateContext())
        {
            await ctx.Set<IdempotencyKey>().Where(k => k.UserId == userId).ExecuteUpdateAsync(s => s.SetProperty(k => k.CreatedAt, DateTime.UtcNow.AddHours(-25)));
        }

        var again = await PlaceAsync(userId, Body(productId), key);

        Assert.True(again.IsSuccess);
        Assert.False(again.IsReplay);
        Assert.NotEqual(first.Value!.Id, again.Value!.Id);
        Assert.Equal(3, await StockAsync(productId));
    }

    [PostgresFact]
    public async Task TheCleanupJob_RemovesOnlyExpiredKeys()
    {
        var userId = await NewUserAsync();
        var productId = await NewProductAsync(5);
        var oldKey = NewKey();
        var freshKey = NewKey();
        await PlaceAsync(userId, Body(productId), oldKey);
        await PlaceAsync(userId, Body(productId, 1, "+7 700 000 0002"), freshKey);
        await using (var ctx = _db.CreateContext())
        {
            await ctx.Set<IdempotencyKey>().Where(k => k.Key == oldKey).ExecuteUpdateAsync(s => s.SetProperty(k => k.CreatedAt, DateTime.UtcNow.AddHours(-25)));
        }

        var services = new ServiceCollection();
        services.AddScoped(_ => _db.CreateContext());
        services.AddScoped<Domain.Interfaces.IUnitOfWork, UnitOfWork>();
        await using var provider = services.BuildServiceProvider();
        var job = new IdempotencyKeyCleanupService(provider.GetRequiredService<IServiceScopeFactory>(), NullLogger<IdempotencyKeyCleanupService>.Instance);

        Assert.True(await job.RunOnceAsync(CancellationToken.None) >= 1);

        await using var check = _db.CreateContext();
        var remaining = await check.Set<IdempotencyKey>().Where(k => k.UserId == userId).Select(k => k.Key).ToListAsync();
        Assert.Equal([freshKey], remaining);
    }
}

/// <summary>What the HTTP layer does with the header.</summary>
public class OrdersControllerIdempotencyTests
{
    private readonly IOrderService _orders = Substitute.For<IOrderService>();
    private readonly OrdersController _sut;
    private static readonly CreateOrderRequestDto Request = new([new CreateOrderItemDto(1, 1, null)], "A", "+7 700 000 0001", DeliveryMethod.Pickup, null, null);

    public OrdersControllerIdempotencyTests()
    {
        _sut = new OrdersController(_orders)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "5")], "test")) }
            }
        };
    }

    private static OrderDto Dto() => new(1, OrderStatus.Created, 1000, DateTime.UtcNow, "A", "+7", DeliveryMethod.Pickup, null, null, []);

    [Fact]
    public async Task ASuccessfulReplay_IsAnOk_MarkedWithAHeader()
    {
        _orders.CreateOrderAsync(5, Request, "key-12345678", Arg.Any<CancellationToken>()).Returns(Result<OrderDto>.Replay(Dto()));

        var result = await _sut.CreateOrder(Request, "key-12345678", CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal("true", _sut.Response.Headers["Idempotent-Replayed"].ToString());
    }

    [Fact]
    public async Task ANewOrder_HasNoReplayHeader_AndAMissingKeyIsPassedOnAsNull()
    {
        _orders.CreateOrderAsync(5, Request, null, Arg.Any<CancellationToken>()).Returns(Result<OrderDto>.Success(Dto()));

        var result = await _sut.CreateOrder(Request, "  ", CancellationToken.None);

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.False(_sut.Response.Headers.ContainsKey("Idempotent-Replayed"));
        await _orders.Received(1).CreateOrderAsync(5, Request, null, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ADifferentBodyUnderTheSameKey_Is422()
    {
        _orders.CreateOrderAsync(5, Request, "key-12345678", Arg.Any<CancellationToken>())
            .Returns(Result<OrderDto>.Failure("different", ResultErrorCodes.IdempotencyMismatch));

        var result = await _sut.CreateOrder(Request, "key-12345678", CancellationToken.None);

        Assert.Equal(422, Assert.IsType<UnprocessableEntityObjectResult>(result.Result).StatusCode);
    }

    [Theory]
    [InlineData("short")]
    [InlineData("has space in it 123")]
    [InlineData("semi;colon-1234567")]
    public async Task AMalformedKey_Is400_BeforeAnythingRuns(string key)
    {
        var result = await _sut.CreateOrder(Request, key, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result.Result);
        await _orders.DidNotReceiveWithAnyArgs().CreateOrderAsync(default, default!, default(string), default);
    }

    [Fact]
    public async Task AKeyThatIsTooLong_Is400()
    {
        var result = await _sut.CreateOrder(Request, new string('a', 101), CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }
}
