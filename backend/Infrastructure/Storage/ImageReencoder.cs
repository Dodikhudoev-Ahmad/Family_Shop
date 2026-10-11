using SkiaSharp;

namespace Infrastructure.Storage;

/// <summary>
/// Decodes an uploaded image and encodes it again as WEBP, so that only the pixels survive: a "polyglot" file (picture
/// plus script/HTML in its tail), EXIF/GPS and other metadata, and any trailing bytes never reach the disk.
///
/// Order matters: the header is read first and the dimensions are checked BEFORE any pixel buffer is allocated (a tiny
/// file can declare a huge canvas), then the image is decoded, the EXIF orientation applied, the long side reduced to
/// <see cref="MaxOutputSide"/> (never enlarged) and the result encoded. Decoding runs on a worker under a time limit and
/// behind a semaphore, so a burst of uploads cannot take the service down. Failures carry no library detail.
/// </summary>
public static class ImageReencoder
{
    public const int MaxSourceSide = 10_000;
    public const long MaxSourcePixels = 40_000_000;
    public const int MaxOutputSide = 2_000;
    public const int WebpQuality = 85;
    public const int MaxParallelJobs = 2;

    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    private static readonly SemaphoreSlim Slots = new(MaxParallelJobs, MaxParallelJobs);

    public static async Task<byte[]?> ReencodeAsync(byte[] source, CancellationToken cancellationToken, TimeSpan? timeout = null)
    {
        var limit = timeout ?? Timeout;

        // Waiting for a free slot counts against the same limit: under load the upload is refused instead of queueing forever.
        if (!await Slots.WaitAsync(limit, cancellationToken))
        {
            return null;
        }

        // The slot is released by the worker itself, when the decode has really finished - not when the caller gave up
        // waiting - so a stuck decode keeps counting against MaxParallelJobs.
        var worker = Task.Run(() =>
        {
            try
            {
                return Process(source);
            }
            finally
            {
                Slots.Release();
            }
        }, CancellationToken.None);

        try
        {
            return await worker.WaitAsync(limit, cancellationToken);
        }
        catch (TimeoutException)
        {
            return null;
        }
    }

    private static byte[]? Process(byte[] source)
    {
        try
        {
            using var data = SKData.CreateCopy(source);
            using var codec = SKCodec.Create(data);
            if (codec is null)
            {
                return null;
            }

            if (codec.EncodedFormat is not (SKEncodedImageFormat.Jpeg or SKEncodedImageFormat.Png
                or SKEncodedImageFormat.Webp or SKEncodedImageFormat.Gif))
            {
                return null;
            }

            var info = codec.Info;
            if (info.Width <= 0 || info.Height <= 0
                || info.Width > MaxSourceSide || info.Height > MaxSourceSide
                || (long)info.Width * info.Height > MaxSourcePixels)
            {
                return null; // judged from the header: nothing has been allocated yet
            }

            // First frame only (an animated GIF becomes a still picture); a truncated or corrupt stream is not "success".
            using var bitmap = new SKBitmap(new SKImageInfo(info.Width, info.Height, SKColorType.Rgba8888, SKAlphaType.Unpremul));
            if (codec.GetPixels(bitmap.Info, bitmap.GetPixels()) != SKCodecResult.Success)
            {
                return null;
            }

            using var oriented = Orient(bitmap, codec.EncodedOrigin);
            using var image = SKImage.FromBitmap(oriented);
            using var encoded = image.Encode(SKEncodedImageFormat.Webp, WebpQuality);
            return encoded?.ToArray();
        }
        catch (Exception)
        {
            return null; // any decoder failure is just "not a usable image"; no detail leaves this class
        }
    }

    /// <summary>Applies the EXIF orientation and the size cap in one draw; metadata is not carried over.</summary>
    private static SKBitmap Orient(SKBitmap source, SKEncodedOrigin origin)
    {
        var w = source.Width;
        var h = source.Height;
        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var orientedWidth = swap ? h : w;
        var orientedHeight = swap ? w : h;

        var scale = Math.Min(1f, (float)MaxOutputSide / Math.Max(orientedWidth, orientedHeight));
        if (origin == SKEncodedOrigin.TopLeft && scale >= 1f)
        {
            return source.Copy();
        }

        var finalWidth = Math.Max(1, (int)Math.Round(orientedWidth * scale));
        var finalHeight = Math.Max(1, (int)Math.Round(orientedHeight * scale));

        // x' = m00*x + m01*y + tx ; y' = m10*x + m11*y + ty  (source -> oriented picture)
        var (m00, m01, tx, m10, m11, ty) = origin switch
        {
            SKEncodedOrigin.TopRight => (-1f, 0f, (float)w, 0f, 1f, 0f),
            SKEncodedOrigin.BottomRight => (-1f, 0f, (float)w, 0f, -1f, (float)h),
            SKEncodedOrigin.BottomLeft => (1f, 0f, 0f, 0f, -1f, (float)h),
            SKEncodedOrigin.LeftTop => (0f, 1f, 0f, 1f, 0f, 0f),
            SKEncodedOrigin.RightTop => (0f, -1f, (float)h, 1f, 0f, 0f),
            SKEncodedOrigin.RightBottom => (0f, -1f, (float)h, -1f, 0f, (float)w),
            SKEncodedOrigin.LeftBottom => (0f, 1f, 0f, -1f, 0f, (float)w),
            _ => (1f, 0f, 0f, 0f, 1f, 0f)
        };

        var result = new SKBitmap(new SKImageInfo(finalWidth, finalHeight, SKColorType.Rgba8888, SKAlphaType.Unpremul));
        using var canvas = new SKCanvas(result);
        canvas.Clear(SKColors.Transparent);
        canvas.SetMatrix(new SKMatrix(m00 * scale, m01 * scale, tx * scale, m10 * scale, m11 * scale, ty * scale, 0, 0, 1));
        using var sourceImage = SKImage.FromBitmap(source);
        canvas.DrawImage(sourceImage, 0, 0, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        return result;
    }
}
