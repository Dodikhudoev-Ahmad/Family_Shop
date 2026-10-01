using Xunit;
using Application.DTOs;
using Application.Validators;
using Domain.Entities;

namespace Application.Tests.Security;

public class UrlRulesTests
{
    [Theory]
    [InlineData("/catalog/women", true)]
    [InlineData("https://shop.example/sale", true)]
    [InlineData("http://shop.example/sale", true)]
    [InlineData("", true)]
    [InlineData(null, true)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("JaVaScRiPt:alert(1)", false)]
    [InlineData("data:text/html,<script>alert(1)</script>", false)]
    [InlineData("//evil.example/phish", false)]      // protocol-relative: leaves the site
    [InlineData("/\\evil.example", false)]           // browsers normalise "\" to "/"
    [InlineData("vbscript:msgbox(1)", false)]
    [InlineData("ftp://x.example/f", false)]
    public void Link(string? link, bool allowed) => Assert.Equal(allowed, UrlRules.IsSafeLink(link));

    [Theory]
    [InlineData("https://images.pexels.com/photos/1/a.jpeg", true)]
    [InlineData("/uploads/products/abc.jpg", true)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("data:image/svg+xml,<svg onload=alert(1)>", false)]
    [InlineData("//evil.example/x.png", false)]
    [InlineData("", false)]
    public void Image(string image, bool allowed) => Assert.Equal(allowed, UrlRules.IsSafeImage(image));

    [Fact]
    public void BannerValidator_RejectsAProtocolRelativeButtonLink_AndAJavascriptImage()
    {
        var validator = new PromoBannerUpsertValidator();
        PromoBannerUpsertDto Banner(string? link, string? image) => new("Title", null, "Go", link, image, true, 0, PromoBannerPlacement.Home);

        Assert.True(validator.Validate(Banner("/catalog/men", "https://cdn.example/b.jpg")).IsValid);
        Assert.False(validator.Validate(Banner("//evil.example", null)).IsValid);
        Assert.False(validator.Validate(Banner("/ok", "javascript:alert(1)")).IsValid);
    }

    [Fact]
    public void ProductValidator_BoundsAndChecksImages()
    {
        var validator = new ProductUpsertValidator();
        ProductUpsertDto Product(List<string> images) => new("Name", "Desc", 100, null, 5, 1, Gender.Male, images, false);

        Assert.True(validator.Validate(Product(new() { "https://cdn.example/a.jpg" })).IsValid);
        Assert.False(validator.Validate(Product(new() { "javascript:alert(1)" })).IsValid);
        Assert.False(validator.Validate(Product(Enumerable.Repeat("https://cdn.example/a.jpg", 11).ToList())).IsValid);
    }
}
