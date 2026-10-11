using Api.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Xunit;

namespace Application.Tests.Security;

public class PersonalDataCacheHeadersTests
{
    [Theory]
    [InlineData("/api/v1/orders", true)]
    [InlineData("/api/v1/orders/5", true)]
    [InlineData("/api/v1/reviews/mine", true)]
    [InlineData("/api/v1/admin/orders", true)]
    [InlineData("/api/v1/admin/finance/summary", true)]
    [InlineData("/api/v1/auth/sessions", true)]
    [InlineData("/API/V1/ADMIN/users", true)]
    [InlineData("/api/v1/products", false)]
    [InlineData("/api/v1/categories", false)]
    [InlineData("/api/v1/reviews", false)]
    [InlineData("/api/v1/ordersx", false)]
    [InlineData("/sitemap.xml", false)]
    public void AppliesOnlyToPersonalPaths(string path, bool expected) =>
        Assert.Equal(expected, PersonalDataCacheHeaders.Applies(new PathString(path)));

    private static async Task<string?> CacheControlAsync(string path, string? setByAction = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration["AllowedHosts"] = "*";
        var app = builder.Build();
        app.UsePersonalDataCacheHeaders();
        app.Map("/{**rest}", (HttpContext context) =>
        {
            if (setByAction is not null) context.Response.Headers.CacheControl = setByAction;
            return Results.Ok();
        });
        await app.StartAsync();
        try
        {
            var response = await app.GetTestClient().GetAsync(path);
            return response.Headers.CacheControl?.ToString();
        }
        finally
        {
            await app.StopAsync();
        }
    }

    [Fact]
    public async Task PersonalResponse_GetsNoStore() =>
        Assert.Equal("no-store", await CacheControlAsync("/api/v1/orders"));

    [Fact]
    public async Task PublicResponse_IsLeftAlone() =>
        Assert.Null(await CacheControlAsync("/api/v1/products"));

    [Fact]
    public async Task AnExplicitHeaderFromTheAction_IsKept() =>
        Assert.DoesNotContain("no-store", await CacheControlAsync("/api/v1/admin/x", "private, max-age=5"));
}
