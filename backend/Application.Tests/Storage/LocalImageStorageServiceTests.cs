using Xunit;
using Infrastructure.Storage;

namespace Application.Tests.Storage;

public class LocalImageStorageServiceTests : IDisposable
{
    private readonly string _tempRoot = Path.Combine(Path.GetTempPath(), $"family-shop-tests-{Guid.NewGuid():N}");
    private readonly LocalImageStorageService _sut;

    public LocalImageStorageServiceTests()
    {
        _sut = new LocalImageStorageService(Path.Combine(_tempRoot, "uploads"));
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempRoot))
        {
            Directory.Delete(_tempRoot, recursive: true);
        }
    }

    [Fact]
    public async Task SaveImageAsync_WithValidJpegSignature_Succeeds()
    {
        using var bitmap = new SkiaSharp.SKBitmap(32, 32);
        using var image = SkiaSharp.SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SkiaSharp.SKEncodedImageFormat.Jpeg, 90);
        using var stream = new MemoryStream(data.ToArray());

        var result = await _sut.SaveImageAsync(stream, "photo.jpg", "image/jpeg");

        Assert.True(result.IsSuccess);
        Assert.EndsWith(".webp", result.Value); // always re-encoded, see ImageReencodingTests
    }

    [Fact]
    public async Task SaveImageAsync_WithExecutableRenamedToJpg_FailsMagicByteCheck()
    {
        // MZ header of a Windows PE executable, disguised with a .jpg content type/filename.
        byte[] exeBytes = [0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00];
        using var stream = new MemoryStream(exeBytes);

        var result = await _sut.SaveImageAsync(stream, "malware.jpg", "image/jpeg");

        Assert.False(result.IsSuccess);
    }
}
