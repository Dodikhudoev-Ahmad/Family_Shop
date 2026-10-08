using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Api.RateLimiting;

/// <summary>Names of the rate-limit policies, so controllers and tests can't drift from the registration by a typo.</summary>
public static class RateLimitPolicies
{
    /// <summary>Login, logout (web and mobile): 10/min per IP - a mistyped password a few times is fine, brute force is not.</summary>
    public const string Auth = "auth";

    /// <summary>Registration: its own, tighter budget (5/min per IP).</summary>
    public const string AuthRegister = "auth-register";

    /// <summary>Token refresh: looser (20/min per IP) because it also fires on every page load / app start.</summary>
    public const string AuthRefresh = "auth-refresh";

    public const string OrderCreate = "order-create";
    public const string ReviewCreate = "review-create";
    public const string PromoValidate = "promo-validate";
}

public static class RateLimitingExtensions
{
    /// <summary>Per-IP budget per minute for <c>/seo/*</c> and <c>/sitemap.xml</c>.</summary>
    public const int SeoPermitLimit = 600;

    /// <summary><c>/seo/...</c> (segment match, so <c>/seofoo</c> does not count) or exactly <c>/sitemap.xml</c>.</summary>
    internal static bool IsSeoPath(PathString path) =>
        path.StartsWithSegments("/seo", StringComparison.OrdinalIgnoreCase)
        || path.Equals("/sitemap.xml", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Per-IP fixed-window limits: strict ones for credential endpoints (see <see cref="RateLimitPolicies"/>)
    /// a separate 600/min for crawler paths (/seo/*, /sitemap.xml) and a global 100/min for everything else. Endpoints with no named policy - e.g. the signed-in
    /// session-management calls - are governed by the global limit only.
    /// </summary>
    public static IServiceCollection AddFamilyShopRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // Login/logout: a real user mistyping a password a few times shouldn't get locked out.
            options.AddPolicy(RateLimitPolicies.Auth, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 10,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));

            // Registration: its own budget, separate from login, to keep bulk fake-accoun
            // creation in check without also throttling people just trying to log in.
            options.AddPolicy(RateLimitPolicies.AuthRegister, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 5,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));

            // Silent refresh fires on every full page load (not just explicit user action) and is
            // already protected by the httpOnly refresh-token cookie plus rotation, so it needs a
            // much looser budget than login — otherwise a handful of reloads/tabs locks users out.
            options.AddPolicy(RateLimitPolicies.AuthRefresh, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 20,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));

            // Order creation: generous enough for a real shopper (retrying after a stock/promo
            // error, ordering more than once), tight enough to blunt scripted order-flooding.
            options.AddPolicy(RateLimitPolicies.OrderCreate, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 10,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));

            // Review creation: one person leaves very few reviews per minute in practice.
            options.AddPolicy(RateLimitPolicies.ReviewCreate, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 5,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));

            // Promo code validation: unauthenticated and cheap to call, so it's the easies
            // endpoint to abuse for brute-forcing promo codes - keep it tighter than the
            // global default.
            options.AddPolicy(RateLimitPolicies.PromoValidate, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 15,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));

            // Crawler endpoints (/seo/*, /sitemap.xml) get their own, much larger budget in a separate partition:
            // social-network preview bots (WhatsApp, Telegram, Facebook...) often share one IP, and the general
            // 100/min would cut them off. These requests do not count against the general budget.
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
            {
                var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                return IsSeoPath(context.Request.Path)
                    ? RateLimitPartition.GetFixedWindowLimiter(
                        "seo:" + ip,
                        _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit = SeoPermitLimit,
                            Window = TimeSpan.FromMinutes(1),
                            QueueLimit = 0
                        })
                    : RateLimitPartition.GetFixedWindowLimiter(
                        ip,
                        _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit = 100,
                            Window = TimeSpan.FromMinutes(1),
                            QueueLimit = 0
                        });
            });
        });

        return services;
    }
}
