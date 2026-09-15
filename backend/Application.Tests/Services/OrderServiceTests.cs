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
    private readonly OrderService _sut;

    public OrderServiceTests()
    {
        _unitOfWork.Products.Returns(_products);
        _unitOfWork.Orders.Returns(_orders);
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
    public void CreateOrderRequestValidator_WithEmptyCart_ReturnsValidationError()
    {
        var validator = new Application.Validators.CreateOrderRequestValidator();
        var request = new CreateOrderRequestDto([], "Dave", "+7 700 000 00 03", DeliveryMethod.Pickup, null, null);

        var result = validator.Validate(request);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateOrderRequestDto.Items));
    }
}
