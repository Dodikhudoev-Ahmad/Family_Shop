using Microsoft.Extensions.Hosting;
using Application.Common;
using Application.Interfaces;

namespace Infrastructure.Storage;

public class LocalImageStorageService : IImageStorageService
{
    private static readonly Dictionary<string, string> AllowedContentTypes = new()
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/webp"] = ".webp",
        ["image/gif"] = ".gif"
    };

    private const long MaxFileSizeBytes = 5 * 1024 * 1024;
    private const string UploadsFolder = "uploads/products";

    private readonly IHostEnvironment _environment;

    public LocalImageStorageService(IHostEnvironment environment)
    {
        _environment = environment;
    }

    public async Task<Result<string>> SaveImageAsync(Stream content, string fileName, string contentType, CancellationToken cancellationToken = default)
    {
        if (!AllowedContentTypes.TryGetValue(contentType.ToLowerInvariant(), out var extension))
        {
            return Result<string>.Failure("Допустимы только изображения JPEG, PNG, WEBP или GIF.");
        }

        if (content.Length > MaxFileSizeBytes)
        {
            return Result<string>.Failure("Размер изображения не должен превышать 5 МБ.");
        }

        var webRootPath = Path.Combine(_environment.ContentRootPath, "wwwroot");
        var targetDirectory = Path.Combine(webRootPath, UploadsFolder);
        Directory.CreateDirectory(targetDirectory);

        // Random name - never trust the client-supplied filename for a path, and it also
        // sidesteps collisions between concurrent uploads.
        var storedFileName = $"{Guid.NewGuid():N}{extension}";
        var fullPath = Path.Combine(targetDirectory, storedFileName);

        await using var fileStream = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write);
        await content.CopyToAsync(fileStream, cancellationToken);

        return Result<string>.Success($"/{UploadsFolder}/{storedFileName}");
    }
}
