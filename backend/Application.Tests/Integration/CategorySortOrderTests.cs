using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Application.Interfaces;
using Application.Services;
using Application.DTOs;
using Domain.Entities;
using Domain.Interfaces;
using Infrastructure.Persistence;
using Infrastructure.Persistence.Migrations;

namespace Application.Tests.Integration;

/// <summary>Category display order: migration <c>AddCategorySortOrder</c> and the seeder on a real PostgreSQL (run twice,
/// manual values kept), and the service that serves the list.</summary>
public class CategorySortOrderTests : IClassFixture<PostgresFixture>
{
    private static readonly string[] ExpectedOrder =
        ["women", "men", "kids", "bytovaya-tehnika", "dom-i-byt", "posuda", "sport", "aksessuary"];

    private readonly PostgresFixture _db;

    public CategorySortOrderTests(PostgresFixture db) => _db = db;

    private async Task SeedAsync()
    {
        var hasher = Substitute.For<IPasswordHasher>();
        hasher.Hash(Arg.Any<string>()).Returns("hash");
        await using var ctx = _db.CreateContext();
        await SeedData.SeedAsync(ctx, hasher, new ConfigurationBuilder().Build(), NullLogger.Instance, isDevelopment: true);
    }

    private async Task<Dictionary<string, int>> OrderBySlugAsync()
    {
        await using var ctx = _db.CreateContext();
        return await ctx.Categories.AsNoTracking().ToDictionaryAsync(c => c.Slug, c => c.SortOrder);
    }

    private async Task ExecAsync(string sql)
    {
        await using var ctx = _db.CreateContext();
        await ctx.Database.ExecuteSqlRawAsync(sql);
    }

    [PostgresFact]
    public async Task Seeder_PlacesEveryKnownCategory_InTheMenuOrder()
    {
        await SeedAsync();

        var order = await OrderBySlugAsync();

        Assert.Equal(ExpectedOrder, order.OrderBy(kv => kv.Value).Select(kv => kv.Key).ToArray());
        Assert.Equal(50, order["dom-i-byt"]);
        Assert.True(order["dom-i-byt"] > order["bytovaya-tehnika"]);
        Assert.True(order["dom-i-byt"] < order["posuda"]);
    }

    [PostgresFact]
    public async Task SeederTwice_ChangesNothing_AndKeepsAManualValue()
    {
        await SeedAsync();
        await ExecAsync("""UPDATE "Categories" SET "SortOrder" = 5 WHERE "Slug" = 'sport';""");
        var before = await OrderBySlugAsync();

        await SeedAsync();
        await SeedAsync();

        Assert.Equal(before, await OrderBySlugAsync());
        Assert.Equal(5, (await OrderBySlugAsync())["sport"]);
    }

    [PostgresFact]
    public async Task SeederFillsOnlyCategoriesStillAtZero()
    {
        await SeedAsync();
        await ExecAsync("""UPDATE "Categories" SET "SortOrder" = 0 WHERE "Slug" = 'posuda';""");

        await SeedAsync();

        Assert.Equal(60, (await OrderBySlugAsync())["posuda"]);
    }

    [PostgresFact]
    public async Task MigrationSql_IsIdempotent_KeepsManualValues_AndTouchesNoOtherRow()
    {
        await SeedAsync();
        await ExecAsync("""UPDATE "Categories" SET "SortOrder" = 0;""");
        await ExecAsync("""UPDATE "Categories" SET "SortOrder" = 3 WHERE "Slug" = 'women';"""); // placed by hand
        await ExecAsync("""INSERT INTO "Categories" ("Name","Slug","HasSizes","SortOrder") VALUES ('Custom','custom-x',FALSE,0);""");
        await using var before = _db.CreateContext();
        var count = await before.Categories.CountAsync();

        for (var run = 0; run < 2; run++)
        {
            await ExecAsync(CategorySortOrderSql.AddColumn); // the column exists already: must not fail
            await ExecAsync(CategorySortOrderSql.SetOrder);
        }

        var order = await OrderBySlugAsync();
        Assert.Equal(3, order["women"]);        // manual value kept
        Assert.Equal(20, order["men"]);
        Assert.Equal(80, order["aksessuary"]);
        Assert.Equal(0, order["custom-x"]);     // unknown slug untouched
        Assert.Equal(count, order.Count);       // nothing created or removed
    }

    // ---- the service (no database) ----

    private static (CategoryService Service, ICategoryRepository Repository) Service(params Category[] categories)
    {
        var repository = Substitute.For<ICategoryRepository>();
        repository.GetAllAsync(Arg.Any<CancellationToken>()).Returns(categories.ToList());
        var unitOfWork = Substitute.For<IUnitOfWork>();
        unitOfWork.Categories.Returns(repository);
        return (new CategoryService(unitOfWork), repository);
    }

    [Fact]
    public async Task List_IsOrderedBySortOrder_ThenById_AndCarriesTheValue()
    {
        var (service, _) = Service(
            new Category { Id = 3, Name = "C", Slug = "c", SortOrder = 20 },
            new Category { Id = 9, Name = "Z", Slug = "z", SortOrder = 10 },
            new Category { Id = 2, Name = "B", Slug = "b", SortOrder = 20 },
            new Category { Id = 1, Name = "A", Slug = "a", SortOrder = 0 });

        var list = await service.GetCategoriesAsync();

        Assert.Equal(["a", "z", "b", "c"], list.Select(c => c.Slug).ToArray());
        Assert.Equal([0, 10, 20, 20], list.Select(c => c.SortOrder).ToArray());
    }

    [Fact]
    public async Task NewCategory_GoesToTheEnd()
    {
        var (service, repository) = Service(
            new Category { Id = 1, Name = "A", Slug = "a", SortOrder = 10 },
            new Category { Id = 2, Name = "B", Slug = "b", SortOrder = 80 });
        repository.AnyBySlugAsync(Arg.Any<string>(), Arg.Any<int?>(), Arg.Any<CancellationToken>()).Returns(false);

        var result = await service.CreateCategoryAsync(new CategoryUpsertDto("New", "new-one", null, true));

        Assert.True(result.IsSuccess);
        Assert.Equal(90, result.Value!.SortOrder);
    }
}
