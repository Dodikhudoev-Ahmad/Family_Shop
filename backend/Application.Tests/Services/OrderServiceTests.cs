using NSubstitute;
using Xunit;
using Application.DTOs;
using Application.Services;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;

namespace Application.Tests.Services;

public class OrderServiceTests
{
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IProductRepository _products = Substitute.For<IProductRepository>();
    private readonly IOrderRepository _orders = Substitute.For<IOrderRepository>();
    private readonly IPromoCodeRepository _promoCodes = Substitute.For<IPromoCodeRepository>();
    private readonly OrderService _sut;

    public OrderServiceTests()
    {
        _unitOfWork.Products.Returns(_products);
        _unitOfWork.Orders.Returns(_orders);
        _unitOfWork.PromoCodes.Returns(_promoCodes);

        // Mirrors UnitOfWork.ExecuteInTransactionAsync closely enough for unit tests: runs the
        // callback against the same substitutes, without a real database transaction.
        _unitOfWork.ExecuteInTransactionAsync(Arg.Any<Func<CancellationToken, Task<bool>>>(), Arg.Any<CancellationToken>())
            .Returns(callInfo => callInfo.Arg<Func<CancellationToken, Task<bool>>>()(callInfo.ArgAt<CancellationToken>(1)));

        _sut = new OrderService(_unitOfWork);
    }

    [Fact]
    public async Task CreateOrderAsync_UsesUserIdFromMethodParameter_NotFromRequest()
    {
        const int authenticatedUserId = 42;
        var product = new Product { Id = 1, Name = "Shirt", Price = new Money(1000), Stock = 5 };
        _products.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(product);

        var request = new CreateOrderRequestDto(
            [new CreateOrderItemDto(1, 2, "M")],
            "Alice",
            "+7 700 000 00 00",
            DeliveryMethod.Pickup,
            null,
            null);

        var result = await _sut.CreateOrderAsync(authenticatedUserId, request);

        Assert.True(result.IsSuccess);
        await _orders.Received(1).AddAsync(
            Arg.Is<Order>(o => o.UserId == authenticatedUserId),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CreateOrderAsync_ReducesProductStockByOrderedQuantity()
    {
        var product = new Product { Id = 1, Name = "Shoes", Price = new Money(2000), Stock = 10 };
        _products.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(product);

        var request = new CreateOrderRequestDto(
            [new CreateOrderItemDto(1, 3, "42")],
            "Bob",
            "+7 700 000 00 01",
            DeliveryMethod.Pickup,
            null,
            null);

        await _sut.CreateOrderAsync(1, request);

        Assert.Equal(7, product.Stock);
    }

    [Fact]
    public async Task CreateOrderAsync_WithInsufficientStock_ReturnsFailure()
    {
        var product = new Product { Id = 1, Name = "Bag", Price = new Money(500), Stock = 1 };
        _products.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(product);

        var request = new CreateOrderRequestDto(
            [new CreateOrderItemDto(1, 5, null)],
            "Carol",
            "+7 700 000 00 02",
            DeliveryMethod.Pickup,
            null,
            null);

        var result = await _sut.CreateOrderAsync(1, request);

        Assert.False(result.IsSuccess);
        await _orders.DidNotReceive().AddAsync(Arg.Any<Order>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CreateOrderAsync_WithValidPromoCode_AppliesDiscountAndIncrementsUsage()
    {
        var product = new Product { Id = 1, Name = "Coat", Price = new Money(1000), Stock = 5 };
        _products.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(product);

        var promoCode = new PromoCode
        {
            Id = 7,
            Code = "SALE20",
            DiscountType = PromoCodeDiscountType.Percentage,
            DiscountValue = 20,
            IsActive = true,
            ValidFrom = DateTime.UtcNow.AddDays(-1),
            ValidUntil = DateTime.UtcNow.AddDays(1)
        };
        _promoCodes.GetByCodeAsync("SALE20", Arg.Any<CancellationToken>()).Returns(promoCode);
        _promoCodes.TryIncrementUsageAsync(7, Arg.Any<CancellationToken>()).Returns(true);

        var request = new CreateOrderRequestDto(
            [new CreateOrderItemDto(1, 2, null)],
            "Erin",
            "+7 700 000 00 04",
            DeliveryMethod.Pickup,
            null,
            null,
            "sale20");

        var result = await _sut.CreateOrderAsync(1, request);

        Assert.True(result.IsSuccess);
        Assert.Equal(400, result.Value!.DiscountAmount);
        Assert.Equal(1600, result.Value.TotalPrice);
        await _promoCodes.Received(1).TryIncrementUsageAsync(7, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CreateOrderAsync_WithUnknownPromoCode_ReturnsFailureAndDoesNotCreateOrder()
    {
        var product = new Product { Id = 1, Name = "Coat", Price = new Money(1000), Stock = 5 };
        _products.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(product);
        _promoCodes.GetByCodeAsync("MISSING", Arg.Any<CancellationToken>()).Returns((PromoCode?)null);

        var request = new CreateOrderRequestDto(
            [new CreateOrderItemDto(1, 1, null)],
            "Frank",
            "+7 700 000 00 05",
            DeliveryMethod.Pickup,
            null,
            null,
            "missing");

        var result = await _sut.CreateOrderAsync(1, request);

        Assert.False(result.IsSuccess);
        await _orders.DidNotReceive().AddAsync(Arg.Any<Order>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CreateOrderAsync_WhenPromoCodeUsageLimitRaceIsLost_RollsBackAndReturnsFailure()
    {
        // Simulates two concurrent orders both passing the in-memory usage-limit check; only the
        // atomic conditional UPDATE (TryIncrementUsageAsync) can tell them apart, so this order
        // must fail cleanly rather than silently creating an over-the-limit order.
        var product = new Product { Id = 1, Name = "Hat", Price = new Money(500), Stock = 5 };
        _products.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(product);

        var promoCode = new PromoCode
        {
            Id = 9,
            Code = "LIMITED",
            DiscountType = PromoCodeDiscountType.FixedAmount,
            DiscountValue = 100,
            UsageLimit = 1,
            UsageCount = 0,
            IsActive = true,
            ValidFrom = DateTime.UtcNow.AddDays(-1),
            ValidUntil = DateTime.UtcNow.AddDays(1)
        };
        _promoCodes.GetByCodeAsync("LIMITED", Arg.Any<CancellationToken>()).Returns(promoCode);
        _promoCodes.TryIncrementUsageAsync(9, Arg.Any<CancellationToken>()).Returns(false);

        var request = new CreateOrderRequestDto(
            [new CreateOrderItemDto(1, 1, null)],
            "Grace",
            "+7 700 000 00 06",
            DeliveryMethod.Pickup,
            null,
            null,
            "LIMITED");

        var result = await _sut.CreateOrderAsync(1, request);

        Assert.False(result.IsSuccess);
    }

    [Fact]
    public void CreateOrderRequestValidator_WithEmptyCart_ReturnsValidationError()
    {
        var validator = new Application.Validators.CreateOrderRequestValidator();
        var request = new CreateOrderRequestDto([], "Dave", "+7 700 000 00 03", DeliveryMethod.Pickup, null, null);

        var result = validator.Validate(request);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateOrderRequestDto.Items));
    }

    [Fact]
    public async Task UpdateOrderStatusAsync_ToCancelled_RestoresProductStock()
    {
        var product = new Product { Id = 1, Name = "Shoes", Price = new Money(2000), Stock = 3 };
        var order = new Order { Id = 7, Status = OrderStatus.Created };
        order.Items.Add(new OrderItem { ProductId = 1, Product = product, Quantity = 2, Price = new Money(2000) });
        _orders.GetByIdWithItemsAsync(7, Arg.Any<CancellationToken>()).Returns(order);

        var result = await _sut.UpdateOrderStatusAsync(7, OrderStatus.Cancelled);

        Assert.True(result.IsSuccess);
        Assert.Equal(5, product.Stock);
    }

    [Fact]
    public async Task UpdateOrderStatusAsync_ToNonCancelledStatus_DoesNotChangeStock()
    {
        var product = new Product { Id = 1, Name = "Shoes", Price = new Money(2000), Stock = 3 };
        var order = new Order { Id = 8, Status = OrderStatus.Created };
        order.Items.Add(new OrderItem { ProductId = 1, Product = product, Quantity = 2, Price = new Money(2000) });
        _orders.GetByIdWithItemsAsync(8, Arg.Any<CancellationToken>()).Returns(order);

        await _sut.UpdateOrderStatusAsync(8, OrderStatus.Processing);

        Assert.Equal(3, product.Stock);
    }
}
