using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Application.Interfaces;
using Domain.Entities;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Infrastructure.Persistence.Migrations;

namespace Application.Tests.Integration;

/// <summary>Migration <c>AddHomeGoodsCategory</c> and the seeder on a real PostgreSQL: the shelf moves once, nothing is
/// duplicated, nothing else is touched.</summary>
public class HomeGoodsCategoryMigrationTests : IClassFixture<PostgresFixture>
{
    private const string ShelfName = "Этажерка для обуви";

    private readonly PostgresFixture _db;

    public HomeGoodsCategoryMigrationTests(PostgresFixture db) => _db = db;

    private async Task SeedAsync()
    {
        var hasher = Substitute.For<IPasswordHasher>();
        hasher.Hash(Arg.Any<string>()).Returns("hash");
        await using var ctx = _db.CreateContext();
        await SeedData.SeedAsync(ctx, hasher, new ConfigurationBuilder().Build(), NullLogger.Instance, isDevelopment: true);
    }

    private async Task RunMigrationSqlAsync()
    {
        await using var ctx = _db.CreateContext();
        await ctx.Database.ExecuteSqlRawAsync(HomeGoodsCategorySql.InsertCategory);
        await ctx.Database.ExecuteSqlRawAsync(HomeGoodsCategorySql.MoveShelf);
    }

    private async Task<int> AddShelfInAppliancesAsync()
    {
        await using var ctx = _db.CreateContext();
        var appliances = await ctx.Categories.SingleAsync(c => c.Slug == "bytovaya-tehnika");
        var shelf = new Product { Name = ShelfName, Price = new Money(7000), Stock = 5, CategoryId = appliances.Id, ProductType = "Чайники" };
        ctx.Products.Add(shelf);
        await ctx.SaveChangesAsync();
        return shelf.Id;
    }

    [PostgresFact]
    public async Task Migration_CreatesTheCategoryOnce_WithoutSizes_AndTheSeederDoesNotDuplicateIt()
    {
        await SeedAsync();
        await SeedAsync();
        await RunMigrationSqlAsync();
        await RunMigrationSqlAsync();

        await using var ctx = _db.CreateContext();
        var home = await ctx.Categories.AsNoTracking().Where(c => c.Slug == "dom-i-byt").ToListAsync();
        var category = Assert.Single(home);
        Assert.Equal("Дом и быт", category.Name);
        Assert.False(category.HasSizes);
        Assert.Null(category.ParentCategoryId);
    }

    [PostgresFact]
    public async Task Migration_MovesTheShelfInPlace_SetsTheType_AndALaterRunChangesNothing()
    {
        await SeedAsync();
        var shelfId = await AddShelfInAppliancesAsync();
        int productsBefore, appliancesBefore;
        await using (var before = _db.CreateContext())
        {
            productsBefore = await before.Products.CountAsync();
            appliancesBefore = await before.Products.CountAsync(p => p.Category!.Slug == "bytovaya-tehnika");
        }

        await RunMigrationSqlAsync();

        await using (var ctx = _db.CreateContext())
        {
            var shelf = await ctx.Products.AsNoTracking().Include(p => p.Category).SingleAsync(p => p.Id == shelfId);
            Assert.Equal("dom-i-byt", shelf.Category!.Slug);
            Assert.Equal("Этажерки", shelf.ProductType);
            Assert.Equal(productsBefore, await ctx.Products.CountAsync());
            Assert.Equal(appliancesBefore - 1, await ctx.Products.CountAsync(p => p.Category!.Slug == "bytovaya-tehnika"));
        }

        // The admin fixes the type afterwards; a repeat run (next deploy) must not undo it, and the shelf stays put.
        await using (var ctx = _db.CreateContext())
        {
            await ctx.Products.Where(p => p.Id == shelfId).ExecuteUpdateAsync(s => s.SetProperty(p => p.ProductType, "Органайзеры"));
        }

        await RunMigrationSqlAsync();
        await SeedAsync();

        await using var after = _db.CreateContext();
        var again = await after.Products.AsNoTracking().Include(p => p.Category).SingleAsync(p => p.Id == shelfId);
        Assert.Equal("dom-i-byt", again.Category!.Slug);
        Assert.Equal("Органайзеры", again.ProductType);
    }

    [PostgresFact]
    public async Task Migration_WithoutTheShelf_ChangesNoProduct()
    {
        await SeedAsync();
        await using var ctx = _db.CreateContext();
        var snapshot = await ctx.Products.AsNoTracking().OrderBy(p => p.Id).Select(p => new { p.Id, p.CategoryId, p.ProductType }).ToListAsync();

        await RunMigrationSqlAsync();

        var after = await ctx.Products.AsNoTracking().OrderBy(p => p.Id).Select(p => new { p.Id, p.CategoryId, p.ProductType }).ToListAsync();
        Assert.Equal(snapshot, after);
    }

    [PostgresFact]
    public async Task ASameNamedProductInAnotherCategory_IsNotMoved()
    {
        await SeedAsync();
        int id;
        await using (var ctx = _db.CreateContext())
        {
            var sport = await ctx.Categories.SingleAsync(c => c.Slug == "sport");
            var other = new Product { Name = ShelfName, Price = new Money(1000), Stock = 1, CategoryId = sport.Id };
            ctx.Products.Add(other);
            await ctx.SaveChangesAsync();
            id = other.Id;
        }

        await RunMigrationSqlAsync();

        await using var after = _db.CreateContext();
        var product = await after.Products.AsNoTracking().Include(p => p.Category).SingleAsync(p => p.Id == id);
        Assert.Equal("sport", product.Category!.Slug);
    }
}
