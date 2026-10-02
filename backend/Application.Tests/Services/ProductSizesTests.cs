using NSubstitute;
using Xunit;
using Application.Common;
using Application.DTOs;
using Application.Services;
using Application.Validators;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;

namespace Application.Tests.Services;

/// <summary>Per-product available sizes: the grids, the validation rules and what the service stores.</summary>
public class ProductSizesTests
{
    private static Category Cat(string slug, bool hasSizes = true) => new() { Id = 1, Name = slug, Slug = slug, HasSizes = hasSizes };

    // ---------- grids ----------

    [Theory]
    [InlineData("women", null, "S,M,L,XL,2XL,3XL,4XL")]
    [InlineData("men", "Худи", "S,M,L,XL,2XL,3XL,4XL")]
    [InlineData("women", "Кроссовки", "36,37,38,39,40")]
    [InlineData("men", "Ботинки", "36,37,38,39,40")]
    [InlineData("kids", "Кроссовки", "26,27,28,29,30,31,32,33,34,35")]
    [InlineData("women", "Сумки", "")]
    [InlineData("kids", "Рюкзаки", "")]
    public void TheGridFollowsTheTypeAndNotTheCategory(string slug, string? type, string expected) =>
        Assert.Equal(expected, string.Join(",", SizeGrids.For(Cat(slug), type)));

    [Fact]
    public void CategoriesWithoutSizes_AndUnknownCategories_HaveNoGrid()
    {
        Assert.Empty(SizeGrids.For(Cat("appliances", hasSizes: false), "Холодильники"));
        Assert.Empty(SizeGrids.For(null, "Худи"));
    }

    [Fact]
    public void EffectiveSizes_AreAllOfTheGridWhenNull_AndTheSelectionOtherwise()
    {
        var product = new Product { ProductType = "Худи" };
        Assert.Equal(SizeGrids.Clothing, SizeGrids.Effective(product, Cat("women")));

        product.AvailableSizes = ["M", "L"];
        Assert.Equal(["M", "L"], SizeGrids.Effective(product, Cat("women")));
    }

    // ---------- rules ----------

    [Fact]
    public void ATypeWithoutAGrid_TakesNoSizes_NullOrEmptyBecomeNull()
    {
        Assert.Null(ProductSizeRules.Normalize(null, []).Value);
        Assert.Null(ProductSizeRules.Normalize([], []).Value);

        var refused = ProductSizeRules.Normalize(["M"], []);
        Assert.False(refused.IsSuccess);
        Assert.Equal(ProductSizeRules.NoSizesForType, refused.Errors[0]);
    }

    [Fact]
    public void AGridWithoutASingleSize_IsRefused_ButNullMeansAll()
    {
        Assert.True(ProductSizeRules.Normalize(null, SizeGrids.Clothing).IsSuccess);
        Assert.Null(ProductSizeRules.Normalize(null, SizeGrids.Clothing).Value);
        Assert.Equal(ProductSizeRules.AtLeastOneSize, ProductSizeRules.Normalize([], SizeGrids.Clothing).Errors[0]);
    }

    [Theory]
    [InlineData("XS")]      // not in the grid (the clothing grid has no XS)
    [InlineData("38")]      // a shoe size for clothes
    [InlineData("m")]       // case matters
    [InlineData(" ")]
    [InlineData("")]
    public void SizesOutsideTheGridOrBlankAreRefused(string size) =>
        Assert.False(ProductSizeRules.Normalize(["S", size], SizeGrids.Clothing).IsSuccess);

    [Fact]
    public void DuplicatesAreRefused_AndASelectionIsOrderedLikeTheGrid()
    {
        Assert.False(ProductSizeRules.Normalize(["S", "S"], SizeGrids.Clothing).IsSuccess);
        Assert.Equal(["S", "XL", "3XL"], ProductSizeRules.Normalize(["3XL", "S", "XL"], SizeGrids.Clothing).Value);
    }

    [Fact]
    public void ASelectionOfTheWholeGridIsStoredAsNull()
    {
        Assert.Null(ProductSizeRules.Normalize(SizeGrids.AdultShoes.Reverse().ToList(), SizeGrids.AdultShoes).Value);
    }

    // ---------- FluentValidation (structure) ----------

    private static ProductUpsertDto Dto(List<string>? sizes, string? type = null) =>
        new("Худи", "Описание", 1000, null, 5, 1, Gender.Male, ["https://example.com/a.jpg"], false, type, sizes);

    [Fact]
    public void TheValidator_RejectsBlankDuplicateTooLongTooManyAndUnknownTypes()
    {
        var validator = new ProductUpsertValidator();
        Assert.True(validator.Validate(Dto(["S", "M"], "Худи")).IsValid);
        Assert.True(validator.Validate(Dto(null)).IsValid);
        Assert.False(validator.Validate(Dto(["S", ""])).IsValid);
        Assert.False(validator.Validate(Dto(["S", "S"])).IsValid);
        Assert.False(validator.Validate(Dto([new string('x', 17)])).IsValid);
        Assert.False(validator.Validate(Dto(Enumerable.Range(0, 31).Select(i => $"s{i}").ToList())).IsValid);
        Assert.False(validator.Validate(Dto(null, "Космические корабли")).IsValid);
    }

    // ---------- the service ----------

    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();
    private readonly IProductRepository _products = Substitute.For<IProductRepository>();
    private readonly ICategoryRepository _categories = Substitute.For<ICategoryRepository>();

    private ProductService Service(Category category)
    {
        _uow.Products.Returns(_products);
        _uow.Categories.Returns(_categories);
        _categories.GetByIdAsync(category.Id, Arg.Any<CancellationToken>()).Returns(category);
        return new ProductService(_uow);
    }

    [Fact]
    public async Task Create_StoresTheSelection_NullForAllSizes_AndInfersTheTypeFromTheName()
    {
        var sut = Service(Cat("men"));

        var some = await sut.CreateProductAsync(Dto(["M", "L"]));
        var all = await sut.CreateProductAsync(Dto(null));

        Assert.Equal(["M", "L"], some.Value!.AvailableSizes);
        Assert.Equal("Худи", some.Value.ProductType);
        Assert.Null(all.Value!.AvailableSizes);
    }

    [Fact]
    public async Task Create_WithAnExplicitType_UsesItsGrid()
    {
        var sut = Service(Cat("kids"));

        Assert.False((await sut.CreateProductAsync(Dto(["38"], "Кроссовки"))).IsSuccess); // adult size, kids grid is 26-35
        var ok = await sut.CreateProductAsync(Dto(["30", "31"], "Кроссовки"));

        Assert.True(ok.IsSuccess);
        Assert.Equal("Кроссовки", ok.Value!.ProductType);
    }

    [Fact]
    public async Task AProductWithoutAGrid_CannotBeSavedWithSizes_Create_AndUpdate()
    {
        var sut = Service(Cat("appliances", hasSizes: false));
        var fridge = new Product { Id = 4, CategoryId = 1, ProductType = "Холодильники", Name = "Холодильник", Price = new Money(1), Images = ["a"] };
        _products.GetByIdAsync(4, Arg.Any<CancellationToken>()).Returns(fridge);

        var created = await sut.CreateProductAsync(Dto(["M"], "Холодильники"));
        var updated = await sut.UpdateProductAsync(4, Dto(["M"], "Холодильники"));
        var fine = await sut.UpdateProductAsync(4, Dto([], "Холодильники"));

        Assert.False(created.IsSuccess);
        Assert.False(updated.IsSuccess);
        Assert.Equal(ProductSizeRules.NoSizesForType, created.Errors[0]);
        Assert.True(fine.IsSuccess);
        Assert.Null(fridge.AvailableSizes);
    }

    [Fact]
    public async Task Update_WithoutAType_KeepsTheExistingOne_AndChangingTheTypeRechecksTheSizes()
    {
        var sut = Service(Cat("women"));
        var shoes = new Product { Id = 5, CategoryId = 1, ProductType = "Кроссовки", Name = "Обувь", Price = new Money(1), Images = ["a"], AvailableSizes = ["38"] };
        _products.GetByIdAsync(5, Arg.Any<CancellationToken>()).Returns(shoes);

        // A client that doesn't send a type must not reset it (the name says nothing about shoes).
        var kept = await sut.UpdateProductAsync(5, Dto(["37", "38"]) with { Name = "Модель Икс" });
        Assert.True(kept.IsSuccess);
        Assert.Equal("Кроссовки", shoes.ProductType);
        Assert.Equal(["37", "38"], shoes.AvailableSizes);

        // Switched to clothes, the old shoe sizes are no longer valid.
        var switched = await sut.UpdateProductAsync(5, Dto(["37"], "Худи"));
        Assert.False(switched.IsSuccess);
    }

    // ---------- orders ----------

    private (OrderService Sut, Product Product) OrderSetup(Product product, bool sized)
    {
        var orders = Substitute.For<IOrderRepository>();
        _uow.Products.Returns(_products);
        _uow.Orders.Returns(orders);
        _uow.Categories.Returns(_categories);
        _uow.PromoCodes.Returns(Substitute.For<IPromoCodeRepository>());
        _uow.ExecuteInTransactionAsync(Arg.Any<Func<CancellationToken, Task<bool>>>(), Arg.Any<CancellationToken>())
            .Returns(call => call.Arg<Func<CancellationToken, Task<bool>>>()(call.ArgAt<CancellationToken>(1)));
        _categories.GetByIdAsync(product.CategoryId, Arg.Any<CancellationToken>())
            .Returns(new Category { Id = product.CategoryId, Slug = "women", HasSizes = sized });
        _products.GetByIdAsync(product.Id, Arg.Any<CancellationToken>()).Returns(product);
        _products.TryDecrementStockAsync(product.Id, Arg.Any<int>(), Arg.Any<CancellationToken>()).Returns(true);
        return (new OrderService(_uow), product);
    }

    private static CreateOrderRequestDto Order(int productId, string? size) =>
        new([new CreateOrderItemDto(productId, 1, size)], "Ann", "+7 700 000 00 09", DeliveryMethod.Pickup, null, null);

    [Fact]
    public async Task AnOrderedSizeThatTheAdminDoesNotSell_Gets409SizeUnavailable_AndNothingIsWrittenOff()
    {
        var (sut, _) = OrderSetup(new Product { Id = 1, CategoryId = 1, Name = "Худи", ProductType = "Худи", Price = new Money(100), Stock = 9, AvailableSizes = ["M", "L"] }, sized: true);

        var result = await sut.CreateOrderAsync(1, Order(1, "XL"));

        Assert.False(result.IsSuccess);
        Assert.Equal(ResultErrorCodes.SizeUnavailable, result.ErrorCode);
        Assert.Equal("Худи", result.ErrorMeta!["productName"]);
        Assert.Equal("XL", result.ErrorMeta["size"]);
        await _products.DidNotReceive().TryDecrementStockAsync(Arg.Any<int>(), Arg.Any<int>(), Arg.Any<CancellationToken>());
        Assert.True((await sut.CreateOrderAsync(1, Order(1, "M"))).IsSuccess);
    }

    [Fact]
    public async Task NullAvailableSizes_MeansTheWholeGrid_SoOldProductsKeepWorking()
    {
        var (sut, _) = OrderSetup(new Product { Id = 1, CategoryId = 1, Name = "Худи", ProductType = "Худи", Price = new Money(100), Stock = 9, AvailableSizes = null }, sized: true);

        foreach (var size in SizeGrids.Clothing)
        {
            Assert.True((await sut.CreateOrderAsync(1, Order(1, size))).IsSuccess, size);
        }

        Assert.Equal(ResultErrorCodes.SizeUnavailable, (await sut.CreateOrderAsync(1, Order(1, "38"))).ErrorCode);
        Assert.Equal(ResultErrorCodes.SizeUnavailable, (await sut.CreateOrderAsync(1, Order(1, null))).ErrorCode); // a sized product needs a size
    }

    [Fact]
    public async Task AProductWithoutSizes_TakesNoSize()
    {
        var (sut, _) = OrderSetup(new Product { Id = 2, CategoryId = 2, Name = "Холодильник", ProductType = "Холодильники", Price = new Money(100), Stock = 9 }, sized: false);

        Assert.True((await sut.CreateOrderAsync(1, Order(2, null))).IsSuccess);
        Assert.True((await sut.CreateOrderAsync(1, Order(2, "  "))).IsSuccess);
        var withSize = await sut.CreateOrderAsync(1, Order(2, "M"));

        Assert.Equal(ResultErrorCodes.SizeUnavailable, withSize.ErrorCode);
    }
}
