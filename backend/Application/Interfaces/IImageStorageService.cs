using Application.Common;

namespace Application.Interfaces;

public interface IImageStorageService
{
    /// <summary>Saves an uploaded image to storage and returns its relative path (e.g. "/uploads/products/{file}").</summary>
    Task<Result<string>> SaveImageAsync(Stream content, string fileName, string contentType, CancellationToken cancellationToken = default);
}
