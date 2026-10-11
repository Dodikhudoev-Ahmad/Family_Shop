namespace Api.Security;

/// <summary>
/// Responses that carry one person's data (their orders, their review, anything under /admin) must not be kept by a
/// browser or an intermediary cache. The auth controllers already say so themselves; this covers the rest by path, so a
/// new admin controller is covered without remembering an attribute. Public catalogue responses are left alone.
/// </summary>
public static class PersonalDataCacheHeaders
{
    private static readonly string[] Prefixes =
    [
        "/api/v1/orders",
        "/api/v1/reviews/mine",
        "/api/v1/admin",
        "/api/v1/auth",
    ];

    public static bool Applies(PathString path) =>
        Prefixes.Any(prefix => path.StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase));

    public static IApplicationBuilder UsePersonalDataCacheHeaders(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            if (Applies(context.Request.Path))
            {
                context.Response.OnStarting(() =>
                {
                    // Respect an explicit choice made by the action (e.g. the Excel export already sets no-store).
                    if (!context.Response.Headers.ContainsKey("Cache-Control"))
                    {
                        context.Response.Headers.CacheControl = "no-store";
                    }
                    return Task.CompletedTask;
                });
            }
            await next();
        });
}
