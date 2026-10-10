using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;
using Api.Filters;
using Api.Security;

namespace Application.Tests.Security;

/// <summary>The origin whitelist: where it comes from, what the deployed configuration contains, and that CORS and the
/// cookie endpoints' Origin check both obey it.</summary>
public class CorsOriginsTests
{
    private const string Www = "https://www.familyshop10.kz";
    private const string Root = "https://familyshop10.kz";

    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value))).Build();

    private static IConfiguration FromFiles(params string[] files)
    {
        var builder = new ConfigurationBuilder().SetBasePath(AppContext.BaseDirectory);
        foreach (var file in files) builder.AddJsonFile(file, optional: false);
        return builder.Build();
    }

    // ---- reading the list ----

    [Fact]
    public void TheArrayAndTheSingleListVariableAreAddedTogether_Normalized_WithoutDuplicates()
    {
        var origins = CorsOrigins.Read(Config(
            ("Cors:AllowedOrigins:0", "https://WWW.familyshop10.kz/"),
            ("Cors:AllowedOriginsList", "https://familyshop10.kz, https://www.familyshop10.kz;http://localhost:5173")));

        Assert.Equal([Www, Root, "http://localhost:5173"], origins);
    }

    [Fact]
    public void AllowedOriginsGivenAsOnePlainVariable_IsReadToo_NotSilentlyIgnored()
    {
        // Cors__AllowedOrigins=https://www.familyshop10.kz,https://familyshop10.kz  (a string, not Cors__AllowedOrigins__0, __1 ...)
        var origins = CorsOrigins.Read(Config(("Cors:AllowedOrigins", "https://www.familyshop10.kz, https://familyshop10.kz")));

        Assert.Equal([Www, Root], origins);
    }

    [Fact]
    public void TheIndexedVariablesAndThePlainOneWorkTogether()
    {
        var origins = CorsOrigins.Read(Config(("Cors:AllowedOrigins:0", Www), ("Cors:AllowedOrigins:1", Root)));

        Assert.Equal([Www, Root], origins);
    }

    [Theory]
    [InlineData("*")]
    [InlineData("www.familyshop10.kz")]
    [InlineData("https://www.familyshop10.kz/app")]
    [InlineData("https://www.familyshop10.kz?x=1")]
    [InlineData("https://*.familyshop10.kz")]
    [InlineData("ftp://familyshop10.kz")]
    public void AMalformedEntryStopsTheStartUp_AndNamesItself(string bad)
    {
        var error = Assert.Throws<InvalidOperationException>(() => CorsOrigins.Read(Config(("Cors:AllowedOriginsList", bad))));
        Assert.Contains(bad, error.Message);
    }

    // ---- what is deployed ----

    [Fact]
    public void Production_AllowsOnlyTheShopsDomains()
    {
        var origins = CorsOrigins.Read(FromFiles("appsettings.json", "appsettings.Production.json"));

        Assert.Contains(Www, origins);
        Assert.Contains(Root, origins);
        Assert.Equal(2, origins.Count);
        Assert.All(origins, o => Assert.StartsWith("https://", o));
        Assert.DoesNotContain(origins, o => o.Contains("localhost"));
    }

    [Fact]
    public void Production_AcceptsRequestsForTheApiHost()
    {
        var hosts = FromFiles("appsettings.json", "appsettings.Production.json")["AllowedHosts"]!.Split(';');

        Assert.Contains("api.familyshop10.kz", hosts); // otherwise host filtering answers 400 on the new domain
    }

    // ---- the real CORS pipeline ----

    private sealed class Host : IAsyncDisposable
    {
        private readonly WebApplication _app;
        public HttpClient Client { get; }

        public Host(IConfiguration configuration)
        {
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseUrls("http://127.0.0.1:0");
            builder.Logging.ClearProviders();
            builder.Configuration["AllowedHosts"] = "*";
            builder.Services.AddFamilyShopCors(configuration);
            _app = builder.Build();
            _app.UseFamilyShopCors();
            _app.MapPost("/api/v1/auth/refresh", () => Results.Ok());
            _app.StartAsync().GetAwaiter().GetResult();
            Client = new HttpClient { BaseAddress = new Uri(_app.Urls.First()) };
        }

        public async Task<HttpResponseMessage> PreflightAsync(string origin)
        {
            using var request = new HttpRequestMessage(HttpMethod.Options, "/api/v1/auth/refresh");
            request.Headers.TryAddWithoutValidation("Origin", origin);
            request.Headers.TryAddWithoutValidation("Access-Control-Request-Method", "POST");
            request.Headers.TryAddWithoutValidation("Access-Control-Request-Headers", "x-requested-with,idempotency-key,authorization,content-type");
            return await Client.SendAsync(request);
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await _app.StopAsync();
            await _app.DisposeAsync();
        }
    }

    private static IConfiguration Deployed() => FromFiles("appsettings.json", "appsettings.Production.json");

    [Theory]
    [InlineData(Www)]
    [InlineData(Root)]
    public async Task ThePreflightOfAWhitelistedOrigin_IsAnswered_WithCredentialsAllowed(string origin)
    {
        await using var host = new Host(Deployed());

        var response = await host.PreflightAsync(origin);

        Assert.Equal(origin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Equal("true", response.Headers.GetValues("Access-Control-Allow-Credentials").Single());
        Assert.Contains("idempotency-key", string.Join(",", response.Headers.GetValues("Access-Control-Allow-Headers")), StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("http://www.familyshop10.kz")]               // same host, the wrong scheme
    [InlineData("https://www.familyshop10.kz.evil.example")] // a lookalike that starts with ours
    [InlineData("https://evil-familyshop10.kz")]
    [InlineData("https://api.familyshop10.kz")]              // the API itself is not a page origin
    [InlineData("https://shop.familyshop10.kz")]             // a sibling subdomain is not whitelisted
    [InlineData("null")]
    public async Task AnyOtherOrigin_GetsNoCorsHeaders(string origin)
    {
        await using var host = new Host(Deployed());

        var response = await host.PreflightAsync(origin);

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
        Assert.False(response.Headers.Contains("Access-Control-Allow-Credentials"));
    }

    [Fact]
    public async Task AnOriginAddedThroughTheListVariable_IsAllowedWithoutAnyCodeChange()
    {
        await using var host = new Host(Config(("Cors:AllowedOriginsList", "https://staging.familyshop10.kz")));

        var response = await host.PreflightAsync("https://staging.familyshop10.kz");

        Assert.Equal("https://staging.familyshop10.kz", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    // ---- the Origin check of /auth/refresh and /auth/logout ----

    private static (ActionExecutingContext Context, bool Blocked) RunFilter(IConfiguration configuration, string? origin, bool marker = true)
    {
        var http = new DefaultHttpContext();
        if (origin is not null) http.Request.Headers.Origin = origin;
        if (marker) http.Request.Headers[CookieCsrfFilter.HeaderName] = CookieCsrfFilter.HeaderValue;
        var context = new ActionExecutingContext(new ActionContext(http, new RouteData(), new ActionDescriptor()), new List<IFilterMetadata>(), new Dictionary<string, object?>(), new object());
        new CookieCsrfFilter(configuration).OnActionExecuting(context);
        return (context, context.Result is ObjectResult { StatusCode: StatusCodes.Status403Forbidden });
    }

    [Theory]
    [InlineData(Www)]
    [InlineData(Root)]
    public void TheCookieEndpoints_AcceptTheWhitelistedOrigins(string origin) =>
        Assert.False(RunFilter(Deployed(), origin).Blocked);

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("http://www.familyshop10.kz")]
    [InlineData("https://www.familyshop10.kz.evil.example")]
    [InlineData("https://shop.familyshop10.kz")]
    [InlineData("null")]
    public void TheCookieEndpoints_RefuseEveryOtherOrigin_EvenWithTheMarkerHeader(string origin) =>
        Assert.True(RunFilter(Deployed(), origin).Blocked);

    [Fact]
    public void TheCookieEndpoints_StillNeedTheMarkerHeader()
    {
        Assert.True(RunFilter(Deployed(), Www, marker: false).Blocked);
    }

    [Fact]
    public void TheCookieEndpoints_ReadTheSameListVariableAsCors()
    {
        var configuration = Config(("Cors:AllowedOriginsList", "https://staging.familyshop10.kz"));

        Assert.False(RunFilter(configuration, "https://staging.familyshop10.kz").Blocked);
        Assert.True(RunFilter(configuration, Www).Blocked);
    }
}
