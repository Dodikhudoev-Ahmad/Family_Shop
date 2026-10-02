using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Application.Interfaces;
using Domain.Entities;
using Infrastructure.Persistence;

namespace Application.Tests.Integration;

/// <summary>The idempotent seeder against a real database: it must leave what the admin edited alone.</summary>
public class SeedSizesTests : IClassFixture<PostgresFixture>
{
    private readonly PostgresFixture _db;

    public SeedSizesTests(PostgresFixture db) => _db = db;

    private async Task SeedAsync()
    {
        var hasher = Substitute.For<IPasswordHasher>();
        hasher.Hash(Arg.Any<string>()).Returns("hash");
        await using var ctx = _db.CreateContext();
        await SeedData.SeedAsync(ctx, hasher, new ConfigurationBuilder().Build(), NullLogger.Instance, isDevelopment: true);
    }

    [PostgresFact]
    public async Task ReSeeding_DoesNotOverwriteSizesEditedInTheAdmin_NorChangeNewProductsFromNull()
    {
        await SeedAsync();

        int editedId, untouchedId;
        await using (var ctx = _db.CreateContext())
        {
            // Every seeded product starts as "all sizes of the grid".
            Assert.False(await ctx.Set<Product>().AnyAsync(p => p.AvailableSizes != null));

            var shoes = await ctx.Set<Product>().FirstAsync(p => p.ProductType == "Кроссовки");
            var hoodie = await ctx.Set<Product>().FirstAsync(p => p.ProductType == "Худи");
            shoes.AvailableSizes = ["38", "39"];
            hoodie.AvailableSizes = ["M", "L"];
            editedId = shoes.Id;
            untouchedId = hoodie.Id;
            await ctx.SaveChangesAsync();
        }

        await SeedAsync();
        await SeedAsync(); // and once more: the seeder runs on every deploy

        await using var after = _db.CreateContext();
        Assert.Equal(["38", "39"], (await after.Set<Product>().AsNoTracking().SingleAsync(p => p.Id == editedId)).AvailableSizes);
        Assert.Equal(["M", "L"], (await after.Set<Product>().AsNoTracking().SingleAsync(p => p.Id == untouchedId)).AvailableSizes);
        Assert.Equal(2, await after.Set<Product>().CountAsync(p => p.AvailableSizes != null)); // nothing else got sizes
    }

    [PostgresFact]
    public async Task EverySeededProductType_IsOneTheAdminFormOffers()
    {
        await SeedAsync();

        await using var ctx = _db.CreateContext();
        var types = await ctx.Set<Product>().Select(p => p.ProductType).Distinct().ToListAsync();

        Assert.All(types.Where(t => t is not null), t => Assert.Contains(t!, ProductTypeClassifier.KnownTypes));
    }
}
