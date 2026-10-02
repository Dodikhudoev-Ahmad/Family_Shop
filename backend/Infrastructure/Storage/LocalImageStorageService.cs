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

    private readonly string _uploadsRoot;

    /// <param name="uploadsRoot">Directory served as <c>/uploads</c> (see <see cref="UploadsLocation"/>).</param>
    public LocalImageStorageService(string uploadsRoot)
    {
        _uploadsRoot = uploadsRoot;
    }

    public async Task<Result<string>> SaveImageAsync(Stream content, string fileName, string contentType, CancellationToken cancellationToken = default)
    {
        // A multipart part may arrive with no Content-Type at all; treat that as "not an allowed type".
        contentType = (contentType ?? string.Empty).ToLowerInvariant();
        if (!AllowedContentTypes.TryGetValue(contentType, out var extension))
        {
            return Result<string>.Failure("Допустимы только изображения JPEG, PNG, WEBP или GIF.");
        }

        if (content.Length > MaxFileSizeBytes)
        {
            return Result<string>.Failure("Размер изображения не должен превышать 5 МБ.");
        }

        // IFormFile.ContentType is a client-supplied header and can be forged, so it cannot be
        // trusted on its own — confirm the actual file bytes match a real image signature.
        if (!await MatchesImageSignatureAsync(content, contentType, cancellationToken))
        {
            return Result<string>.Failure("Файл повреждён или не является изображением.");
        }

        var targetDirectory = Path.Combine(_uploadsRoot, UploadsLocation.ProductsFolder);
        Directory.CreateDirectory(targetDirectory);

        // Random name - never trust the client-supplied filename for a path, and it also
        // sidesteps collisions between concurrent uploads.
        var storedFileName = $"{Guid.NewGuid():N}{extension}";
        var fullPath = Path.Combine(targetDirectory, storedFileName);

        await using var fileStream = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write);
        await content.CopyToAsync(fileStream, cancellationToken);

        // The public URL format is fixed (and stored in the database), whatever directory the files really live in.
        return Result<string>.Success($"{UploadsLocation.RequestPath}/{UploadsLocation.ProductsFolder}/{storedFileName}");
    }

    private static async Task<bool> MatchesImageSignatureAsync(Stream content, string contentType, CancellationToken cancellationToken)
    {
        var header = new byte[12];
        var bytesRead = await content.ReadAsync(header.AsMemory(0, header.Length), cancellationToken);
        content.Seek(0, SeekOrigin.Begin);

        if (bytesRead < 4)
        {
            return false;
        }

        return contentType switch
        {
            "image/jpeg" => header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
            "image/png" => header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47,
            "image/gif" => header[0] == 0x47 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x38,
            "image/webp" => bytesRead == 12
                && header[0] == 0x52 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x46
                && header[8] == 0x57 && header[9] == 0x45 && header[10] == 0x42 && header[11] == 0x50,
            _ => false
        };
    }
}
