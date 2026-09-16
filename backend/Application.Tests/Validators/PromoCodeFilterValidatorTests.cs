using Xunit;
using Application.DTOs;
using Application.Validators;

namespace Application.Tests.Validators;

public class PromoCodeFilterValidatorTests
{
    private readonly PromoCodeFilterValidator _sut = new();

    [Fact]
    public void Validate_DefaultFilter_IsValid()
    {
        var result = _sut.Validate(new PromoCodeFilterDto());

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Validate_PageZero_IsInvalid()
    {
        var result = _sut.Validate(new PromoCodeFilterDto(Page: 0));

        Assert.False(result.IsValid);
    }

    [Fact]
    public void Validate_PageSizeOutOfRange_IsInvalid()
    {
        var result = _sut.Validate(new PromoCodeFilterDto(PageSize: 0));

        Assert.False(result.IsValid);
    }
}
