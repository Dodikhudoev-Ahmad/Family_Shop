using Application.Services;
using Infrastructure.Storage;

namespace Api.Seo;

/// <summary>Reads and validates <c>Seo:*</c>; a malformed value stops the start-up (a wrong canonical origin would poison every crawler page).</summary>
public static class SeoSettingsFactory
{
    public const string SiteUrlKey = "Seo:SiteUrl";
    public const string SitemapCacheKey = "Seo:SitemapCacheSeconds";
    public const string DefaultSiteUrl = "https://www.familyshop10.kz";
    public const int DefaultSitemapCacheSeconds = 600;

    public static SeoSettings Resolve(IConfiguration configuration)
    {
        var configured = configuration[SiteUrlKey];
        var siteUrl = string.IsNullOrWhiteSpace(configured) ? DefaultSiteUrl : configured.Trim().TrimEnd('/');
        if (!Uri.TryCreate(siteUrl, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            || uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment) || !string.IsNullOrEmpty(uri.UserInfo))
        {
            throw new InvalidOperationException($"Invalid {SiteUrlKey} '{configured}': expected scheme://host[:port] with no path.");
        }

        var cacheSeconds = DefaultSitemapCacheSeconds;
        var cacheText = configuration[SitemapCacheKey];
        if (!string.IsNullOrWhiteSpace(cacheText) && (!int.TryParse(cacheText, out cacheSeconds) || cacheSeconds < 0 || cacheSeconds > 86_400))
        {
            throw new InvalidOperationException($"Invalid {SitemapCacheKey} '{cacheText}': expected a number of seconds from 0 to 86400.");
        }

        return new SeoSettings(uri.GetLeftPart(UriPartial.Authority).ToLowerInvariant(), UploadsLocation.ResolvePublicBaseUrl(configuration), cacheSeconds);
    }
}
