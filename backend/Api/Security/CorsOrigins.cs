using Microsoft.Extensions.Configuration;

namespace Api.Security;

/// <summary>
/// The browser origins that may call the API with credentials, read from configuration only (no host is written in code):
///  - <c>Cors:AllowedOrigins</c> - a JSON array in appsettings (<c>Cors__AllowedOrigins__0</c>, <c>__1</c> ... as variables);
///  - <c>Cors:AllowedOriginsList</c> - one comma / semicolon / space separated string (<c>Cors__AllowedOriginsList</c>), handy
///    as a single hosting variable because array entries from appsettings and from variables merge by index.
/// Both are added together. The same list drives CORS and the Origin check of the cookie endpoints (CookieCsrfFilter).
/// </summary>
public static class CorsOrigins
{
    public const string ArrayKey = "Cors:AllowedOrigins";
    public const string ListKey = "Cors:AllowedOriginsList";
    private const string PolicyName = "Frontend";

    /// <summary>Canonical, distinct, configured origins. A malformed entry stops the start-up with a message that names it.</summary>
    public static IReadOnlyList<string> Read(IConfiguration configuration)
    {
        var raw = (configuration.GetSection(ArrayKey).Get<string[]>() ?? [])
            .Concat((configuration[ListKey] ?? string.Empty).Split([',', ';', ' ', '\n', '\r', '\t'], StringSplitOptions.RemoveEmptyEntries));

        var origins = new List<string>();
        foreach (var entry in raw.Where(e => !string.IsNullOrWhiteSpace(e)))
        {
            var origin = TryNormalize(entry)
                ?? throw new InvalidOperationException(
                    $"Invalid CORS origin '{entry}': expected scheme://host[:port] with no path (e.g. https://www.example.kz).");
            if (!origins.Contains(origin, StringComparer.Ordinal)) origins.Add(origin);
        }

        return origins;
    }

    /// <summary>"https://WWW.Example.kz/" -> "https://www.example.kz"; null for anything that is not a plain http(s) origin
    /// (a path, a query, a wildcard, "null"...).</summary>
    public static string? TryNormalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim().TrimEnd('/');
        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return null;
        if (!string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment)) return null;
        if (uri.AbsolutePath != "/" || trimmed.Contains('*')) return null;
        return uri.GetLeftPart(UriPartial.Authority).ToLowerInvariant();
    }

    public static IServiceCollection AddFamilyShopCors(this IServiceCollection services, IConfiguration configuration)
    {
        var origins = Read(configuration).ToArray();
        services.AddCors(options =>
        {
            options.AddPolicy(PolicyName, policy =>
            {
                // A strict whitelist, never AllowAnyOrigin: requests carry credentials (the refresh cookie).
                policy.WithOrigins(origins)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });
        });
        return services;
    }

    public static IApplicationBuilder UseFamilyShopCors(this IApplicationBuilder app) => app.UseCors(PolicyName);
}
