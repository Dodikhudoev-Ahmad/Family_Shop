using NSubstitute;
using Xunit;
using Application.DTOs;
using Application.Services;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Tests.Services;

public class PromoCodeServiceTests
{
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IPromoCodeRepository _promoCodes = Substitute.For<IPromoCodeRepository>();
    private readonly IOrderRepository _orders = Substitute.For<IOrderRepository>();
    private readonly PromoCodeService _sut;

    public PromoCodeServiceTests()
    {
        _unitOfWork.PromoCodes.Returns(_promoCodes);
        _unitOfWork.Orders.Returns(_orders);
        _sut = new PromoCodeService(_unitOfWork);
    }

    [Fact]
    public async Task ValidateAndApplyAsync_UnknownCode_ReturnsFailure()
    {
        _promoCodes.GetByCodeAsync("MISSING", Arg.Any<CancellationToken>()).Returns((PromoCode?)null);

        var result = await _sut.ValidateAndApplyAsync("missing", 1000);

        Assert.False(result.IsSuccess);
    }

    [Fact]
    public async Task ValidateAndApplyAsync_NormalizesCodeToUppercase()
    {
        var code = new PromoCode
        {
            Id = 1,
            Code = "SALE20",
            DiscountType = PromoCodeDiscountType.Percentage,
            DiscountValue = 20,
            IsActive = true,
            ValidFrom = DateTime.UtcNow.AddDays(-1),
            ValidUntil = DateTime.UtcNow.AddDays(1)
        };
        _promoCodes.GetByCodeAsync("SALE20", Arg.Any<CancellationToken>()).Returns(code);

        var result = await _sut.ValidateAndApplyAsync("sale20", 1000);

        Assert.True(result.IsSuccess);
        Assert.Equal(200, result.Value!.DiscountAmount);
    }

    [Fact]
    public async Task ValidateAndApplyAsync_DoesNotIncrementUsageCount()
    {
        var code = new PromoCode
        {
            Id = 1,
            Code = "SALE20",
            DiscountType = PromoCodeDiscountType.Percentage,
            DiscountValue = 20,
            IsActive = true,
            ValidFrom = DateTime.UtcNow.AddDays(-1),
            ValidUntil = DateTime.UtcNow.AddDays(1)
        };
        _promoCodes.GetByCodeAsync("SALE20", Arg.Any<CancellationToken>()).Returns(code);

        await _sut.ValidateAndApplyAsync("SALE20", 1000);

        await _promoCodes.DidNotReceiveWithAnyArgs().TryIncrementUsageAsync(default);
        await _unitOfWork.DidNotReceiveWithAnyArgs().SaveChangesAsync();
    }

    [Fact]
    public async Task CreatePromoCodeAsync_DuplicateCode_ReturnsFailure()
    {
        _promoCodes.AnyByCodeAsync("SALE20", null, Arg.Any<CancellationToken>()).Returns(true);

        var dto = new PromoCodeUpsertDto(
            "SALE20", PromoCodeDiscountType.Percentage, 20, null, null,
            DateTime.UtcNow, DateTime.UtcNow.AddDays(30), null, true);

        var result = await _sut.CreatePromoCodeAsync(dto);

        Assert.False(result.IsSuccess);
        await _promoCodes.DidNotReceive().AddAsync(Arg.Any<PromoCode>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DeletePromoCodeAsync_HasOrders_ReturnsFailureWithoutDeleting()
    {
        var code = new PromoCode { Id = 1, Code = "SALE20" };
        _promoCodes.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(code);
        _orders.AnyByPromoCodeIdAsync(1, Arg.Any<CancellationToken>()).Returns(true);

        var result = await _sut.DeletePromoCodeAsync(1);

        Assert.False(result.IsSuccess);
        _promoCodes.DidNotReceive().Remove(Arg.Any<PromoCode>());
        await _unitOfWork.DidNotReceiveWithAnyArgs().SaveChangesAsync();
    }

    [Fact]
    public async Task DeletePromoCodeAsync_NoOrders_DeletesSuccessfully()
    {
        var code = new PromoCode { Id = 1, Code = "SALE20" };
        _promoCodes.GetByIdAsync(1, Arg.Any<CancellationToken>()).Returns(code);
        _orders.AnyByPromoCodeIdAsync(1, Arg.Any<CancellationToken>()).Returns(false);

        var result = await _sut.DeletePromoCodeAsync(1);

        Assert.True(result.IsSuccess);
        _promoCodes.Received(1).Remove(code);
    }
}
