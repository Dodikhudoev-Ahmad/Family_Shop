using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using Application.Interfaces;

namespace Infrastructure.Security;

/// <summary>
/// Have I Been Pwned "Pwned Passwords" range API with k-anonymity: only the first 5 hex characters of the password's SHA-1
/// leave the server, the rest of the hash is matched locally. The password and its full hash are never logged.
/// Fails open: a timeout, a network error or any non-200 answer means "not known to be breached".
/// </summary>
public sealed class HibpBreachedPasswordChecker : IBreachedPasswordChecker
{
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(2);
    public const string DefaultRangeUrl = "https://api.pwnedpasswords.com/range/";

    private readonly HttpClient _http;
    private readonly string _rangeUrl;
    private readonly ILogger _logger;

    public HibpBreachedPasswordChecker(HttpClient http, ILogger logger, string? rangeUrl = null)
    {
        _http = http;
        _logger = logger;
        _rangeUrl = string.IsNullOrWhiteSpace(rangeUrl) ? DefaultRangeUrl : rangeUrl;
    }

    public async Task<bool> IsBreachedAsync(string password, CancellationToken cancellationToken = default)
    {
        var hash = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(password)));
        var prefix = hash[..5];
        var suffix = hash[5..];

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(Timeout);

            using var request = new HttpRequestMessage(HttpMethod.Get, _rangeUrl + prefix);
            // Padding makes every answer a similar size, so the response length leaks nothing about the prefix.
            request.Headers.Add("Add-Padding", "true");
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseContentRead, timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Breached-password check skipped: the service answered {Status}.", (int)response.StatusCode);
                return false;
            }

            var body = await response.Content.ReadAsStringAsync(timeout.Token);
            return Matches(body, suffix);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            // Only the exception type goes to the log: no password, no hash, no request URL.
            _logger.LogWarning("Breached-password check skipped: {Reason}.", ex.GetType().Name);
            return false;
        }
    }

    /// <summary>Lines are <c>SUFFIX:COUNT</c>. With padding, fake lines carry count 0 and must not count as a match.</summary>
    internal static bool Matches(string body, string suffix)
    {
        foreach (var rawLine in body.Split('\n'))
        {
            var line = rawLine.Trim();
            var colon = line.IndexOf(':');
            if (colon <= 0)
            {
                continue;
            }

            if (!line.AsSpan(0, colon).Equals(suffix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return long.TryParse(line.AsSpan(colon + 1), out var count) && count > 0;
        }

        return false;
    }
}
