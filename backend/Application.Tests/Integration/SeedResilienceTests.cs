using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Application.Interfaces;
using Domain.Entities;
using Infrastructure.Persistence;

namespace Application.Tests.Integration;

/// <summary>
/// The seeder runs on every start against a database the admin has been editing: it must not fall over on data that
/// the schema allows (a same-named product, demo reviewers whose reviews were deleted).
/// </summary>
public class SeedResilienceTests : IClassFixture<PostgresFixture>
{
    private const string ReviewerEmailPattern = "%@seed.familyshop.kz";

    private readonly PostgresFixture _db;

    public SeedResilienceTests(PostgresFixture db) => _db = db;

    private async Task SeedAsync()
    {
        var hasher = Substitute.For<IPasswordHasher>();
        hasher.Hash(Arg.Any<string>()).Returns("hash");
        await using var ctx = _db.CreateContext();
        await SeedData.SeedAsync(ctx, hasher, new ConfigurationBuilder().Build(), NullLogger.Instance, isDevelopment: true);
    }

    private async Task ResetAsync()
    {
        await using var ctx = _db.CreateContext();
        await ctx.Database.ExecuteSqlRawAsync(
            """TRUNCATE "Reviews", "OrderItems", "Orders", "Products", "Categories", "Users" RESTART IDENTITY CASCADE""");
    }

    private async Task<int> CountReviewersAsync()
    {
        await using var ctx = _db.CreateContext();
        return await ctx.Users.FromSqlRaw($"""SELECT * FROM "Users" WHERE "Email" LIKE '{ReviewerEmailPattern}'""").CountAsync();
    }

    [PostgresFact]
    public async Task DuplicateCategoryAndName_DoesNotBreakTheSeed_AndIsLeftAlone()
    {
        await ResetAsync();
        await SeedAsync();

        int originalId, productsBefore;
        await using (var ctx = _db.CreateContext())
        {
            var original = await ctx.Set<Product>().OrderBy(p => p.Id).FirstAsync();
            originalId = original.Id;
            ctx.Set<Product>().Add(new Product
            {
                Name = original.Name,
                Description = "Копия, созданная админом",
                Price = original.Price,
                Stock = 3,
                CategoryId = original.CategoryId,
                Gender = original.Gender,
                Images = ["https://example.com/copy.jpg"],
                ProductType = original.ProductType
            });
            await ctx.SaveChangesAsync();
            productsBefore = await ctx.Set<Product>().CountAsync();
        }

        await SeedAsync(); // used to throw ArgumentException (duplicate key in ToDictionary)

        await using var after = _db.CreateContext();
        var sameName = await after.Set<Product>().AsNoTracking()
            .Where(p => p.Name == after.Set<Product>().First(o => o.Id == originalId).Name).ToListAsync();
        Assert.Equal(2, sameName.Count); // the duplicate is neither removed nor merged
        Assert.Equal(productsBefore, await after.Set<Product>().CountAsync()); // and nothing extra was inserted
        Assert.Contains(sameName, p => p.Description == "Копия, созданная админом" && p.Stock == 3);
    }

    [PostgresFact]
    public async Task ReviewersExistButReviewsAreGone_SeedRecreatesReviewsWithoutDuplicatingAccounts()
    {
        await ResetAsync();
        await SeedAsync();
        var reviewers = await CountReviewersAsync();
        Assert.Equal(8, reviewers);

        await using (var ctx = _db.CreateContext())
        {
            await ctx.Database.ExecuteSqlRawAsync("""DELETE FROM "Reviews" """);
        }

        await SeedAsync(); // used to violate the unique index on Users.Email

        await using var after = _db.CreateContext();
        Assert.True(await after.Set<Review>().AnyAsync());
        Assert.Equal(reviewers, await CountReviewersAsync());
    }

    [PostgresFact]
    public async Task SeedingAgainAndAgain_ChangesNothing()
    {
        await ResetAsync();
        await SeedAsync();

        async Task<(int Products, int Categories, int Users, int Reviews)> CountsAsync()
        {
            await using var ctx = _db.CreateContext();
            return (await ctx.Set<Product>().CountAsync(), await ctx.Set<Category>().CountAsync(),
                await ctx.Users.CountAsync(), await ctx.Set<Review>().CountAsync());
        }

        var first = await CountsAsync();
        await SeedAsync();
        await SeedAsync();

        Assert.Equal(first, await CountsAsync());
    }
}
