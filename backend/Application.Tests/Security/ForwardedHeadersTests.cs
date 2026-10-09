using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;
using Api.RateLimiting;
using Api.Security;

namespace Application.Tests.Security;

/// <summary>X-Forwarded-For behind a reverse proxy: the client address is the one the proxy appended, never one the client
/// wrote itself, and rate limiting is keyed on it.</summary>
public class ForwardedHeadersTests
{
    private sealed class Host : IAsyncDisposable
    {
        public WebApplication App { get; }
        public HttpClient Client { get; }

        public Host(params string[] knownNetworks) : this(null, knownNetworks) { }

        public Host(IReadOnlyDictionary<string, string?>? settings, params string[] knownNetworks)
        {
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseUrls("http://127.0.0.1:0");
            builder.Logging.ClearProviders();
            builder.Configuration["AllowedHosts"] = "*";
            for (var i = 0; i < knownNetworks.Length; i++)
            {
                builder.Configuration[$"{ForwardedHeadersSetup.KnownNetworksKey}:{i}"] = knownNetworks[i];
            }

            foreach (var (key, value) in settings ?? new Dictionary<string, string?>()) builder.Configuration[key] = value;

            builder.Services.AddFamilyShopForwardedHeaders(builder.Configuration);
            builder.Services.AddFamilyShopRateLimiting();
            App = builder.Build();
            App.UseForwardedHeaders(); // the same place as in Program: first
            App.UseCloudflareClientIp(builder.Configuration); // ... and right after it
            App.UseRateLimiter();
            App.MapGet("/whoami", (HttpContext c) => Results.Ok(new { ip = c.Connection.RemoteIpAddress?.ToString(), scheme = c.Request.Scheme }));
            App.MapPost("/login", () => Results.Ok()).RequireRateLimiting(RateLimitPolicies.Auth);
            App.StartAsync().GetAwaiter().GetResult();
            Client = new HttpClient { BaseAddress = new Uri(App.Urls.First()) };
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.StopAsync();
            await App.DisposeAsync();
        }

        public async Task<HttpStatusCode> LoginAsync(string? forwardedFor)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/login") { Content = new StringContent("{}") };
            if (forwardedFor is not null) request.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedFor);
            return (await Client.SendAsync(request)).StatusCode;
        }

        /// <summary>A request that looks like the production chain: <paramref name="forwardedFor"/> is what Railway's edge saw
        /// (a Cloudflare node when the site is opened through Cloudflare), <paramref name="cfConnectingIp"/> what Cloudflare adds.</summary>
        public async Task<HttpStatusCode> LoginAsync(string? forwardedFor, string? cfConnectingIp)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/login") { Content = new StringContent("{}") };
            if (forwardedFor is not null) request.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedFor);
            if (cfConnectingIp is not null) request.Headers.TryAddWithoutValidation("CF-Connecting-IP", cfConnectingIp);
            return (await Client.SendAsync(request)).StatusCode;
        }

        public async Task<string?> IpSeenAsync(string? forwardedFor, params string[] cfConnectingIp)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/whoami");
            if (forwardedFor is not null) request.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedFor);
            foreach (var value in cfConnectingIp) request.Headers.TryAddWithoutValidation("CF-Connecting-IP", value);
            var json = await (await Client.SendAsync(request)).Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            return json.GetProperty("ip").GetString();
        }

        public async Task<(string? Ip, string? Scheme)> WhoAmIAsync(string? forwardedFor, string? proto = null)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/whoami");
            if (forwardedFor is not null) request.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedFor);
            if (proto is not null) request.Headers.TryAddWithoutValidation("X-Forwarded-Proto", proto);
            var json = await (await Client.SendAsync(request)).Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            return (json.GetProperty("ip").GetString(), json.GetProperty("scheme").GetString());
        }
    }

    // ---- which address is used ----

    [Fact]
    public async Task TheClientAddress_IsTheEntryTheProxyAppended_NotWhatTheClientWroteToTheLeft()
    {
        await using var host = new Host();

        // The visitor sent "X-Forwarded-For: 1.2.3.4"; the proxy appended the real address after it.
        var (ip, _) = await host.WhoAmIAsync("1.2.3.4, 203.0.113.9");

        Assert.Equal("203.0.113.9", ip);
    }

    [Fact]
    public async Task WithoutTheHeader_TheDirectPeerIsUsed()
    {
        await using var host = new Host();

        var (ip, _) = await host.WhoAmIAsync(null);

        Assert.Equal("127.0.0.1", ip);
    }

    [Fact]
    public async Task TheForwardedProto_IsApplied()
    {
        await using var host = new Host();

        var (_, scheme) = await host.WhoAmIAsync("203.0.113.9", proto: "https");

        Assert.Equal("https", scheme);
    }

    // ---- rate limiting is keyed on that address ----

    [Fact]
    public async Task ForgingTheLeftEntryOfXForwardedFor_DoesNotBuyANewLoginBudget()
    {
        await using var host = new Host();
        const string realClient = "203.0.113.9"; // what the proxy appended for this visitor

        var statuses = new List<HttpStatusCode>();
        for (var i = 1; i <= 11; i++)
        {
            statuses.Add(await host.LoginAsync($"198.51.100.{i}, {realClient}")); // a different forged address every time
        }

        Assert.All(statuses.Take(10), s => Assert.Equal(HttpStatusCode.OK, s));
        Assert.Equal(HttpStatusCode.TooManyRequests, statuses[10]);
    }

    [Fact]
    public async Task EveryRealClientBehindTheProxy_HasItsOwnBudget_AndOneOfThemBeingLimitedDoesNotLimitTheOthers()
    {
        await using var host = new Host();
        for (var i = 0; i < 10; i++) await host.LoginAsync("203.0.113.9");

        Assert.Equal(HttpStatusCode.TooManyRequests, await host.LoginAsync("203.0.113.9"));
        Assert.Equal(HttpStatusCode.OK, await host.LoginAsync("203.0.113.10"));
        Assert.Equal(HttpStatusCode.OK, await host.LoginAsync("2001:db8::1"));
    }

    // ---- pinning the proxy's network ----

    [Fact]
    public async Task WithKnownNetworksConfigured_AHeaderFromAnywhereElseIsIgnored()
    {
        await using var host = new Host("10.0.0.0/8"); // the test client connects from 127.0.0.1, which is not the proxy

        var (ip, _) = await host.WhoAmIAsync("203.0.113.9");

        Assert.Equal("127.0.0.1", ip);
    }

    [Fact]
    public async Task WithKnownNetworksConfigured_ForgingTheHeaderFromAnOutsiderCannotDodgeTheLimit()
    {
        await using var host = new Host("10.0.0.0/8");

        var statuses = new List<HttpStatusCode>();
        for (var i = 1; i <= 11; i++)
        {
            statuses.Add(await host.LoginAsync($"198.51.100.{i}")); // a lone forged entry, a new one each time
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, statuses[10]);
    }

    [Fact]
    public async Task WithKnownNetworksConfigured_TheProxyInsideThemIsStillTrusted()
    {
        await using var host = new Host("127.0.0.0/8");

        var (ip, _) = await host.WhoAmIAsync("1.2.3.4, 203.0.113.9");

        Assert.Equal("203.0.113.9", ip);
    }

    // ---- behind Cloudflare: the visitor's own address, but only from Cloudflare ----

    private const string CloudflareNode = "104.16.1.1"; // inside 104.16.0.0/13

    [Fact]
    public async Task ThroughCloudflare_TheVisitorAddressIsUsed_NotTheCloudflareNode()
    {
        await using var host = new Host();

        Assert.Equal("203.0.113.9", await host.IpSeenAsync(CloudflareNode, "203.0.113.9"));
        Assert.Equal("2001:db8::7", await host.IpSeenAsync(CloudflareNode, "2001:db8::7"));
    }

    [Fact]
    public async Task ThroughCloudflare_EveryVisitorHasOwnBudget_EvenOnTheSameCloudflareNode()
    {
        await using var host = new Host();
        for (var i = 0; i < 10; i++) await host.LoginAsync(CloudflareNode, "203.0.113.9");

        Assert.Equal(HttpStatusCode.TooManyRequests, await host.LoginAsync(CloudflareNode, "203.0.113.9"));
        Assert.Equal(HttpStatusCode.OK, await host.LoginAsync(CloudflareNode, "203.0.113.10")); // another visitor, same node
    }

    [Fact]
    public async Task ThroughCloudflare_ForgingTheLeftOfXForwardedFor_DoesNotBuyANewBudget()
    {
        await using var host = new Host();

        var statuses = new List<HttpStatusCode>();
        for (var i = 1; i <= 11; i++) statuses.Add(await host.LoginAsync($"198.51.100.{i}, {CloudflareNode}", "203.0.113.9"));

        Assert.Equal(HttpStatusCode.TooManyRequests, statuses[10]);
    }

    [Fact]
    public async Task DirectToTheOrigin_AForgedCfConnectingIp_IsIgnored_SoTheLimitCannotBeDodged()
    {
        await using var host = new Host();
        const string attacker = "203.0.113.9"; // what Railway's edge recorded: not a Cloudflare address

        Assert.Equal(attacker, await host.IpSeenAsync(attacker, "198.51.100.1"));

        var statuses = new List<HttpStatusCode>();
        for (var i = 1; i <= 11; i++) statuses.Add(await host.LoginAsync(attacker, $"198.51.100.{i}")); // a new forged identity each time
        Assert.All(statuses.Take(10), s => Assert.Equal(HttpStatusCode.OK, s));
        Assert.Equal(HttpStatusCode.TooManyRequests, statuses[10]);
    }

    [Fact]
    public async Task WithoutXForwardedFor_AForgedCfConnectingIp_IsIgnored()
    {
        await using var host = new Host();

        Assert.Equal("127.0.0.1", await host.IpSeenAsync(null, "198.51.100.1"));
    }

    [Fact]
    public async Task ABrokenOrRepeatedCfConnectingIp_IsIgnored_AndTheCloudflareNodeStays()
    {
        await using var host = new Host();

        Assert.Equal(CloudflareNode, await host.IpSeenAsync(CloudflareNode, "not-an-ip"));
        Assert.Equal(CloudflareNode, await host.IpSeenAsync(CloudflareNode)); // no header at all
        Assert.Equal(CloudflareNode, await host.IpSeenAsync(CloudflareNode, "198.51.100.1", "198.51.100.2")); // two values
    }

    [Fact]
    public async Task WhenDisabled_TheHeaderIsNeverUsed()
    {
        await using var host = new Host(new Dictionary<string, string?> { [CloudflareClientIp.EnabledKey] = "false" });

        Assert.Equal(CloudflareNode, await host.IpSeenAsync(CloudflareNode, "203.0.113.9"));
    }

    [Fact]
    public async Task ExtraRanges_AreTrustedToo()
    {
        await using var host = new Host(new Dictionary<string, string?> { [CloudflareClientIp.ExtraRangesKey] = "192.0.2.0/24, 2001:db8:ff::/48" });

        Assert.Equal("203.0.113.9", await host.IpSeenAsync("192.0.2.5", "203.0.113.9"));
        Assert.Equal("203.0.113.9", await host.IpSeenAsync("2001:db8:ff::1", "203.0.113.9"));
    }

    [Theory]
    [InlineData("173.245.48.1", true)]
    [InlineData("104.16.0.0", true)]
    [InlineData("104.23.255.255", true)]
    [InlineData("104.24.5.5", true)]
    [InlineData("104.32.0.0", false)] // just past 104.24.0.0/14
    [InlineData("103.21.244.9", true)]
    [InlineData("103.21.248.1", false)]
    [InlineData("203.0.113.9", false)]
    [InlineData("10.0.0.1", false)]
    [InlineData("127.0.0.1", false)]
    [InlineData("2606:4700::1111", true)]
    [InlineData("2a06:98c0::1", true)]
    [InlineData("2001:db8::1", false)]
    [InlineData("::ffff:104.16.1.1", true)] // an IPv4 address in its IPv6-mapped form
    public void CloudflareRanges_AreRecognised(string address, bool expected)
    {
        var ranges = CloudflareClientIp.ParseRanges(null);

        Assert.Equal(expected, CloudflareClientIp.IsCloudflare(IPAddress.Parse(address), ranges));
    }

    [Fact]
    public void OnlyTheCloudflareMiddleware_ReadsCfConnectingIp()
    {
        var root = BackendRoot();
        var readers = new[] { "Api", "Application", "Infrastructure", "Domain" }
            .SelectMany(project => Directory.EnumerateFiles(Path.Combine(root, project), "*.cs", SearchOption.AllDirectories))
            .Where(file => !file.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}") && !file.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"))
            .Where(file => File.ReadAllText(file).Contains("CF-Connecting-IP", StringComparison.OrdinalIgnoreCase)
                           && File.ReadAllText(file).Contains("Headers", StringComparison.Ordinal))
            .Select(Path.GetFileName)
            .ToList();

        Assert.Equal(new[] { "CloudflareClientIp.cs" }, readers);
    }

    [Fact]
    public void TheCloudflareMiddleware_RunsRightAfterForwardedHeaders()
    {
        var program = File.ReadAllText(Path.Combine(BackendRoot(), "Api", "Program.cs"));
        var calls = System.Text.RegularExpressions.Regex.Matches(program, @"\bapp\.(Use\w+|Map\w+)\(")
            .Select(m => m.Groups[1].Value).ToList();

        Assert.Equal("UseForwardedHeaders", calls[0]);
        Assert.Equal("UseCloudflareClientIp", calls[1]);
    }

    // ---- nobody reads the raw header; the middleware runs first ----

    private static string BackendRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "Api"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("backend root not found");
    }

    [Fact]
    public void NoCodeReadsTheRawForwardedHeader_OnlyTheMiddlewareRewrittenRemoteIpAddress()
    {
        var root = BackendRoot();
        var offenders = new[] { "Api", "Application", "Infrastructure", "Domain" }
            .SelectMany(project => Directory.EnumerateFiles(Path.Combine(root, project), "*.cs", SearchOption.AllDirectories))
            .Where(file => !file.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}") && !file.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"))
            .Where(file => System.Text.RegularExpressions.Regex.IsMatch(
                File.ReadAllText(file), @"Headers\s*(\[|\.)[^\n;]*X-Forwarded", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            .ToList();

        Assert.Empty(offenders);
    }

    [Fact]
    public void ForwardedHeadersIsTheFirstMiddleware_SoEverythingAfterItSeesTheRealAddress()
    {
        var program = File.ReadAllText(Path.Combine(BackendRoot(), "Api", "Program.cs"));
        var forwarded = program.IndexOf("app.UseForwardedHeaders();", StringComparison.Ordinal);
        var firstOther = System.Text.RegularExpressions.Regex.Matches(program, @"\bapp\.(Use\w+|Map\w+)\(")
            .Select(m => (m.Index, m.Value))
            .Where(m => m.Value != "app.UseForwardedHeaders(")
            .Select(m => m.Index)
            .Min();

        Assert.True(forwarded >= 0, "UseForwardedHeaders is missing");
        Assert.True(forwarded < firstOther, "UseForwardedHeaders must come before every other app.Use*/Map*");
    }

    [Fact]
    public void RateLimiting_IsKeyedOnRemoteIpAddress_AfterTheMiddleware()
    {
        var source = File.ReadAllText(Path.Combine(BackendRoot(), "Api", "RateLimiting", "RateLimitingExtensions.cs"));

        Assert.Contains("Connection.RemoteIpAddress", source);
        Assert.DoesNotContain("Headers[", source);
    }
}
