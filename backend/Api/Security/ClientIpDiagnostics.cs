using System.Net;

namespace Api.Security;

/// <summary>What the API actually sees for a request after the forwarded-header and Cloudflare steps (admin diagnostics only).</summary>
/// <param name="RemoteIp">The address rate limiting, logs and sessions use (<c>Connection.RemoteIpAddress</c>).</param>
/// <param name="XForwardedForEntries">How many addresses the forwarded-for chain held when it reached the API (a count, never the values).</param>
/// <param name="CfConnectingIpPresent">Whether the request carried the Cloudflare header.</param>
/// <param name="CloudflareTrusted">Whether the request came from a Cloudflare address (the header was honoured, or the peer address is in Cloudflare's ranges).</param>
/// <param name="Scheme">The scheme after <c>X-Forwarded-Proto</c> processing; <c>https</c> means the proxy chain is read correctly.</param>
public sealed record ClientIpDiagnostics(string RemoteIp, int XForwardedForEntries, bool CfConnectingIpPresent, bool CloudflareTrusted, string Scheme)
{
    public static ClientIpDiagnostics Build(HttpContext context, IReadOnlyList<IPNetwork> cloudflareRanges)
    {
        var remote = context.Connection.RemoteIpAddress;
        var honoured = context.Items.TryGetValue(CloudflareClientIp.AppliedItemKey, out var applied) && applied is true;

        return new ClientIpDiagnostics(
            remote?.ToString() ?? string.Empty,
            CountForwardedEntries(context.Request),
            CloudflareClientIp.HeaderPresent(context.Request),
            honoured || CloudflareClientIp.IsCloudflare(remote, cloudflareRanges),
            context.Request.Scheme);
    }

    /// <summary>
    /// The forwarded-headers middleware moves the chain it processed into the "original" header and leaves only the
    /// unprocessed rest in the main one, so the original, when present, is the full chain. Only the number of entries is taken.
    /// </summary>
    private static int CountForwardedEntries(HttpRequest request)
    {
        var chain = request.Headers[Microsoft.AspNetCore.HttpOverrides.ForwardedHeadersDefaults.XOriginalForHeaderName];
        if (chain.Count == 0) chain = request.Headers[Microsoft.AspNetCore.HttpOverrides.ForwardedHeadersDefaults.XForwardedForHeaderName];

        return chain
            .SelectMany(value => (value ?? string.Empty).Split(','))
            .Count(entry => !string.IsNullOrWhiteSpace(entry));
    }
}
