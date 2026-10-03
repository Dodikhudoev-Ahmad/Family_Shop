using Microsoft.AspNetCore.HttpOverrides;

namespace Api.Security;

public static class ForwardedHeadersSetup
{
    /// <summary>Optional list of CIDR ranges (e.g. <c>ForwardedHeaders__KnownNetworks__0=100.64.0.0/10</c>) the reverse proxy
    /// connects from. When set, X-Forwarded-* is honoured only for requests that come from these ranges.</summary>
    public const string KnownNetworksKey = "ForwardedHeaders:KnownNetworks";

    /// <summary>
    /// The API runs behind Railway's reverse proxy, so without forwarded-header processing every request would appear to
    /// come from the proxy: all per-IP rate-limit buckets (login 10/min, global 100/min, ...) would be shared by every
    /// visitor, and <c>Request.Scheme</c> would be http (breaking the HTTPS redirect and Secure cookies).
    ///
    /// DECISION on trust: the default trust list (loopback only) is cleared, because Railway's proxy address is not fixed
    /// (the edge proxies come from a changing internal range), so a pinned list would silently stop honouring the header and
    /// collapse all visitors into one bucket. That is acceptable only because the service is reachable from the internet
    /// solely through Railway's edge, which appends the real client address to X-Forwarded-For (this has to be re-checked
    /// on the platform after a deploy - see TODO.md, item 3). Two things keep it safe if a client forges the header:
    ///  - <c>ForwardLimit = 1</c>: only the LAST entry, the one the proxy itself appended, is used. Whatever a client puts
    ///    to the left of it ("X-Forwarded-For: 1.2.3.4" sent by the visitor becomes "1.2.3.4, &lt;real ip&gt;") is ignored;
    ///  - a fixed set of trusted ranges can be pinned without a code change via <see cref="KnownNetworksKey"/>, which turns
    ///    this off for everything outside those ranges (use it once the proxy's range is known).
    /// Rate limiting, logging and sessions must read <c>HttpContext.Connection.RemoteIpAddress</c> (rewritten by this
    /// middleware) and never the raw header; a test scans the source for that.
    /// </summary>
    public static IServiceCollection AddFamilyShopForwardedHeaders(this IServiceCollection services, IConfiguration configuration)
    {
        var knownNetworks = configuration.GetSection(KnownNetworksKey).Get<string[]>() ?? [];

        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 1;

            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            foreach (var network in knownNetworks.Where(n => !string.IsNullOrWhiteSpace(n)))
            {
                options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network.Trim()));
            }
        });

        return services;
    }
}
