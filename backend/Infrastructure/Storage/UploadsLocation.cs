using Microsoft.Extensions.Configuration;

namespace Infrastructure.Storage;

/// <summary>
/// Where uploaded files live on disk. <c>Uploads:Path</c> (env <c>Uploads__Path</c>) is the directory that is served
/// as <c>/uploads/*</c>; product photos go to its <c>products</c> subfolder, i.e. <c>/uploads/products/{file}</c> -
/// the same public URL as before, wherever the files are kept. Unset, it is <c>{content root}/wwwroot/uploads</c>
/// (the old location), so local development and every URL already stored in the database keep working. On a host with
/// an ephemeral file system (Railway) point it at a mounted volume, e.g. <c>/data/uploads</c>.
/// </summary>
public static class UploadsLocation
{
    public const string RequestPath = "/uploads";
    public const string ProductsFolder = "products";
    public const string ConfigKey = "Uploads:Path";

    public static string Resolve(IConfiguration configuration, string contentRootPath)
    {
        var configured = configuration[ConfigKey];
        var root = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(contentRootPath, "wwwroot", "uploads")
            : Path.Combine(contentRootPath, configured.Trim()); // an absolute path wins over the content root
        return Path.GetFullPath(root);
    }
}

/// <summary>The resolved uploads directory, registered once so storage and static-file serving agree on it.</summary>
public sealed record UploadsDirectory(string Path);
