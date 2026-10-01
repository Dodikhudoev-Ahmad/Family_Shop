using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Xunit;
using Api.Filters;

namespace Application.Tests.Security;

public class CookieCsrfFilterTests
{
    private const string Frontend = "https://shop.example.kz";

    private static CookieCsrfFilter Filter(params string[] origins)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(origins.Select((o, i) => new KeyValuePair<string, string?>($"Cors:AllowedOrigins:{i}", o)))
            .Build();
        return new CookieCsrfFilter(config);
    }

    private static ActionExecutingContext Context(string? origin, string? marker)
    {
        var http = new DefaultHttpContext();
        if (origin is not null) http.Request.Headers.Origin = origin;
        if (marker is not null) http.Request.Headers[CookieCsrfFilter.HeaderName] = marker;
        return new ActionExecutingContext(new ActionContext(http, new RouteData(), new ActionDescriptor()), new List<IFilterMetadata>(), new Dictionary<string, object?>(), new object());
    }

    private static bool Blocked(ActionExecutingContext ctx) =>
        ctx.Result is ObjectResult { StatusCode: StatusCodes.Status403Forbidden };

    [Fact]
    public void TheRealFrontend_WithTheMarkerHeader_IsAllowed()
    {
        var ctx = Context(Frontend, CookieCsrfFilter.HeaderValue);
        Filter(Frontend).OnActionExecuting(ctx);
        Assert.Null(ctx.Result);
    }

    [Fact]
    public void ATrailingSlashOrDifferentCaseInTheConfiguredOrigin_StillMatches()
    {
        var ctx = Context(Frontend, CookieCsrfFilter.HeaderValue);
        Filter("HTTPS://SHOP.EXAMPLE.KZ/").OnActionExecuting(ctx);
        Assert.Null(ctx.Result);
    }

    [Fact]
    public void AHostileSite_IsBlocked_EvenWithTheMarkerHeader()
    {
        // The attacker page can't pass the CORS preflight for the custom header in a browser, but even a
        // server-side-assisted request carrying the header must not be accepted from a foreign Origin.
        var ctx = Context("https://evil.example", CookieCsrfFilter.HeaderValue);
        Filter(Frontend).OnActionExecuting(ctx);
        Assert.True(Blocked(ctx));
    }

    [Fact]
    public void ASimpleCrossSitePost_WithoutTheMarkerHeader_IsBlocked()
    {
        // A plain <form> POST or no-cors fetch: the browser sends the cookie and an Origin, no custom header.
        var ctx = Context(Frontend, marker: null);
        Filter(Frontend).OnActionExecuting(ctx);
        Assert.True(Blocked(ctx));
    }

    [Theory]
    [InlineData("XMLHttpRequest")]
    [InlineData("Fetch")]
    [InlineData("")]
    public void AWrongMarkerValue_IsBlocked(string value)
    {
        var ctx = Context(Frontend, value);
        Filter(Frontend).OnActionExecuting(ctx);
        Assert.True(Blocked(ctx));
    }

    [Fact]
    public void ARequestWithNoOriginHeader_ButWithTheMarker_IsAllowed_ForNonBrowserClients()
    {
        var ctx = Context(origin: null, CookieCsrfFilter.HeaderValue);
        Filter(Frontend).OnActionExecuting(ctx);
        Assert.Null(ctx.Result);
    }

    [Fact]
    public void WithNoConfiguredOrigins_AnyForeignOriginIsBlocked()
    {
        var ctx = Context("https://anything.example", CookieCsrfFilter.HeaderValue);
        Filter().OnActionExecuting(ctx);
        Assert.True(Blocked(ctx));
    }
}
