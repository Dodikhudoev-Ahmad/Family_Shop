using Microsoft.Extensions.FileProviders;
using Infrastructure.Storage;

namespace Api.Common;

public static class UploadsStaticFiles
{
    /// <summary>
    /// Serves <paramref name="uploadsRoot"/> as <c>/uploads/*</c>. The directory (with <c>products</c>) is created if
    /// missing. PhysicalFileProvider refuses anything that resolves outside the root ("..", absolute paths), so a
    /// request cannot read other files; unmatched requests fall through to the next middleware.
    /// </summary>
    public static IApplicationBuilder UseUploads(this IApplicationBuilder app, string uploadsRoot)
    {
        Directory.CreateDirectory(Path.Combine(uploadsRoot, UploadsLocation.ProductsFolder));
        return app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(uploadsRoot),
            RequestPath = UploadsLocation.RequestPath
        });
    }
}
