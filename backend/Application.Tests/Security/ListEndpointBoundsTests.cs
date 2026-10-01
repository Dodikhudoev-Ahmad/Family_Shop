using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using NSubstitute;
using Xunit;
using Api.Common;
using Api.Controllers;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Application.Validators;
using Domain.Entities;

namespace Application.Tests.Security;

/// <summary>
/// The page-size caps live in the filter validators, but those DTOs are built inside the actions, so for a
/// long time nothing ever ran them: ?pageSize=2000000000 returned the whole table and ?page=0 caused a
/// server error. These tests go through the controllers to prove the caps are actually enforced.
/// </summary>
public class ListEndpointBoundsTests
{
    private readonly IProductService _products = Substitute.For<IProductService>();
    private readonly IReviewService _reviews = Substitute.For<IReviewService>();
    private readonly IOrderService _orders = Substitute.For<IOrderService>();

    public ListEndpointBoundsTests()
    {
        _products.GetProductsAsync(Arg.Any<ProductFilterDto>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResult<ProductDto>(new List<ProductDto>(), 0, 1, 8));
        _reviews.GetReviewsAsync(Arg.Any<int>(), Arg.Any<ReviewFilterDto>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResult<ReviewDto>(new List<ReviewDto>(), 0, 1, 10));
        _orders.GetOrdersAsync(Arg.Any<OrderFilterDto>(), Arg.Any<CancellationToken>())
            .Returns(new PagedResult<AdminOrderDto>(new List<AdminOrderDto>(), 0, 1, 10));
    }

    private ProductsController ProductsApi() => new(_products, new ProductFilterValidator());
    private ReviewsController ReviewsApi() => new(_reviews, new ReviewFilterValidator());
    private AdminOrdersController OrdersApi() => new(_orders, new OrderFilterValidator());

    [Theory]
    [InlineData(1, 200, true)]
    [InlineData(1, 201, false)]
    [InlineData(1, 2_000_000_000, false)]
    [InlineData(0, 8, false)]
    [InlineData(-5, 8, false)]
    [InlineData(1, 0, false)]
    public async Task Products_PagingIsBounded(int page, int pageSize, bool allowed)
    {
        var result = await ProductsApi().GetProducts(null, null, null, null, null, ProductSortBy.Newest, page, pageSize, null);

        Assert.Equal(allowed, result.Result is OkObjectResult);
        if (!allowed) Assert.IsType<BadRequestObjectResult>(result.Result);
        await _products.Received(allowed ? 1 : 0).GetProductsAsync(Arg.Any<ProductFilterDto>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Products_AHugeSearchStringIsRejected_NotTurnedIntoAnIlikePattern()
    {
        var result = await ProductsApi().GetProducts(null, null, null, null, new string('a', 5000), ProductSortBy.Newest, 1, 8, null);
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task Products_MinPriceAboveMaxPrice_IsRejected()
    {
        var result = await ProductsApi().GetProducts(null, null, 500, 100, null, ProductSortBy.Newest, 1, 8, null);
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Theory]
    [InlineData(1, 50, true)]
    [InlineData(1, 51, false)]
    [InlineData(1, 1_000_000, false)]
    [InlineData(0, 10, false)]
    public async Task Reviews_PagingIsBounded(int page, int pageSize, bool allowed)
    {
        var result = await ReviewsApi().GetReviews(1, ReviewSortBy.Newest, page, pageSize);
        Assert.Equal(allowed, result.Result is OkObjectResult);
    }

    [Theory]
    [InlineData(1, 100, true)]
    [InlineData(1, 101, false)]
    [InlineData(0, 10, false)]
    public async Task AdminOrders_PagingIsBounded(int page, int pageSize, bool allowed)
    {
        var result = await OrdersApi().GetOrders(null, null, null, null, OrderSortBy.Newest, page, pageSize);
        Assert.Equal(allowed, result.Result is OkObjectResult);
    }
}

public class OrderInputBoundsTests
{
    private readonly CreateOrderRequestValidator _validator = new();

    private static CreateOrderRequestDto Order(int lines = 1, string? size = null, string? address = "ул. Абая 10", string? city = "Алматы") => new(
        Enumerable.Range(1, lines).Select(i => new CreateOrderItemDto(i, 1, size)).ToList(),
        null, "+7 700 000-00-00", DeliveryMethod.Courier, city, address);

    [Fact]
    public void AnOrderWithAReasonableNumberOfLines_IsAccepted() => Assert.True(_validator.Validate(Order(lines: 50)).IsValid);

    [Fact]
    public void AnOrderWithThousandsOfLines_IsRejected() => Assert.False(_validator.Validate(Order(lines: 51)).IsValid);

    [Fact]
    public void AnAbsurdlyLongSizeAddressOrCity_IsRejected()
    {
        Assert.False(_validator.Validate(Order(size: new string('X', 200))).IsValid);
        Assert.False(_validator.Validate(Order(address: new string('a', 100_000))).IsValid);
        Assert.False(_validator.Validate(Order(city: new string('a', 500))).IsValid);
        Assert.True(_validator.Validate(Order(size: "XL")).IsValid);
    }
}
