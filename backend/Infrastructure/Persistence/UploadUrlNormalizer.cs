using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Persistence;

/// <summary>
/// Moves the host of uploaded-image URLs already stored in the database to the configured public base URL
/// (<c>Uploads:PublicBaseUrl</c>). Before the move to the shop's own domain the admin's uploads were saved with whatever host
/// the request arrived on (the platform's address), so existing products keep pointing there; this rewrites just those URLs in
/// place. Only a URL of exactly our own upload shape (<c>[origin]/uploads/products/{32 hex}.{jpg|png|webp|gif}</c>) is touched -
/// photos from other sites are not - and rows are only UPDATEd, never recreated, so orders and reviews that reference the
/// products are unaffected. Idempotent: a second run finds nothing left to change.
/// </summary>
public static class UploadUrlNormalizer
{
    private const string OurUploadPattern = @"^(https?://[^/]+)?/uploads/products/[0-9a-f]{32}\.(jpg|png|webp|gif)$";

    public static async Task<int> NormalizeAsync(AppDbContext context, string publicBaseUrl, ILogger logger, CancellationToken cancellationToken = default)
    {
        var pattern = OurUploadPattern;

        var products = await context.Database.ExecuteSqlInterpolatedAsync($@"
UPDATE ""Products"" AS p
SET ""Images"" = ARRAY(
    SELECT CASE WHEN i ~ {pattern} THEN {publicBaseUrl} || regexp_replace(i, '^https?://[^/]+', '') ELSE i END
    FROM unnest(p.""Images"") WITH ORDINALITY AS t(i, n)
    ORDER BY n)
WHERE EXISTS (
    SELECT 1 FROM unnest(p.""Images"") AS i
    WHERE i ~ {pattern} AND left(i, length({publicBaseUrl}) + 1) <> {publicBaseUrl} || '/')", cancellationToken);

        var banners = await context.Database.ExecuteSqlInterpolatedAsync($@"
UPDATE ""PromoBanners""
SET ""ImageUrl"" = {publicBaseUrl} || regexp_replace(""ImageUrl"", '^https?://[^/]+', '')
WHERE ""ImageUrl"" ~ {pattern} AND left(""ImageUrl"", length({publicBaseUrl}) + 1) <> {publicBaseUrl} || '/'", cancellationToken);

        if (products + banners > 0)
        {
            logger.LogInformation("Moved the uploaded-image URLs of {Products} products and {Banners} banners to {BaseUrl}.", products, banners, publicBaseUrl);
        }

        return products + banners;
    }
}
