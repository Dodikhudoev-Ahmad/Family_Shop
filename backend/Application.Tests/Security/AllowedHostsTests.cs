using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Application.Tests.Security;

/// <summary>Which Host headers the API answers: the standard AllowedHosts setting, read from configuration (appsettings or the
/// AllowedHosts environment variable), never from code.</summary>
public class AllowedHostsTests
{
    private static string? Deployed(params string[] files)
    {
        var builder = new ConfigurationBuilder().SetBasePath(AppContext.BaseDirectory);
        foreach (var file in files) builder.AddJsonFile(file, optional: false);
        return builder.Build()["AllowedHosts"];
    }

    private static string[] Hosts(string? value) => (value ?? string.Empty).Split(';', StringSplitOptions.RemoveEmptyEntries);

    [Fact]
    public void ProductionDefaults_AllowTheShopsApiHost_AndTheCurrentRailwayHost()
    {
        var hosts = Hosts(Deployed("appsettings.json", "appsettings.Production.json"));

        Assert.Contains("api.familyshop10.kz", hosts);
        Assert.Contains("familyshop-production.up.railway.app", hosts);
        Assert.DoesNotContain("*", hosts);
    }

    [Fact]
    public void BaseDefault_IsNotAWildcard_SoAnUnconfiguredEnvironmentOnlyAnswersLocalhost()
    {
        var hosts = Hosts(Deployed("appsettings.json"));

        Assert.NotEmpty(hosts);
        Assert.DoesNotContain("*", hosts);
        Assert.Contains("localhost", hosts);
    }

    [Theory]
    [InlineData("localhost", HttpStatusCode.OK)]
    [InlineData("localhost:5280", HttpStatusCode.OK)]
    [InlineData("127.0.0.1:5280", HttpStatusCode.OK)]
    [InlineData("evil.example", HttpStatusCode.BadRequest)]
    public async Task BaseDefault_AnswersOnlyLoopbackHosts(string host, HttpStatusCode expected)
    {
        Assert.Equal(expected, await StatusFor(Deployed("appsettings.json"), host));
    }

    [Fact]
    public void Development_AllowsAnyHost_SoLocalhostAndLanAddressesWork()
    {
        Assert.Equal("*", Deployed("appsettings.json", "appsettings.Development.json"));
    }

    // ---- the real host-filtering middleware, driven only by configuration ----

    private static async Task<HttpStatusCode> StatusFor(string? allowedHosts, string hostHeader)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();
        // The AllowedHosts environment variable and this key are the same setting.
        builder.Configuration["AllowedHosts"] = allowedHosts;
        var app = builder.Build();
        app.MapGet("/ping", () => "ok");
        await app.StartAsync();
        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.First()) };
            using var request = new HttpRequestMessage(HttpMethod.Get, "/ping");
            request.Headers.Host = hostHeader;
            return (await client.SendAsync(request)).StatusCode;
        }
        finally
        {
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private const string RailwayValue = "api.familyshop10.kz;familyshop-production.up.railway.app";

    [Theory]
    [InlineData("api.familyshop10.kz", HttpStatusCode.OK)]
    [InlineData("API.FamilyShop10.kz", HttpStatusCode.OK)]
    [InlineData("api.familyshop10.kz:443", HttpStatusCode.OK)]
    [InlineData("familyshop-production.up.railway.app", HttpStatusCode.OK)]
    [InlineData("evil.example", HttpStatusCode.BadRequest)]
    [InlineData("api.familyshop10.kz.evil.example", HttpStatusCode.BadRequest)]
    [InlineData("www.familyshop10.kz", HttpStatusCode.BadRequest)] // the site is not the API
    public async Task TheConfiguredValue_DecidesWhichHostsAreAnswered(string host, HttpStatusCode expected)
    {
        Assert.Equal(expected, await StatusFor(RailwayValue, host));
    }

    [Fact]
    public async Task ChangingTheValue_ChangesTheAnswer_WithoutAnyCodeChange()
    {
        // e.g. after the Railway address is retired, or when a staging host is added
        Assert.Equal(HttpStatusCode.BadRequest, await StatusFor("api.familyshop10.kz", "familyshop-production.up.railway.app"));
        Assert.Equal(HttpStatusCode.OK, await StatusFor("api.familyshop10.kz;staging-api.familyshop10.kz", "staging-api.familyshop10.kz"));
        Assert.Equal(HttpStatusCode.OK, await StatusFor("*", "anything.example"));
    }
}
