using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Application.DTOs;
using Application.Interfaces;
using Application.Services;
using Domain.Entities;
using Domain.ValueObjects;
using Infrastructure.Persistence;

namespace Application.Tests.Integration;

/// <summary>Shoe segments on a real PostgreSQL: the migration script, the catalog filters and the seeder.</summary>
public class ShoeSegmentsTests : IClassFixture<PostgresFixture>
{
    private readonly PostgresFixture _db;

    public ShoeSegmentsTests(PostgresFixture db) => _db = db;

    private async Task<int> NewCategoryAsync(bool hasSizes = true)
    {
        await using var ctx = _db.CreateContext();
        var category = new Category { Name = "T", Slug = $"t-{Guid.NewGuid():N}", HasSizes = hasSizes };
        ctx.Add(category);
        await ctx.SaveChangesAsync();
        return category.Id;
    }

    private async Task<int> AddAsync(int categoryId, string name, string? type, Gender gender,
        ShoeSegment? segment = null, ChildGender? child = null, List<string>? sizes = null)
    {
        await using var ctx = _db.CreateContext();
        var product = new Product
        {
            Name = name, Price = new Money(100), Stock = 5, CategoryId = categoryId, Gender = gender,
            ProductType = type, ShoeSegment = segment, ChildGender = child, AvailableSizes = sizes
        };
        ctx.Add(product);
        await ctx.SaveChangesAsync();
        return product.Id;
    }

    private async Task<Product> LoadAsync(int id)
    {
        await using var ctx = _db.CreateContext();
        return await ctx.Products.AsNoTracking().SingleAsync(p => p.Id == id);
    }

    private async Task RunScriptAsync()
    {
        await using var ctx = _db.CreateContext();
        await ctx.Database.ExecuteSqlRawAsync(ShoeSegmentsScript.Sql);
    }

    // ---------- the migration script ----------

    [PostgresFact]
    public async Task Script_FillsSegmentFromGender_AndBoyGirlOnlyFromAnUnambiguousName_AndARepeatChangesNothing()
    {
        var sized = await NewCategoryAsync();
        var sizeless = await NewCategoryAsync(hasSizes: false);

        var men = await AddAsync(sized, "Кроссовки мужские", "Кроссовки", Gender.Male);
        var women = await AddAsync(sized, "Ботинки женские", "Ботинки", Gender.Female);
        var girl = await AddAsync(sized, "Ботинки для девочки", "Ботинки", Gender.Kids);
        var boy = await AddAsync(sized, "Кроссовки для мальчика", "Кроссовки", Gender.Kids);
        var both = await AddAsync(sized, "Ботинки для девочки и мальчика", "Ботинки", Gender.Kids);
        var neutral = await AddAsync(sized, "Ботинки детские", "Ботинки", Gender.Kids);
        var clothes = await AddAsync(sized, "Худи для мальчика", "Худи", Gender.Kids);
        var sport = await AddAsync(sizeless, "Кроссовки беговые", "Кроссовки", Gender.Male);
        var chosen = await AddAsync(sized, "Кроссовки для девочки", "Кроссовки", Gender.Kids, ShoeSegment.Teen, ChildGender.Boy);

        await RunScriptAsync();
        await RunScriptAsync();
        await RunScriptAsync();

        Assert.Equal((ShoeSegment.Men, null), Pair(await LoadAsync(men)));
        Assert.Equal((ShoeSegment.Women, null), Pair(await LoadAsync(women)));
        Assert.Equal((ShoeSegment.Kids, ChildGender.Girl), Pair(await LoadAsync(girl)));
        Assert.Equal((ShoeSegment.Kids, ChildGender.Boy), Pair(await LoadAsync(boy)));
        Assert.Equal((ShoeSegment.Kids, null), Pair(await LoadAsync(both)));
        Assert.Equal((ShoeSegment.Kids, null), Pair(await LoadAsync(neutral)));
        Assert.Equal((null, null), Pair(await LoadAsync(clothes)));
        Assert.Equal((null, null), Pair(await LoadAsync(sport)));
        Assert.Equal((ShoeSegment.Teen, ChildGender.Boy), Pair(await LoadAsync(chosen))); // an explicit choice is kept
    }

    private static (ShoeSegment?, ChildGender?) Pair(Product p) => (p.ShoeSegment, p.ChildGender);

    // ---------- catalog filters ----------

    private async Task<IReadOnlyList<int>> FilterAsync(int categoryId, ProductFilterDto filter)
    {
        await using var ctx = _db.CreateContext();
        var page = await new ProductService(new UnitOfWork(ctx)).GetProductsAsync(filter with { CategoryId = categoryId, PageSize = 100 });
        return page.Items.Select(p => p.Id).Order().ToList();
    }

    private static ProductFilterDto NoFilter() => new(null, null, null, null);

    [PostgresFact]
    public async Task Filters_BySegment_ChildGender_AndSize()
    {
        var category = await NewCategoryAsync();
        var men = await AddAsync(category, "М", "Кроссовки", Gender.Male, ShoeSegment.Men);
        var kidsBoy = await AddAsync(category, "Д1", "Кроссовки", Gender.Kids, ShoeSegment.Kids, ChildGender.Boy);
        var teenGirl = await AddAsync(category, "П1", "Кроссовки", Gender.Kids, ShoeSegment.Teen, ChildGender.Girl);
        var teenBoyOnly37 = await AddAsync(category, "П2", "Кроссовки", Gender.Kids, ShoeSegment.Teen, ChildGender.Boy, ["37"]);
        var hoodie = await AddAsync(category, "Х", "Худи", Gender.Male);
        var bag = await AddAsync(category, "С", "Сумки", Gender.Female);

        Assert.Equal([kidsBoy], await FilterAsync(category, NoFilter() with { ShoeSegment = ShoeSegment.Kids }));
        Assert.Equal([teenGirl, teenBoyOnly37], await FilterAsync(category, NoFilter() with { ShoeSegment = ShoeSegment.Teen }));
        Assert.Equal([kidsBoy, teenBoyOnly37], await FilterAsync(category, NoFilter() with { ChildGender = ChildGender.Boy }));
        Assert.Equal([teenGirl], await FilterAsync(category, NoFilter() with { ShoeSegment = ShoeSegment.Teen, ChildGender = ChildGender.Girl }));

        // 37 sits in both the kids and the teen grid, in no adult one.
        Assert.Equal([kidsBoy, teenGirl, teenBoyOnly37], await FilterAsync(category, NoFilter() with { Size = "37" }));
        Assert.Equal([teenGirl], await FilterAsync(category, NoFilter() with { Size = "38" }));
        Assert.Equal([men], await FilterAsync(category, NoFilter() with { Size = "45" }));
        Assert.Equal([hoodie], await FilterAsync(category, NoFilter() with { Size = "XL" }));
        Assert.Empty(await FilterAsync(category, NoFilter() with { Size = "46" }));
        Assert.DoesNotContain(bag, await FilterAsync(category, NoFilter() with { Size = "XL" }));
    }

    // ---------- the seeder ----------

    private async Task SeedAsync()
    {
        var hasher = Substitute.For<IPasswordHasher>();
        hasher.Hash(Arg.Any<string>()).Returns("hash");
        await using var ctx = _db.CreateContext();
        await SeedData.SeedAsync(ctx, hasher, new ConfigurationBuilder().Build(), NullLogger.Instance, isDevelopment: true);
    }

    private static async Task<List<(int Id, ShoeSegment? Segment, ChildGender? Child)>> SnapshotAsync(AppDbContext ctx) =>
        (await ctx.Products.OrderBy(p => p.Id).Select(p => new { p.Id, p.ShoeSegment, p.ChildGender }).ToListAsync())
        .Select(p => (p.Id, p.ShoeSegment, p.ChildGender)).ToList();

    [PostgresFact]
    public async Task Seeder_GivesEveryShoeASegment_ChildrenABoyOrGirl_AndARepeatChangesNothing()
    {
        await SeedAsync();

        int editedId;
        List<(int Id, ShoeSegment? Segment, ChildGender? Child)> first;
        await using (var ctx = _db.CreateContext())
        {
            var shoes = await ctx.Products.Include(p => p.Category)
                .Where(p => (p.ProductType == "Кроссовки" || p.ProductType == "Ботинки") && p.Category!.HasSizes).ToListAsync();
            Assert.All(shoes, p => Assert.NotNull(p.ShoeSegment));
            Assert.All(shoes.Where(p => p.ShoeSegment == ShoeSegment.Teen), p => Assert.NotNull(p.ChildGender));
            Assert.Contains(shoes, p => p.ShoeSegment == ShoeSegment.Teen && p.ChildGender == ChildGender.Girl);
            Assert.Contains(shoes, p => p.ShoeSegment == ShoeSegment.Teen && p.ChildGender == ChildGender.Boy);

            // The admin changes a card: the seeder must leave it alone.
            var edited = shoes.First(p => p.ShoeSegment == ShoeSegment.Men);
            edited.ShoeSegment = ShoeSegment.Women;
            editedId = edited.Id;
            await ctx.SaveChangesAsync();
            first = await SnapshotAsync(ctx);
        }

        await SeedAsync();
        await SeedAsync();

        await using var after = _db.CreateContext();
        var again = await SnapshotAsync(after);
        Assert.Equal(first, again);
        Assert.Equal(ShoeSegment.Women, again.Single(p => p.Id == editedId).Segment);
    }
}
