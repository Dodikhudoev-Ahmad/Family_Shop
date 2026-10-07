namespace Application.Services;

/// <summary>
/// Where the site lives and how to link to it from crawler pages. <see cref="SiteUrl"/> is the canonical origin with no trailing
/// slash (https://www.familyshop10.kz); <see cref="UploadsBaseUrl"/> turns a relative photo path into an address (null: such a
/// photo is not used).
/// </summary>
public sealed record SeoSettings(string SiteUrl, string? UploadsBaseUrl, int SitemapCacheSeconds)
{
    public string DefaultImageUrl => $"{SiteUrl}/og-default.png";
}
