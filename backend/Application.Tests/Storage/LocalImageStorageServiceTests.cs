using Microsoft.Extensions.Hosting;
using NSubstitute;
using Xunit;
using Infrastructure.Storage;

namespace Application.Tests.Storage;

public class LocalImageStorageServiceTests : IDisposable
{
    private readonly string _tempRoot = Path.Combine(Path.GetTempPath(), $"family-shop-tests-{Guid.NewGuid():N}");
    private readonly LocalImageStorageService _sut;

    public LocalImageStorageServiceTests()
    {
        var environment = Substitute.For<IHostEnvironment>();
        environment.ContentRootPath.Returns(_tempRoot);
        _sut = new LocalImageStorageService(environment);
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
        byte[] jpegBytes = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01];
        using var stream = new MemoryStream(jpegBytes);

        var result = await _sut.SaveImageAsync(stream, "photo.jpg", "image/jpeg");

        Assert.True(result.IsSuccess);
        Assert.EndsWith(".jpg", result.Value);
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
