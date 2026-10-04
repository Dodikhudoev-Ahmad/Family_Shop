using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;
using Api.Common;
using Infrastructure.Storage;

namespace Application.Tests.Storage;

/// <summary>The configurable uploads directory: where files are written, that they come back under the unchanged
/// /uploads/products/* URLs, and that a request cannot escape the directory.</summary>
public class UploadsServingTests : IDisposable
{
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D];

    private readonly string _temp = Path.Combine(Path.GetTempPath(), $"family-shop-uploads-{Guid.NewGuid():N}");
    private string Volume => Path.Combine(_temp, "volume", "uploads");   // stands for the mounted /data/uploads
    private string ContentRoot => Path.Combine(_temp, "app");

    public UploadsServingTests()
    {
        Directory.CreateDirectory(ContentRoot);
        // A secret that sits next to the uploads directory: the target of every traversal attempt below.
        Directory.CreateDirectory(Path.Combine(_temp, "volume"));
        File.WriteAllText(Path.Combine(_temp, "volume", "secret.txt"), "TOP-SECRET");
    }

    public void Dispose()
    {
        if (Directory.Exists(_temp)) Directory.Delete(_temp, recursive: true);
    }

    private static IConfiguration Config(string? path) =>
        new ConfigurationBuilder().AddInMemoryCollection(path is null ? [] : new Dictionary<string, string?> { ["Uploads:Path"] = path }).Build();

    // A real local server (Kestrel on a free loopback port), as in the other host tests: no obsolete WebHostBuilder/TestServer.
    private sealed class UploadsHost : IAsyncDisposable
    {
        private readonly WebApplication _app;

        public UploadsHost(WebApplication app) => _app = app;

        public HttpClient CreateClient() => new() { BaseAddress = new Uri(_app.Urls.First()) };

        public async ValueTask DisposeAsync()
        {
            await _app.StopAsync();
            await _app.DisposeAsync();
        }
    }

    private static async Task<UploadsHost> ServerAsync(string root)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();
        var app = builder.Build();
        app.UseUploads(root);
        await app.StartAsync();
        return new UploadsHost(app);
    }

    [Fact]
    public void WithoutConfiguration_TheDirectoryIsTheOldWwwrootUploads()
    {
        Assert.Equal(Path.Combine(ContentRoot, "wwwroot", "uploads"), UploadsLocation.Resolve(Config(null), ContentRoot));
        Assert.Equal(Path.Combine(ContentRoot, "wwwroot", "uploads"), UploadsLocation.Resolve(Config("  "), ContentRoot));
    }

    [Fact]
    public void AnAbsoluteConfiguredPathIsUsedAsIs_ARelativeOneIsRelativeToTheContentRoot()
    {
        Assert.Equal(Volume, UploadsLocation.Resolve(Config(Volume), ContentRoot));
        Assert.Equal(Path.Combine(ContentRoot, "data", "up"), UploadsLocation.Resolve(Config("data/up"), ContentRoot));
    }

    [Fact]
    public async Task AFileIsWrittenToTheConfiguredPath_AndServedUnderTheUnchangedUrl()
    {
        var sut = new LocalImageStorageService(Volume);
        using var content = new MemoryStream(Png);

        var saved = await sut.SaveImageAsync(content, "photo.png", "image/png");

        Assert.True(saved.IsSuccess);
        Assert.Matches(@"^/uploads/products/[0-9a-f]{32}\.png$", saved.Value); // same format as the URLs already in the DB
        var onDisk = Path.Combine(Volume, "products", Path.GetFileName(saved.Value!));
        Assert.Equal(Png, await File.ReadAllBytesAsync(onDisk));
        Assert.False(Directory.Exists(Path.Combine(ContentRoot, "wwwroot"))); // nothing leaked to the old location

        await using var server = await ServerAsync(Volume);
        var response = await server.CreateClient().GetAsync(saved.Value);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(Png, await response.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task TheDirectoryIsCreatedAtStartup_AndAnUnknownFileIsA404()
    {
        Assert.False(Directory.Exists(Volume));

        await using var server = await ServerAsync(Volume);

        Assert.True(Directory.Exists(Path.Combine(Volume, "products")));
        Assert.Equal(HttpStatusCode.NotFound, (await server.CreateClient().GetAsync("/uploads/products/missing.png")).StatusCode);
    }

    [Theory]
    [InlineData("/uploads/../secret.txt")]
    [InlineData("/uploads/products/../../secret.txt")]
    [InlineData("/uploads/products/..%2f..%2fsecret.txt")]
    [InlineData("/uploads/products/%2e%2e/%2e%2e/secret.txt")]
    [InlineData("/uploads/products/..%5c..%5csecret.txt")]
    [InlineData("/uploads/products/%252e%252e/%252e%252e/secret.txt")]
    public async Task PathTraversalCannotReachFilesOutsideTheUploadsDirectory(string url)
    {
        await using var server = await ServerAsync(Volume);

        var response = await server.CreateClient().GetAsync(url);

        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("TOP-SECRET", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("image/svg+xml")]
    [InlineData("application/x-msdownload")]
    [InlineData("text/html")]
    [InlineData("")]
    public async Task SvgAndExecutablesAreStillRefused_AndNothingIsWritten(string contentType)
    {
        var sut = new LocalImageStorageService(Volume);
        using var content = new MemoryStream("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>"u8.ToArray());

        var result = await sut.SaveImageAsync(content, "x.svg", contentType);

        Assert.False(result.IsSuccess);
        Assert.False(Directory.Exists(Path.Combine(Volume, "products")) && Directory.GetFiles(Path.Combine(Volume, "products")).Length > 0);
    }

    [Fact]
    public async Task ATraversalInTheClientFileName_IsIgnored_TheStoredNameIsRandom()
    {
        var sut = new LocalImageStorageService(Volume);
        using var content = new MemoryStream(Png);

        var result = await sut.SaveImageAsync(content, "../../../etc/passwd.png", "image/png");

        Assert.True(result.IsSuccess);
        Assert.DoesNotContain("..", result.Value);
        Assert.DoesNotContain("passwd", result.Value);
        Assert.Single(Directory.GetFiles(Volume, "*", SearchOption.AllDirectories));
    }
}
