using System.Text.RegularExpressions;

namespace Api.Security;

/// <summary>
/// Attributes of the httpOnly refresh-token cookie.
///  - Production, API on the shop's own domain (Auth:RefreshCookieDomain, e.g. ".familyshop10.kz"): the SPA (www.) and the API
///    (api.) are the same SITE, so the cookie is <c>Domain=.familyshop10.kz; Secure; HttpOnly; SameSite=Strict</c>. Strict is
///    safe and survives a reload because the requests are same-site; CookieCsrfFilter stays as a second layer.
///  - Development: no Domain (host-only on localhost) and <c>SameSite=Lax</c>, so the Vite / Expo web preview on another
///    localhost port works.
///  - Production, but the API is reached on any other host (any host outside the shop's own domain): the old
///    cross-site arrangement, <c>SameSite=None; Secure</c> with no Domain - a Strict cookie or a Domain of another site would be
///    rejected by the browser and every reload would log the user out.
/// The decision is made per request from the host the browser called, so Delete() sends the same attributes as the cookie it
/// removes (the browser ignores a deletion whose Domain / Path / SameSite differ).
/// </summary>
public class RefreshCookiePolicy
{
    public const string DomainKey = "Auth:RefreshCookieDomain";
    public const string Path = "/api/v1/auth";

    private static readonly Regex DomainFormat = new(@"^\.?([a-z0-9-]+\.)+[a-z]{2,}$", RegexOptions.Compiled);

    private readonly bool _isDevelopment;
    private readonly string? _domain; // ".familyshop10.kz"

    public RefreshCookiePolicy(IConfiguration configuration, IWebHostEnvironment environment)
    {
        _isDevelopment = environment.IsDevelopment();

        var configured = configuration[DomainKey]?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(configured))
        {
            if (!DomainFormat.IsMatch(configured))
            {
                throw new InvalidOperationException($"Invalid {DomainKey} '{configured}': expected a domain such as .example.kz.");
            }

            _domain = configured.StartsWith('.') ? configured : "." + configured;
        }
    }

    public CookieOptions Build(HttpRequest request, DateTimeOffset? expires)
    {
        var options = new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            Expires = expires,
            Path = Path,
            SameSite = SameSiteMode.None
        };

        if (_isDevelopment)
        {
            options.SameSite = SameSiteMode.Lax;
        }
        else if (_domain is not null && IsWithinDomain(request.Host.Host))
        {
            options.Domain = _domain;
            options.SameSite = SameSiteMode.Strict;
        }

        return options;
    }

    private bool IsWithinDomain(string host)
    {
        var core = _domain!.TrimStart('.');
        host = host.ToLowerInvariant();
        return host == core || host.EndsWith("." + core, StringComparison.Ordinal);
    }
}
