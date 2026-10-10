using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using NSubstitute;
using Xunit;
using Api.Controllers;
using Api.Security;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;

namespace Application.Tests.Security;

/// <summary>The refresh-token cookie: Domain / SameSite / Secure / HttpOnly per environment and per host, through sign-in,
/// reload (refresh with rotation) and sign-out.</summary>
public class RefreshCookieTests
{
    private static RefreshCookiePolicy Policy(string environment, string? domain = ".familyshop10.kz")
    {
        var env = Substitute.For<IWebHostEnvironment>();
        env.EnvironmentName.Returns(environment);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(domain is null ? [] : [new KeyValuePair<string, string?>(RefreshCookiePolicy.DomainKey, domain)])
            .Build();
        return new RefreshCookiePolicy(config, env);
    }

    private static HttpRequest RequestTo(string host)
    {
        var http = new DefaultHttpContext();
        http.Request.Host = new HostString(host);
        return http.Request;
    }

    // ---- the policy ----

    [Theory]
    [InlineData("api.familyshop10.kz")]
    [InlineData("API.FamilyShop10.kz")]
    [InlineData("familyshop10.kz")]
    [InlineData("a.b.familyshop10.kz")]
    public void Production_OnTheShopsDomain_IsStrictSecureHttpOnly_WithTheDomain(string host)
    {
        var options = Policy("Production").Build(RequestTo(host), null);

        Assert.Equal(".familyshop10.kz", options.Domain);
        Assert.Equal(SameSiteMode.Strict, options.SameSite);
        Assert.True(options.Secure);
        Assert.True(options.HttpOnly);
        Assert.Equal("/api/v1/auth", options.Path);
    }

    [Theory]
    [InlineData("old-api.example.net")]  // another host: cross-site arrangement
    [InlineData("evilfamilyshop10.kz")]
    [InlineData("familyshop10.kz.evil.example")]
    public void Production_OnAnyOtherHost_KeepsTheOldCrossSiteCookie_WithoutADomain(string host)
    {
        var options = Policy("Production").Build(RequestTo(host), null);

        Assert.Null(options.Domain); // a Domain of another site would be rejected outright
        Assert.Equal(SameSiteMode.None, options.SameSite);
        Assert.True(options.Secure);
        Assert.True(options.HttpOnly);
    }

    [Theory]
    [InlineData("localhost:5280")]
    [InlineData("api.familyshop10.kz")] // even if someone points a dev machine at it
    public void Development_HasNoDomain_AndIsLax_SoLocalhostWorks(string host)
    {
        var options = Policy("Development").Build(RequestTo(host), null);

        Assert.Null(options.Domain);
        Assert.Equal(SameSiteMode.Lax, options.SameSite);
        Assert.True(options.HttpOnly);
    }

    [Fact]
    public void WithoutAConfiguredDomain_ProductionKeepsTheCrossSiteCookie()
    {
        var options = Policy("Production", domain: null).Build(RequestTo("api.familyshop10.kz"), null);

        Assert.Null(options.Domain);
        Assert.Equal(SameSiteMode.None, options.SameSite);
    }

    [Theory]
    [InlineData("familyshop10.kz")]   // the leading dot is added
    [InlineData(".FamilyShop10.KZ")]
    public void TheConfiguredDomainIsNormalized(string configured)
    {
        Assert.Equal(".familyshop10.kz", Policy("Production", configured).Build(RequestTo("api.familyshop10.kz"), null).Domain);
    }

    [Theory]
    [InlineData("*.familyshop10.kz")]
    [InlineData("https://familyshop10.kz")]
    [InlineData("localhost")]
    [InlineData(".kz.")]
    public void AnInvalidDomainStopsTheStartUp(string configured)
    {
        Assert.Throws<InvalidOperationException>(() => Policy("Production", configured));
    }

    [Fact]
    public void TheLifetimeIsCarriedOver()
    {
        var expires = DateTimeOffset.UtcNow.AddDays(14);

        Assert.Equal(expires, Policy("Production").Build(RequestTo("api.familyshop10.kz"), expires).Expires);
    }

    // ---- through the controller: Set-Cookie on sign-in, reload (rotation) and sign-out ----

    private static AuthController Controller(IAuthService service, RefreshCookiePolicy policy, string host, string? cookie = null)
    {
        var controller = new AuthController(service, policy);
        var http = new DefaultHttpContext();
        http.Request.Host = new HostString(host);
        http.Request.Scheme = "https";
        if (cookie is not null) http.Request.Headers.Cookie = cookie;
        http.Request.Headers.Origin = "https://www.familyshop10.kz";
        controller.ControllerContext = new ControllerContext { HttpContext = http };
        return controller;
    }

    private static AuthResult Issued(string refreshToken) =>
        new(new AuthResponseDto(1, "a@b.kz", "A", "Customer", "access"), refreshToken, DateTime.UtcNow.AddDays(14));

    private static string SetCookie(ControllerBase controller) => controller.Response.Headers.SetCookie.ToString().ToLowerInvariant();

    private static void AssertStrictShopCookie(string header)
    {
        Assert.Contains("domain=.familyshop10.kz", header);
        Assert.Contains("samesite=strict", header);
        Assert.Contains("secure", header);
        Assert.Contains("httponly", header);
        Assert.Contains("path=/api/v1/auth", header);
    }

    [Fact]
    public async Task SignIn_SetsTheStrictShopCookie_AndNeverPutsTheTokenInTheBody()
    {
        var service = Substitute.For<IAuthService>();
        service.LoginAsync(Arg.Any<LoginRequestDto>(), Arg.Any<SessionContext>(), Arg.Any<CancellationToken>()).Returns(Result<AuthResult>.Success(Issued("refresh-1")));
        var controller = Controller(service, Policy("Production"), "api.familyshop10.kz");

        var result = await controller.Login(new LoginRequestDto("a@b.kz", "pw"), CancellationToken.None);

        var header = SetCookie(controller);
        Assert.StartsWith("refreshtoken=refresh-1", header);
        AssertStrictShopCookie(header);
        Assert.DoesNotContain("refresh-1", System.Text.Json.JsonSerializer.Serialize(((OkObjectResult)result.Result!).Value));
    }

    [Fact]
    public async Task ReloadRefresh_RotatesTheCookie_WithTheSameAttributes()
    {
        var service = Substitute.For<IAuthService>();
        service.RefreshAsync("refresh-1", Arg.Any<SessionContext>(), Arg.Any<CancellationToken>()).Returns(Result<AuthResult>.Success(Issued("refresh-2")));
        var controller = Controller(service, Policy("Production"), "api.familyshop10.kz", cookie: "refreshToken=refresh-1");

        await controller.Refresh(CancellationToken.None);

        var header = SetCookie(controller);
        Assert.StartsWith("refreshtoken=refresh-2", header); // a new value replaces the old one
        AssertStrictShopCookie(header);
    }

    [Fact]
    public async Task ARejectedRefresh_AndSignOut_DeleteTheCookie_WithTheAttributesItWasSetWith()
    {
        var service = Substitute.For<IAuthService>();
        service.RefreshAsync(Arg.Any<string>(), Arg.Any<SessionContext>(), Arg.Any<CancellationToken>()).Returns(Result<AuthResult>.Failure("expired"));

        var rejected = Controller(service, Policy("Production"), "api.familyshop10.kz", cookie: "refreshToken=stale");
        await rejected.Refresh(CancellationToken.None);
        var signedOut = Controller(service, Policy("Production"), "api.familyshop10.kz", cookie: "refreshToken=refresh-1");
        await signedOut.Logout(CancellationToken.None);

        foreach (var header in new[] { SetCookie(rejected), SetCookie(signedOut) })
        {
            Assert.StartsWith("refreshtoken=;", header);
            Assert.Contains("1970", header); // expired: the browser removes it
            AssertStrictShopCookie(header); // a deletion with other attributes would be ignored by the browser
        }
    }

    [Fact]
    public async Task OnAnyOtherHost_SignInStillGivesTheCrossSiteCookie()
    {
        var service = Substitute.For<IAuthService>();
        service.LoginAsync(Arg.Any<LoginRequestDto>(), Arg.Any<SessionContext>(), Arg.Any<CancellationToken>()).Returns(Result<AuthResult>.Success(Issued("refresh-1")));
        var controller = Controller(service, Policy("Production"), "old-api.example.net");

        await controller.Login(new LoginRequestDto("a@b.kz", "pw"), CancellationToken.None);

        var header = SetCookie(controller);
        Assert.Contains("samesite=none", header);
        Assert.Contains("secure", header);
        Assert.Contains("httponly", header);
        Assert.DoesNotContain("domain=", header);
    }

    [Fact]
    public async Task InDevelopment_SignInGivesAHostOnlyLaxCookie()
    {
        var service = Substitute.For<IAuthService>();
        service.LoginAsync(Arg.Any<LoginRequestDto>(), Arg.Any<SessionContext>(), Arg.Any<CancellationToken>()).Returns(Result<AuthResult>.Success(Issued("refresh-1")));
        var controller = Controller(service, Policy("Development"), "localhost:5280");

        await controller.Login(new LoginRequestDto("a@b.kz", "pw"), CancellationToken.None);

        var header = SetCookie(controller);
        Assert.Contains("samesite=lax", header);
        Assert.DoesNotContain("domain=", header);
        Assert.Contains("httponly", header);
    }

    [Fact]
    public void TheDeployedConfiguration_NamesTheShopDomain()
    {
        var production = new ConfigurationBuilder().SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json").AddJsonFile("appsettings.Production.json").Build();

        Assert.Equal(".familyshop10.kz", production[RefreshCookiePolicy.DomainKey]);
    }
}
