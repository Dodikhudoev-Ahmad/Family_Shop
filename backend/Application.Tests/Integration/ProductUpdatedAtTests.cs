using Microsoft.EntityFrameworkCore;
using Xunit;
using Application.DTOs;
using Application.Services;
using Domain.Entities;
using Domain.ValueObjects;
using Infrastructure.Persistence;

namespace Application.Tests.Integration;

/// <summary>Migration <c>AddProductUpdatedAt</c> and the maintenance of <c>Product.UpdatedAt</c> on a real PostgreSQL.</summary>
public class ProductUpdatedAtTests : IClassFixture<PostgresFixture>
{
    private readonly PostgresFixture _db;

    public ProductUpdatedAtTests(PostgresFixture db) => _db = db;

    private static ProductService ServiceOver(AppDbContext ctx) => new(new UnitOfWork(ctx));

    private async Task<int> NewCategoryAsync()
    {
        await using var ctx = _db.CreateContext();
        var category = new Category { Name = "T", Slug = $"t-{Guid.NewGuid():N}", HasSizes = false };
        ctx.Add(category);
        await ctx.SaveChangesAsync();
        return category.Id;
    }

    private static ProductUpsertDto Dto(int categoryId, string name = "Чайник", decimal price = 5000) =>
        new(name, "Описание", price, null, 10, categoryId, Gender.Male, ["https://example.com/a.jpg"], false);

    private async Task<Product> LoadAsync(int id)
    {
        await using var ctx = _db.CreateContext();
        return await ctx.Products.AsNoTracking().SingleAsync(p => p.Id == id);
    }

    private async Task RunScriptAsync()
    {
        await using var ctx = _db.CreateContext();
        await ctx.Database.ExecuteSqlRawAsync(ProductUpdatedAtScript.Sql);
    }

    // ---------- the migration script ----------

    [PostgresFact]
    public async Task Script_FillsOnlyRowsWithoutAValue_WithCreatedAt_AndARepeatChangesNothing()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        await data.AddOrderAsync(1000, OrderStatus.Delivered);
        var created = new DateTime(2026, 8, 1, 9, 0, 0, DateTimeKind.Utc);
        var edited = new DateTime(2026, 9, 15, 12, 30, 0, DateTimeKind.Utc);

        int legacyId, editedId;
        await using (var ctx = _db.CreateContext())
        {
            var legacy = new Product { Name = "Старый", Price = new Money(100), Stock = 1, CategoryId = ctx.Products.Single(p => p.Id == data.ProductId).CategoryId, CreatedAt = created };
            var later = new Product { Name = "Правленый", Price = new Money(100), Stock = 1, CategoryId = legacy.CategoryId, CreatedAt = created, UpdatedAt = edited };
            ctx.AddRange(legacy, later);
            await ctx.SaveChangesAsync();
            legacyId = legacy.Id;
            editedId = later.Id;

            // The state before the migration: the column has no value (and no constraints) for the existing rows.
            await ctx.Database.ExecuteSqlRawAsync(@"ALTER TABLE ""Products"" ALTER COLUMN ""UpdatedAt"" DROP NOT NULL; ALTER TABLE ""Products"" ALTER COLUMN ""UpdatedAt"" DROP DEFAULT;");
            await ctx.Database.ExecuteSqlRawAsync(@"UPDATE ""Products"" SET ""UpdatedAt"" = NULL WHERE ""Id"" = {0}", legacyId);
        }

        await RunScriptAsync();
        var first = (await LoadAsync(legacyId), await LoadAsync(editedId));
        await RunScriptAsync();
        await RunScriptAsync();
        var again = (await LoadAsync(legacyId), await LoadAsync(editedId));

        Assert.Equal(created, first.Item1.UpdatedAt);   // filled from CreatedAt
        Assert.Equal(edited, first.Item2.UpdatedAt);    // an edit made later is kept
        Assert.Equal(first.Item1.UpdatedAt, again.Item1.UpdatedAt);
        Assert.Equal(first.Item2.UpdatedAt, again.Item2.UpdatedAt);
    }

    [PostgresFact]
    public async Task Script_LeavesTheColumnNotNullWithADefault_SoThePreviousReleaseCanStillInsertProducts()
    {
        await RunScriptAsync();
        await using var ctx = _db.CreateContext();
        var info = await ctx.Database.SqlQueryRaw<string>(
            @"SELECT is_nullable || '|' || coalesce(column_default, '') AS ""Value"" FROM information_schema.columns WHERE table_name = 'Products' AND column_name = 'UpdatedAt'")
            .SingleAsync();
        Assert.StartsWith("NO|", info);
        Assert.Contains("now()", info);
    }

    [PostgresFact]
    public async Task Script_DoesNotTouchOrdersItemsOrTheProductIds()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var orderId = await data.AddOrderAsync(1000, OrderStatus.Delivered);

        await RunScriptAsync();
        await RunScriptAsync();

        await using var ctx = _db.CreateContext();
        var order = await ctx.Orders.AsNoTracking().Include(o => o.Items).SingleAsync(o => o.Id == orderId);
        Assert.Equal(OrderStatus.Delivered, order.Status);
        Assert.Equal(1000m, order.TotalPrice.Amount);
        Assert.Equal(data.ProductId, Assert.Single(order.Items).ProductId);
        Assert.True(await ctx.Products.AnyAsync(p => p.Id == data.ProductId));
    }

    // ---------- maintenance ----------

    [PostgresFact]
    public async Task ANewProduct_StartsWithUpdatedAtEqualToCreatedAt()
    {
        var categoryId = await NewCategoryAsync();
        await using var ctx = _db.CreateContext();
        var result = await ServiceOver(ctx).CreateProductAsync(Dto(categoryId));

        Assert.True(result.IsSuccess);
        var saved = await LoadAsync(result.Value!.Id);
        Assert.Equal(saved.CreatedAt, saved.UpdatedAt);
    }

    [PostgresFact]
    public async Task EditingAProduct_MovesUpdatedAt_AndKeepsCreatedAt()
    {
        var categoryId = await NewCategoryAsync();
        int id;
        await using (var ctx = _db.CreateContext())
        {
            id = (await ServiceOver(ctx).CreateProductAsync(Dto(categoryId))).Value!.Id;
        }
        var before = await LoadAsync(id);
        await Task.Delay(20);

        await using (var ctx = _db.CreateContext())
        {
            var updated = await ServiceOver(ctx).UpdateProductAsync(id, Dto(categoryId, "Чайник новый", 6000));
            Assert.True(updated.IsSuccess);
        }

        var after = await LoadAsync(id);
        Assert.Equal(before.CreatedAt, after.CreatedAt);
        Assert.True(after.UpdatedAt > before.UpdatedAt);
        Assert.Equal("Чайник новый", after.Name);
    }

    [PostgresFact]
    public async Task StockWriteOffs_DoNotMoveUpdatedAt()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var before = await LoadAsync(data.ProductId);
        await Task.Delay(20);

        await using (var ctx = _db.CreateContext())
        {
            Assert.True(await new UnitOfWork(ctx).Products.TryDecrementStockAsync(data.ProductId, 3));
        }

        var after = await LoadAsync(data.ProductId);
        Assert.Equal(before.Stock - 3, after.Stock);
        Assert.Equal(before.UpdatedAt, after.UpdatedAt);
    }
}
