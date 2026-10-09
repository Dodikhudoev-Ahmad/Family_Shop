using System.Net;

namespace Api.Security;

/// <summary>
/// The real visitor address when the site is served through Cloudflare (client → Cloudflare → Railway edge → API).
///
/// Why it is needed: <c>UseForwardedHeaders</c> (see <see cref="ForwardedHeadersSetup"/>) takes the LAST X-Forwarded-For entry,
/// the address that connected to Railway's edge. Behind Cloudflare that is a Cloudflare edge address, so every visitor that
/// reaches the same Cloudflare node would share one rate-limit bucket. Cloudflare puts the visitor's address into
/// <c>CF-Connecting-IP</c> (overwriting whatever the visitor sent), and this middleware uses it - but ONLY when the connecting
/// peer, as already established by the forwarded-headers step, is inside Cloudflare's published ranges.
///
/// Why that is safe: a request that goes straight to <c>*.up.railway.app</c> (bypassing Cloudflare) arrives from the visitor's own
/// address, which is not a Cloudflare address, so a forged <c>CF-Connecting-IP</c> is ignored and the visitor keeps the
/// address Railway recorded. The header is never read for any other purpose, and X-Forwarded-For is still never read raw.
/// Known limit: someone who sends requests from inside Cloudflare's network (their own Cloudflare Worker, say) straight to the
/// Railway origin could set the header; closing that needs Cloudflare Authenticated Origin Pulls or a shared secret header
/// (docs/Deploy.md).
/// </summary>
public static class CloudflareClientIp
{
    public const string HeaderName = "CF-Connecting-IP";

    /// <summary>Extra ranges (comma/space separated CIDRs) on top of the built-in list, e.g. <c>Cloudflare__ExtraRanges</c>.</summary>
    public const string ExtraRangesKey = "Cloudflare:ExtraRanges";

    /// <summary>Set to <c>false</c> (<c>Cloudflare__Enabled=false</c>) to ignore the header altogether, e.g. if the site stops using Cloudflare.</summary>
    public const string EnabledKey = "Cloudflare:Enabled";

    // https://www.cloudflare.com/ips-v4 and /ips-v6 (checked 2026-10-09). The list changes rarely; ExtraRanges covers additions between releases.
    private static readonly string[] BuiltInRanges =
    [
        "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
        "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
        "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
        "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"
    ];

    public static IReadOnlyList<IPNetwork> ParseRanges(string? extra)
    {
        var all = BuiltInRanges.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(extra)) all = all.Concat(extra.Split([',', ' ', ';'], StringSplitOptions.RemoveEmptyEntries));
        return all.Select(r => IPNetwork.Parse(r.Trim())).ToList();
    }

    public static bool IsCloudflare(IPAddress? address, IReadOnlyList<IPNetwork> ranges)
    {
        if (address is null) return false;
        var ip = address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address;
        return ranges.Any(r => r.Contains(ip));
    }

    /// <summary>Must run right after <c>UseForwardedHeaders</c> and before anything that reads the client address.</summary>
    public static IApplicationBuilder UseCloudflareClientIp(this IApplicationBuilder app, IConfiguration configuration)
    {
        if (!configuration.GetValue(EnabledKey, true)) return app;
        var ranges = ParseRanges(configuration[ExtraRangesKey]);

        return app.Use(async (context, next) =>
        {
            var header = context.Request.Headers[HeaderName];
            if (header.Count == 1 // several values mean someone is adding to it: do not guess
                && IPAddress.TryParse(header[0]?.Trim(), out var visitor)
                && IsCloudflare(context.Connection.RemoteIpAddress, ranges))
            {
                context.Connection.RemoteIpAddress = visitor;
            }
            await next();
        });
    }
}
