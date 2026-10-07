using Microsoft.Extensions.Configuration;
using Xunit;
using Api.Seo;

namespace Application.Tests.Seo;

public class SeoSettingsFactoryTests
{
    private static IConfiguration Config(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value))).Build();

    [Fact]
    public void Defaults_AreTheWwwDomainAndTenMinutes()
    {
        var settings = SeoSettingsFactory.Resolve(Config());
        Assert.Equal("https://www.familyshop10.kz", settings.SiteUrl);
        Assert.Equal(600, settings.SitemapCacheSeconds);
        Assert.Equal("https://www.familyshop10.kz/og-default.png", settings.DefaultImageUrl);
        Assert.Null(settings.UploadsBaseUrl);
    }

    [Fact]
    public void ASlashAtTheEnd_AndUpperCase_AreNormalized_AndTheUploadsOriginIsTaken()
    {
        var settings = SeoSettingsFactory.Resolve(Config(("Seo:SiteUrl", "HTTPS://WWW.Example.kz/"), ("Uploads:PublicBaseUrl", "https://api.example.kz")));
        Assert.Equal("https://www.example.kz", settings.SiteUrl);
        Assert.Equal("https://api.example.kz", settings.UploadsBaseUrl);
    }

    [Theory]
    [InlineData("www.familyshop10.kz")]
    [InlineData("ftp://www.familyshop10.kz")]
    [InlineData("https://www.familyshop10.kz/shop")]
    [InlineData("https://www.familyshop10.kz/?a=1")]
    [InlineData("https://user:pw@www.familyshop10.kz")]
    public void ABadSiteUrl_StopsTheStartUp(string value) =>
        Assert.Throws<InvalidOperationException>(() => SeoSettingsFactory.Resolve(Config(("Seo:SiteUrl", value))));

    [Theory]
    [InlineData("-1")]
    [InlineData("abc")]
    [InlineData("100000")]
    public void ABadCacheTime_StopsTheStartUp(string value) =>
        Assert.Throws<InvalidOperationException>(() => SeoSettingsFactory.Resolve(Config(("Seo:SitemapCacheSeconds", value))));
}
