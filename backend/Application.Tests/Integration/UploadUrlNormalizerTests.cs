using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Api.Common;
using Api.Controllers;
using Application.Common;
using Application.Interfaces;
using Domain.Entities;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Infrastructure.Storage;

namespace Application.Tests.Integration;

/// <summary>Uploaded-image URLs and the move to the shop's own domain.</summary>
public class UploadUrlNormalizerTests : IClassFixture<PostgresFixture>
{
    private const string NewBase = "https://api.familyshop10.kz";
    private const string OldBase = "https://old-api.example.net";
    private readonly PostgresFixture _db;

    public UploadUrlNormalizerTests(PostgresFixture db) => _db = db;

    private static string Hex() => Guid.NewGuid().ToString("N");

    private async Task<(int ProductId, int OrderId)> SeedProductAsync(List<string> images)
    {
        await using var ctx = _db.CreateContext();
        var user = new User { Email = new Email($"u{Guid.NewGuid():N}@example.com"), Name = "T", PasswordHash = "x" };
        var category = new Category { Name = "T", Slug = $"t-{Guid.NewGuid():N}", HasSizes = false };
        ctx.AddRange(user, category);
        await ctx.SaveChangesAsync();
        var product = new Product { Name = "P", Price = new Money(1), Stock = 1, CategoryId = category.Id, Images = images };
        ctx.Add(product);
        await ctx.SaveChangesAsync();
        // A real order and review point at the product: the rewrite must keep the row (same Id), not recreate it.
        var order = new Order { UserId = user.Id, Status = OrderStatus.Delivered, TotalPrice = new Money(1), ContactName = "T", ContactPhone = "+7" };
        order.Items.Add(new OrderItem { ProductId = product.Id, Quantity = 1, Price = new Money(1) });
        ctx.Add(order);
        ctx.Add(new Review { ProductId = product.Id, UserId = user.Id, Rating = 5, Comment = "ok" });
        await ctx.SaveChangesAsync();
        return (product.Id, order.Id);
    }

    private async Task<List<string>> ImagesAsync(int productId)
    {
        await using var ctx = _db.CreateContext();
        return await ctx.Set<Product>().AsNoTracking().Where(p => p.Id == productId).Select(p => p.Images).SingleAsync();
    }

    private Task<int> RunAsync()
    {
        var ctx = _db.CreateContext();
        return UploadUrlNormalizer.NormalizeAsync(ctx, NewBase, NullLogger.Instance);
    }

    [PostgresFact]
    public async Task OldHostUploadUrls_MoveToTheConfiguredBase_OthersAreLeftAlone_InTheSameOrder()
    {
        var a = Hex();
        var b = Hex();
        var c = Hex();
        var images = new List<string>
        {
            $"{OldBase}/uploads/products/{a}.jpg",                                   // saved before the move
            "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=600",    // another site: not ours
            $"/uploads/products/{b}.png",                                            // a relative path
            $"{NewBase}/uploads/products/{c}.webp",                                  // already on the new base
            "https://cdn.example.kz/uploads/products/holiday.jpg",                   // looks similar, is not our file name
        };
        var (productId, orderId) = await SeedProductAsync(images);

        await RunAsync();

        Assert.Equal(
            [
                $"{NewBase}/uploads/products/{a}.jpg",
                "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=600",
                $"{NewBase}/uploads/products/{b}.png",
                $"{NewBase}/uploads/products/{c}.webp",
                "https://cdn.example.kz/uploads/products/holiday.jpg",
            ],
            await ImagesAsync(productId));

        // The product row was updated in place: same Id, and its order line and review still reference it.
        await using var ctx = _db.CreateContext();
        Assert.Equal(productId, await ctx.Set<OrderItem>().Where(i => i.OrderId == orderId).Select(i => i.ProductId).SingleAsync());
        Assert.Equal(1, await ctx.Set<Review>().CountAsync(r => r.ProductId == productId));
    }

    [PostgresFact]
    public async Task RunningItAgain_ChangesNothing()
    {
        var (productId, _) = await SeedProductAsync([$"{OldBase}/uploads/products/{Hex()}.gif"]);
        await RunAsync();
        var afterFirst = await ImagesAsync(productId);

        await RunAsync();

        Assert.Equal(afterFirst, await ImagesAsync(productId));
        Assert.StartsWith(NewBase, afterFirst[0]);
    }

    [PostgresFact]
    public async Task ProductsWithoutOurUploads_AreNotTouched()
    {
        var (productId, _) = await SeedProductAsync(["https://images.pexels.com/photos/1/a.jpeg", "https://images.unsplash.com/photo-2"]);

        await RunAsync();

        Assert.Equal(["https://images.pexels.com/photos/1/a.jpeg", "https://images.unsplash.com/photo-2"], await ImagesAsync(productId));
    }

    [PostgresFact]
    public async Task BannerImagesMoveToo()
    {
        var file = Hex();
        int bannerId;
        await using (var ctx = _db.CreateContext())
        {
            var banner = new PromoBanner { Title = "B", ImageUrl = $"{OldBase}/uploads/products/{file}.jpg", IsActive = true };
            ctx.Add(banner);
            await ctx.SaveChangesAsync();
            bannerId = banner.Id;
        }

        await RunAsync();

        await using var check = _db.CreateContext();
        Assert.Equal($"{NewBase}/uploads/products/{file}.jpg", await check.Set<PromoBanner>().Where(b => b.Id == bannerId).Select(b => b.ImageUrl).SingleAsync());
    }

    // ---- configuration and the upload endpoint ----

    private static IConfiguration Config(string? value) =>
        new ConfigurationBuilder().AddInMemoryCollection(value is null ? [] : [new KeyValuePair<string, string?>(UploadsLocation.PublicBaseUrlKey, value)]).Build();

    [Theory]
    [InlineData(null, null)]
    [InlineData("  ", null)]
    [InlineData("https://api.familyshop10.kz", "https://api.familyshop10.kz")]
    [InlineData("https://API.familyshop10.kz/", "https://api.familyshop10.kz")]
    public void ThePublicBaseUrlIsAPlainOrigin_OrAbsent(string? configured, string? expected) =>
        Assert.Equal(expected, UploadsLocation.ResolvePublicBaseUrl(Config(configured)));

    [Theory]
    [InlineData("api.familyshop10.kz")]
    [InlineData("https://api.familyshop10.kz/uploads")]
    [InlineData("ftp://api.familyshop10.kz")]
    public void AMalformedPublicBaseUrlStopsTheStartUp(string configured) =>
        Assert.Throws<InvalidOperationException>(() => UploadsLocation.ResolvePublicBaseUrl(Config(configured)));

    private static IFormFile Png()
    {
        var bytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D };
        return new FormFile(new MemoryStream(bytes), 0, bytes.Length, "file", "a.png") { Headers = new HeaderDictionary(), ContentType = "image/png" };
    }

    private static async Task<string> UploadedUrlAsync(IConfiguration configuration, string requestHost)
    {
        var storage = Substitute.For<IImageStorageService>();
        storage.SaveImageAsync(Arg.Any<Stream>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(Result<string>.Success("/uploads/products/abc.png"));
        var controller = new AdminProductsController(Substitute.For<IProductService>(), storage, configuration);
        var http = new DefaultHttpContext();
        http.Request.Scheme = "https";
        http.Request.Host = new HostString(requestHost);
        controller.ControllerContext = new ControllerContext { HttpContext = http };

        var result = await controller.UploadImage(Png(), CancellationToken.None);

        return ((ApiResponse<string>)((OkObjectResult)result.Result!).Value!).Data!;
    }

    [Fact]
    public async Task AFreshUpload_GetsTheConfiguredPublicBase_NotTheHostOfTheRequest()
    {
        Assert.Equal($"{NewBase}/uploads/products/abc.png", await UploadedUrlAsync(Config(NewBase), "old-api.example.net"));
    }

    [Fact]
    public async Task WithoutAConfiguredBase_TheRequestsOwnHostIsUsed_AsBefore()
    {
        Assert.Equal("https://old-api.example.net/uploads/products/abc.png", await UploadedUrlAsync(Config(null), "old-api.example.net"));
    }
}
