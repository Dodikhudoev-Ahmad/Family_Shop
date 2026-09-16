using Xunit;
using Application.Services;
using Domain.Entities;

namespace Application.Tests.Services;

public class PromoCodePolicyTests
{
    private static PromoCode MakeCode(
        PromoCodeDiscountType type = PromoCodeDiscountType.Percentage,
        decimal value = 20,
        decimal? minOrderAmount = null,
        decimal? maxDiscountAmount = null,
        int? usageLimit = null,
        int usageCount = 0,
        bool isActive = true,
        DateTime? validFrom = null,
        DateTime? validUntil = null) => new()
    {
        Id = 1,
        Code = "SALE20",
        DiscountType = type,
        DiscountValue = value,
        MinOrderAmount = minOrderAmount,
        MaxDiscountAmount = maxDiscountAmount,
        UsageLimit = usageLimit,
        UsageCount = usageCount,
        IsActive = isActive,
        ValidFrom = validFrom ?? DateTime.UtcNow.AddDays(-1),
        ValidUntil = validUntil ?? DateTime.UtcNow.AddDays(1)
    };

    [Fact]
    public void Evaluate_InactiveCode_ReturnsFailure()
    {
        var result = PromoCodePolicy.Evaluate(MakeCode(isActive: false), 1000, DateTime.UtcNow);

        Assert.False(result.IsSuccess);
    }

    [Fact]
    public void Evaluate_BeforeValidFrom_ReturnsFailure()
    {
        var code = MakeCode(validFrom: DateTime.UtcNow.AddDays(1), validUntil: DateTime.UtcNow.AddDays(2));

        var result = PromoCodePolicy.Evaluate(code, 1000, DateTime.UtcNow);

        Assert.False(result.IsSuccess);
    }

    [Fact]
    public void Evaluate_AfterValidUntil_ReturnsFailure()
    {
        var code = MakeCode(validFrom: DateTime.UtcNow.AddDays(-2), validUntil: DateTime.UtcNow.AddDays(-1));

        var result = PromoCodePolicy.Evaluate(code, 1000, DateTime.UtcNow);

        Assert.False(result.IsSuccess);
    }

    [Fact]
    public void Evaluate_BelowMinOrderAmount_ReturnsFailure()
    {
        var code = MakeCode(minOrderAmount: 5000);

        var result = PromoCodePolicy.Evaluate(code, 1000, DateTime.UtcNow);

        Assert.False(result.IsSuccess);
    }

    [Fact]
    public void Evaluate_UsageLimitReached_ReturnsFailure()
    {
        var code = MakeCode(usageLimit: 10, usageCount: 10);

        var result = PromoCodePolicy.Evaluate(code, 1000, DateTime.UtcNow);

        Assert.False(result.IsSuccess);
    }

    [Fact]
    public void Evaluate_PercentageDiscount_ComputesProportionalAmount()
    {
        var code = MakeCode(type: PromoCodeDiscountType.Percentage, value: 20);

        var result = PromoCodePolicy.Evaluate(code, 1000, DateTime.UtcNow);

        Assert.True(result.IsSuccess);
        Assert.Equal(200, result.Value!.DiscountAmount);
        Assert.Equal(800, result.Value.FinalTotal);
    }

    [Fact]
    public void Evaluate_PercentageDiscount_IsCappedByMaxDiscountAmount()
    {
        var code = MakeCode(type: PromoCodeDiscountType.Percentage, value: 50, maxDiscountAmount: 100);

        var result = PromoCodePolicy.Evaluate(code, 1000, DateTime.UtcNow);

        Assert.True(result.IsSuccess);
        Assert.Equal(100, result.Value!.DiscountAmount);
        Assert.Equal(900, result.Value.FinalTotal);
    }

    [Fact]
    public void Evaluate_FixedAmountDiscount_NeverExceedsOrderSubtotal()
    {
        var code = MakeCode(type: PromoCodeDiscountType.FixedAmount, value: 5000);

        var result = PromoCodePolicy.Evaluate(code, 1000, DateTime.UtcNow);

        Assert.True(result.IsSuccess);
        Assert.Equal(1000, result.Value!.DiscountAmount);
        Assert.Equal(0, result.Value.FinalTotal);
    }
}
