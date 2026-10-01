using System.Net;
using System.Reflection;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;
using Api.Controllers;
using Api.RateLimiting;

namespace Application.Tests.Security;

/// <summary>
/// Which endpoints sit under the strict credential limits and which only under the global one.
/// Login/registration/refresh must stay tight (brute force); the signed-in session-management calls
/// must not share the login budget (a user opening "my devices" a few times must not lock themselves out).
/// </summary>
public class RateLimitPolicyTests
{
    private static string? PolicyOf(Type controller, string action) =>
        controller.GetMethod(action)!.GetCustomAttribute<EnableRateLimitingAttribute>()?.PolicyName
        ?? controller.GetCustomAttribute<EnableRateLimitingAttribute>()?.PolicyName;

    // ---- which policy each real action carries ----

    [Theory]
    [InlineData(typeof(AuthController), "Login", RateLimitPolicies.Auth)]
    [InlineData(typeof(AuthController), "Logout", RateLimitPolicies.Auth)]
    [InlineData(typeof(AuthController), "Register", RateLimitPolicies.AuthRegister)]
    [InlineData(typeof(AuthController), "Refresh", RateLimitPolicies.AuthRefresh)]
    [InlineData(typeof(MobileAuthController), "Login", RateLimitPolicies.Auth)]
    [InlineData(typeof(MobileAuthController), "Logout", RateLimitPolicies.Auth)]
    [InlineData(typeof(MobileAuthController), "Register", RateLimitPolicies.AuthRegister)]
    [InlineData(typeof(MobileAuthController), "Refresh", RateLimitPolicies.AuthRefresh)]
    public void CredentialEndpoints_StayUnderTheirStrictPolicies_OnBothWebAndMobile(Type controller, string action, string expected) =>
        Assert.Equal(expected, PolicyOf(controller, action));

    [Theory]
    [InlineData("GetSessions")]
    [InlineData("RevokeSession")]
    [InlineData("LogoutAll")]
    public void SessionManagement_HasNoNamedPolicy_SoOnlyTheGlobalLimitApplies(string action)
    {
        Assert.Null(PolicyOf(typeof(AuthController), action));
        Assert.Null(typeof(AuthController).GetCustomAttribute<EnableRateLimitingAttribute>()); // not inherited from the class
    }

    // ---- actual behaviour, on a real Kestrel host using the app's own limiter registration ----

    private sealed class Host : IAsyncDisposable
    {
        public WebApplication App { get; }
        public HttpClient Client { get; }

        public Host(Action<WebApplication> map)
        {
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseUrls("http://127.0.0.1:0");
            builder.Logging.ClearProviders();
            // The Api project's appsettings.Production.json is copied next to the tests and limits AllowedHosts to the
            // production domain, which would answer 400 to 127.0.0.1.
            builder.Configuration["AllowedHosts"] = "*";
            builder.Services.AddFamilyShopRateLimiting();
            App = builder.Build();
            App.UseRateLimiter();
            map(App);
            App.StartAsync().GetAwaiter().GetResult();
            Client = new HttpClient { BaseAddress = new Uri(App.Urls.First()) };
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.StopAsync();
            await App.DisposeAsync();
        }
    }

    /// <summary>Mirrors the real routes: each endpoint gets exactly the policy its controller action declares.</summary>
    private static Host StartHost() => new(app =>
    {
        void Map(string path, Type controller, string action, bool post)
        {
            var policy = PolicyOf(controller, action);
            var builder = post
                ? app.MapPost(path, () => Results.Ok())
                : app.MapGet(path, () => Results.Ok());
            if (policy is not null) builder.RequireRateLimiting(policy);
        }

        Map("/login", typeof(AuthController), "Login", post: true);
        Map("/register", typeof(AuthController), "Register", post: true);
        Map("/refresh", typeof(AuthController), "Refresh", post: true);
        Map("/mobile-login", typeof(MobileAuthController), "Login", post: true);
        Map("/sessions", typeof(AuthController), "GetSessions", post: false);
        Map("/logout-all", typeof(AuthController), "LogoutAll", post: true);
    });

    private static async Task<List<HttpStatusCode>> Hit(HttpClient client, string path, int times, bool post = true)
    {
        var results = new List<HttpStatusCode>();
        for (var i = 0; i < times; i++)
        {
            var response = post
                ? await client.PostAsync(path, new StringContent("{}"))
                : await client.GetAsync(path);
            results.Add(response.StatusCode);
        }

        return results;
    }

    [Fact]
    public async Task FifteenSessionListRequestsInARow_AllPass()
    {
        await using var host = StartHost();

        var results = await Hit(host.Client, "/sessions", 15, post: false);

        Assert.All(results, status => Assert.Equal(HttpStatusCode.OK, status));
    }

    [Fact]
    public async Task TheEleventhLoginInAMinute_Gets429()
    {
        await using var host = StartHost();

        var results = await Hit(host.Client, "/login", 11);

        Assert.All(results.Take(10), status => Assert.Equal(HttpStatusCode.OK, status));
        Assert.Equal(HttpStatusCode.TooManyRequests, results[10]);
    }

    [Fact]
    public async Task ExhaustingTheLoginBudget_DoesNotLockOutSessionManagement()
    {
        await using var host = StartHost();
        Assert.Contains(HttpStatusCode.TooManyRequests, await Hit(host.Client, "/login", 11));

        Assert.All(await Hit(host.Client, "/sessions", 15, post: false), status => Assert.Equal(HttpStatusCode.OK, status));
        Assert.All(await Hit(host.Client, "/logout-all", 5), status => Assert.Equal(HttpStatusCode.OK, status));
    }

    [Fact]
    public async Task MobileLogin_SharesTheSameStrictBudgetAsWebLogin()
    {
        await using var host = StartHost();
        Assert.All((await Hit(host.Client, "/login", 10)), status => Assert.Equal(HttpStatusCode.OK, status));

        // the budget is per IP and per policy, not per route: mobile login is the same "auth" bucket
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Hit(host.Client, "/mobile-login", 1))[0]);
    }

    [Fact]
    public async Task RegistrationAndRefresh_KeepTheirOwnLimits()
    {
        await using var host = StartHost();

        var register = await Hit(host.Client, "/register", 6);
        Assert.All(register.Take(5), status => Assert.Equal(HttpStatusCode.OK, status));
        Assert.Equal(HttpStatusCode.TooManyRequests, register[5]);

        var refresh = await Hit(host.Client, "/refresh", 21);
        Assert.All(refresh.Take(20), status => Assert.Equal(HttpStatusCode.OK, status));
        Assert.Equal(HttpStatusCode.TooManyRequests, refresh[20]);
    }
}
