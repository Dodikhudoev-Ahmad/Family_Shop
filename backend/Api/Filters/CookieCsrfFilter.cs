using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Api.Common;

namespace Api.Filters;

/// <summary>
/// CSRF defence for the endpoints that act on the refresh-token cookie. The cookie is SameSite=None
/// (the SPA and the API are on different sites), so the browser attaches it to requests started by ANY
/// page, including a hostile one: without this a malicious site could force-logout a visitor or rotate
/// their session. Two checks, both of which a cross-site attacker cannot satisfy from a browser:
///  1. a custom header - adding it makes the request "non-simple", so the browser must first pass the
///     CORS preflight, which only the whitelisted front-end origin passes;
///  2. the Origin header, when present, must be one of the whitelisted origins (browsers always send
///     it on cross-origin POSTs and script cannot forge it).
/// Bearer-token endpoints don't need this: an Authorization header is never attached automatically.
/// </summary>
public class CookieCsrfFilter : IActionFilter
{
    public const string HeaderName = "X-Requested-With";
    public const string HeaderValue = "fetch";

    private readonly HashSet<string> _allowedOrigins;

    public CookieCsrfFilter(IConfiguration configuration)
    {
        var origins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
        _allowedOrigins = new HashSet<string>(origins.Select(Normalize), StringComparer.OrdinalIgnoreCase);
    }

    public void OnActionExecuting(ActionExecutingContext context)
    {
        var request = context.HttpContext.Request;

        var hasMarker = request.Headers.TryGetValue(HeaderName, out var marker)
            && string.Equals(marker.ToString(), HeaderValue, StringComparison.Ordinal);

        var originOk = true;
        if (request.Headers.TryGetValue("Origin", out var origin) && !string.IsNullOrEmpty(origin))
        {
            originOk = _allowedOrigins.Contains(Normalize(origin.ToString()));
        }

        if (!hasMarker || !originOk)
        {
            context.Result = new ObjectResult(ApiResponse<object>.Fail("Request blocked."))
            {
                StatusCode = StatusCodes.Status403Forbidden
            };
        }
    }

    public void OnActionExecuted(ActionExecutedContext context)
    {
    }

    private static string Normalize(string origin) => origin.Trim().TrimEnd('/');
}
