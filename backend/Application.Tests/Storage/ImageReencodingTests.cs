using System.Text;
using SkiaSharp;
using Xunit;
using Infrastructure.Storage;

namespace Application.Tests.Storage;

/// <summary>Uploaded photos are decoded and re-encoded (WEBP) so that only pixels are stored. Fixtures are generated in code.</summary>
public class ImageReencodingTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"family-shop-reencode-{Guid.NewGuid():N}");
    private readonly LocalImageStorageService _sut;

    public ImageReencodingTests()
    {
        _sut = new LocalImageStorageService(_root);
    }

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }

    // ---- fixtures ----

    private static byte[] Encode(int width, int height, SKEncodedImageFormat format, bool alpha = false)
    {
        using var bitmap = new SKBitmap(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Unpremul));
        using (var canvas = new SKCanvas(bitmap))
        {
            using var paint = new SKPaint
            {
                Shader = SKShader.CreateLinearGradient(
                    new SKPoint(0, 0), new SKPoint(width, height),
                    [new SKColor(193, 122, 84, alpha ? (byte)128 : (byte)255), SKColors.DarkSlateBlue], SKShaderTileMode.Clamp)
            };
            canvas.Clear(SKColors.Transparent);
            canvas.DrawRect(0, 0, width, height, paint);
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(format, 90);
        return data.ToArray();
    }

    private static byte[] WithExifSegment(byte[] jpeg, byte[] tiff)
    {
        // SOI + APP1("Exif\0\0" + TIFF) + the rest of the original file
        var payload = Encoding.ASCII.GetBytes("Exif\0\0").Concat(tiff).ToArray();
        var length = payload.Length + 2;
        return jpeg.Take(2)
            .Concat([(byte)0xFF, (byte)0xE1, (byte)(length >> 8), (byte)(length & 0xFF)])
            .Concat(payload)
            .Concat(jpeg.Skip(2))
            .ToArray();
    }

    /// <summary>Little-endian TIFF with one IFD entry: Orientation = <paramref name="orientation"/>, plus a GPS-looking marker string.</summary>
    private static byte[] Tiff(int orientation, string marker)
    {
        var text = Encoding.ASCII.GetBytes(marker + "\0");
        var ifd = new List<byte> { 0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00 };
        ifd.AddRange([0x02, 0x00]);                                                                  // two entries
        ifd.AddRange([0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, (byte)orientation, 0x00, 0x00, 0x00]); // Orientation (SHORT)
        ifd.AddRange([0x0F, 0x01, 0x02, 0x00, (byte)text.Length, 0x00, 0x00, 0x00, 0x26, 0x00, 0x00, 0x00]); // Make (ASCII) at offset 38
        ifd.AddRange([0x00, 0x00, 0x00, 0x00]);                                                      // no next IFD
        ifd.AddRange(text);
        return ifd.ToArray();
    }

    private static uint Crc32(byte[] bytes)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var b in bytes)
        {
            crc ^= b;
            for (var i = 0; i < 8; i++) crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320u : crc >> 1;
        }
        return ~crc;
    }

    private static byte[] Chunk(string type, byte[] data)
    {
        var typed = Encoding.ASCII.GetBytes(type).Concat(data).ToArray();
        static byte[] Be(uint v) => [(byte)(v >> 24), (byte)(v >> 16), (byte)(v >> 8), (byte)v];
        return Be((uint)data.Length).Concat(typed).Concat(Be(Crc32(typed))).ToArray();
    }

    /// <summary>A tiny PNG whose header declares a huge canvas (the "decompression bomb" shape).</summary>
    private static byte[] PngDeclaring(uint width, uint height)
    {
        static byte[] Be(uint v) => [(byte)(v >> 24), (byte)(v >> 16), (byte)(v >> 8), (byte)v];
        var ihdr = Be(width).Concat(Be(height)).Concat([(byte)8, (byte)2, (byte)0, (byte)0, (byte)0]).ToArray();
        return new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }
            .Concat(Chunk("IHDR", ihdr))
            .Concat(Chunk("IDAT", [0x78, 0x9C, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]))
            .Concat(Chunk("IEND", []))
            .ToArray();
    }

    private async Task<(bool Ok, string? Url, string? Error, byte[]? Stored)> Upload(byte[] bytes, string contentType)
    {
        using var stream = new MemoryStream(bytes);
        var result = await _sut.SaveImageAsync(stream, "x", contentType);
        if (!result.IsSuccess) return (false, null, result.Errors.FirstOrDefault(), null);

        var file = Path.Combine(_root, "products", Path.GetFileName(result.Value!));
        return (true, result.Value, null, await File.ReadAllBytesAsync(file));
    }

    private static SKImageInfo InfoOf(byte[] webp)
    {
        using var codec = SKCodec.Create(SKData.CreateCopy(webp));
        Assert.NotNull(codec);
        Assert.Equal(SKEncodedImageFormat.Webp, codec.EncodedFormat);
        return codec.Info;
    }

    private static bool Contains(byte[] haystack, string needle) =>
        Encoding.Latin1.GetString(haystack).Contains(needle, StringComparison.Ordinal);

    // ---- happy path ----

    [Theory]
    [InlineData(SKEncodedImageFormat.Jpeg, "image/jpeg")]
    [InlineData(SKEncodedImageFormat.Png, "image/png")]
    [InlineData(SKEncodedImageFormat.Webp, "image/webp")]
    public async Task ValidImages_BecomeWebp(SKEncodedImageFormat format, string contentType)
    {
        var (ok, url, error, stored) = await Upload(Encode(120, 80, format), contentType);

        Assert.True(ok, error);
        Assert.Matches(@"^/uploads/products/[0-9a-f]{32}\.webp$", url);
        var info = InfoOf(stored!);
        Assert.Equal((120, 80), (info.Width, info.Height));
    }

    [Fact]
    public async Task Gif_IsStoredAsAStillWebp()
    {
        // Skia cannot write GIF, so a minimal 1x1 GIF89a is spelled out
        byte[] gif = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF,
            0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3B];

        var (ok, url, error, stored) = await Upload(gif, "image/gif");

        Assert.True(ok, error);
        Assert.EndsWith(".webp", url);
        Assert.Equal((1, 1), (InfoOf(stored!).Width, InfoOf(stored!).Height));
    }

    [Fact]
    public async Task Transparency_IsKept()
    {
        var (ok, _, _, stored) = await Upload(Encode(40, 40, SKEncodedImageFormat.Png, alpha: true), "image/png");

        Assert.True(ok);
        using var bitmap = SKBitmap.Decode(stored!);
        Assert.True(bitmap.GetPixel(20, 20).Alpha < 255);
    }

    // ---- what must not survive ----

    [Fact]
    public async Task ExifMetadata_IsNotCarriedOver()
    {
        var jpeg = WithExifSegment(Encode(60, 40, SKEncodedImageFormat.Jpeg), Tiff(1, "GPS-LAT-55.7522N-LON-37.6156E"));
        Assert.True(Contains(jpeg, "GPS-LAT-55.7522N"), "fixture must carry the marker");

        var (ok, _, error, stored) = await Upload(jpeg, "image/jpeg");

        Assert.True(ok, error);
        Assert.False(Contains(stored!, "GPS-LAT"));
        Assert.False(Contains(stored!, "Exif"));
    }

    [Fact]
    public async Task AppendedScript_IsDropped()
    {
        var polyglot = Encode(60, 40, SKEncodedImageFormat.Jpeg)
            .Concat(Encoding.ASCII.GetBytes("<script>alert('x')</script><html>")).ToArray();

        var (ok, _, error, stored) = await Upload(polyglot, "image/jpeg");

        Assert.True(ok, error);
        Assert.False(Contains(stored!, "<script"));
        Assert.False(Contains(stored!, "<html"));
    }

    [Fact]
    public async Task ExifOrientation_IsApplied()
    {
        // a 60x40 picture marked "rotate 90 clockwise" is a 40x60 picture
        var jpeg = WithExifSegment(Encode(60, 40, SKEncodedImageFormat.Jpeg), Tiff(6, "cam"));

        var (ok, _, error, stored) = await Upload(jpeg, "image/jpeg");

        Assert.True(ok, error);
        var info = InfoOf(stored!);
        Assert.Equal((40, 60), (info.Width, info.Height));
    }

    // ---- size ----

    [Fact]
    public async Task LargeIsReduced_SmallIsKept()
    {
        var large = await Upload(Encode(3000, 1500, SKEncodedImageFormat.Jpeg), "image/jpeg");
        var small = await Upload(Encode(100, 50, SKEncodedImageFormat.Jpeg), "image/jpeg");

        Assert.True(large.Ok);
        Assert.Equal((2000, 1000), (InfoOf(large.Stored!).Width, InfoOf(large.Stored!).Height));
        Assert.Equal((100, 50), (InfoOf(small.Stored!).Width, InfoOf(small.Stored!).Height));
    }

    [Theory]
    [InlineData(20_000u, 20_000u)] // 400 MP: too many pixels, would be ~1.6 GB
    [InlineData(10_001u, 10u)]     // side over the limit
    public async Task PixelBomb_IsRejectedFromHeader(uint width, uint height)
    {
        var bomb = PngDeclaring(width, height);
        Assert.True(bomb.Length < 200);

        var before = GC.GetTotalAllocatedBytes(precise: true);
        var (ok, _, error, _) = await Upload(bomb, "image/png");
        var allocated = GC.GetTotalAllocatedBytes(precise: true) - before;

        Assert.False(ok);
        Assert.Equal(LocalImageStorageService.InvalidImageMessage, error);
        Assert.True(allocated < 20_000_000, $"allocated {allocated} bytes");
    }

    [Fact]
    public async Task FilesOverFiveMegabytes_AreRejected()
    {
        var big = Encode(100, 100, SKEncodedImageFormat.Jpeg).Concat(new byte[5 * 1024 * 1024]).ToArray();

        var (ok, _, error, _) = await Upload(big, "image/jpeg");

        Assert.False(ok);
        Assert.Contains("5", error);
    }

    // ---- not images ----

    [Fact]
    public async Task TruncatedFile_IsRejected()
    {
        var jpeg = Encode(400, 300, SKEncodedImageFormat.Jpeg);

        var (ok, _, error, _) = await Upload(jpeg.Take(jpeg.Length / 2).ToArray(), "image/jpeg");

        Assert.False(ok);
        Assert.Equal(LocalImageStorageService.InvalidImageMessage, error);
    }

    [Fact]
    public async Task Svg_IsRejected()
    {
        var svg = Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");

        Assert.False((await Upload(svg, "image/svg+xml")).Ok);
        Assert.False((await Upload(svg, "image/png")).Ok); // the same bytes under a renamed type
    }

    [Fact]
    public async Task FakeSignature_IsRejected()
    {
        var fake = new byte[] { 0x89, 0x50, 0x4E, 0x47 }.Concat(Encoding.ASCII.GetBytes("<html><body>not a png</body></html>")).ToArray();

        var (ok, _, error, _) = await Upload(fake, "image/png");

        Assert.False(ok);
        Assert.Equal(LocalImageStorageService.InvalidImageMessage, error);
        Assert.False(Directory.Exists(Path.Combine(_root, "products")) && Directory.EnumerateFiles(Path.Combine(_root, "products")).Any());
    }

    [Fact]
    public async Task ErrorMessage_IsTrilingual()
    {
        var (_, _, error, _) = await Upload([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0], "image/png");

        Assert.Contains("Не удалось", error);
        Assert.Contains("мүмкін болмады", error);
        Assert.Contains("could not be processed", error);
        Assert.DoesNotContain("Skia", error!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task TimeLimit_ReturnsNull_InsteadOfWaiting()
    {
        var large = Encode(4000, 4000, SKEncodedImageFormat.Jpeg);

        var result = await ImageReencoder.ReencodeAsync(large, CancellationToken.None, TimeSpan.Zero);

        Assert.Null(result);
    }
}
