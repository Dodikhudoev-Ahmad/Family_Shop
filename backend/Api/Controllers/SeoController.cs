using Application.Interfaces;
using Application.Services;
using Api.Seo;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Net.Http.Headers;

namespace Api.Controllers;

/// <summary>
/// For crawlers (docs/Seo.md): the sitemap and minimal HTML pages with the meta tags of a product or category, which the site's
/// host serves to bots that do not run JavaScript. Public, under the general rate limit, no <c>/api/v1</c> prefix, not JSON.
/// </summary>
[ApiController]
public class SeoController : ControllerBase
{
    private const int MaxSlugLength = 100;
    private const string SitemapCacheKey = "seo:sitemap.xml";

    private readonly ISeoService _seo;
    private readonly SeoSettings _settings;
    private readonly IMemoryCache _cache;

    public SeoController(ISeoService seo, SeoSettings settings, IMemoryCache cache)
    {
        _seo = seo;
        _settings = settings;
        _cache = cache;
    }

    /// <summary>HTML с мета-тегами товара (title, description, canonical, og:*, цена, JSON-LD Product). Нет товара — 404 + noindex.</summary>
    [AllowAnonymous]
    [HttpGet("seo/product/{id:int}")]
    public async Task<ContentResult> Product(int id, CancellationToken cancellationToken)
    {
        var page = await _seo.GetProductPageAsync(id, cancellationToken);
        return Html(page is null ? null : SeoRenderer.PageHtml(page));
    }

    /// <summary>HTML с мета-тегами категории. Нет категории — 404 + noindex.</summary>
    [AllowAnonymous]
    [HttpGet("seo/category/{slug}")]
    public async Task<ContentResult> Category(string slug, CancellationToken cancellationToken)
    {
        var page = slug.Length > MaxSlugLength ? null : await _seo.GetCategoryPageAsync(slug, cancellationToken);
        return Html(page is null ? null : SeoRenderer.PageHtml(page));
    }

    /// <summary>sitemap.xml: главная, каталог, о нас, категории и товары; абсолютные адреса на www, lastmod из UpdatedAt.</summary>
    [AllowAnonymous]
    [HttpGet("sitemap.xml")]
    public async Task<ContentResult> Sitemap(CancellationToken cancellationToken)
    {
        if (!_cache.TryGetValue(SitemapCacheKey, out string? xml) || xml is null)
        {
            xml = SeoRenderer.SitemapXml(await _seo.GetSitemapAsync(cancellationToken));
            if (_settings.SitemapCacheSeconds > 0)
            {
                _cache.Set(SitemapCacheKey, xml, TimeSpan.FromSeconds(_settings.SitemapCacheSeconds));
            }
        }

        Response.Headers[HeaderNames.CacheControl] = "public, max-age=3600";
        return new ContentResult { Content = xml, ContentType = "application/xml; charset=utf-8", StatusCode = StatusCodes.Status200OK };
    }

    private ContentResult Html(string? html)
    {
        var found = html is not null;
        Response.Headers[HeaderNames.CacheControl] = found ? "public, max-age=300" : "public, max-age=60";
        return new ContentResult
        {
            Content = html ?? SeoRenderer.NotFoundHtml(),
            ContentType = "text/html; charset=utf-8",
            StatusCode = found ? StatusCodes.Status200OK : StatusCodes.Status404NotFound
        };
    }
}
