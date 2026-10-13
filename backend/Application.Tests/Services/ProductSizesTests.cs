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
    [InlineData("women", "Сумки", "")]
    [InlineData("kids", "Рюкзаки", "")]
    public void TheGridFollowsTheTypeAndNotTheCategory(string slug, string? type, string expected) =>
        Assert.Equal(expected, string.Join(",", SizeGrids.For(Cat(slug), type)));

    [Theory]
    [InlineData(ShoeSegment.Men, "39", "45", 7)]
    [InlineData(ShoeSegment.Women, "35", "41", 7)]
    [InlineData(ShoeSegment.Kids, "27", "37", 11)]
    [InlineData(ShoeSegment.Teen, "37", "41", 5)]
    public void EachShoeSegmentHasItsOwnRange(ShoeSegment segment, string first, string last, int count)
    {
        var grid = SizeGrids.For(Cat("women"), "Кроссовки", segment);

        Assert.Equal(first, grid[0]);
        Assert.Equal(last, grid[^1]);
        Assert.Equal(count, grid.Count);
    }

    [Fact]
    public void KidsAndTeenGridsShareSize37()
    {
        Assert.Contains("37", SizeGrids.For(Cat("kids"), "Ботинки", ShoeSegment.Kids));
        Assert.Contains("37", SizeGrids.For(Cat("kids"), "Ботинки", ShoeSegment.Teen));
        Assert.DoesNotContain("37", SizeGrids.For(Cat("men"), "Ботинки", ShoeSegment.Men));
        Assert.DoesNotContain("38", SizeGrids.For(Cat("men"), "Ботинки", ShoeSegment.Men));
        Assert.DoesNotContain("38", SizeGrids.For(Cat("kids"), "Ботинки", ShoeSegment.Kids));
    }

    [Fact]
    public void GridsCoverEachSizeOnce()
    {
        var all = SizeGrids.ShoesBySegment.Values.SelectMany(g => g).Distinct().Select(int.Parse).Order().ToList();

        Assert.Equal(Enumerable.Range(27, 19), all);
    }

    [Fact]
    public void AShoeWithoutASegment_HasNoGrid()
    {
        Assert.Empty(SizeGrids.For(Cat("men"), "Кроссовки"));
    }

    // ---------- audience (segment and boy/girl) ----------

    [Theory]
    [InlineData(Gender.Male, null, null, ShoeSegment.Men, null)]
    [InlineData(Gender.Female, null, null, ShoeSegment.Women, null)]
    [InlineData(Gender.Kids, null, ChildGender.Boy, ShoeSegment.Kids, ChildGender.Boy)]
    [InlineData(Gender.Kids, ShoeSegment.Teen, ChildGender.Girl, ShoeSegment.Teen, ChildGender.Girl)]
    public void Audience_IsResolvedFromGenderOrTakenFromTheRequest(
        Gender gender, ShoeSegment? segment, ChildGender? child, ShoeSegment expectedSegment, ChildGender? expectedChild)
    {
        var result = ShoeAudienceRules.Resolve(Cat("men"), "Кроссовки", gender, segment, child);

        Assert.True(result.IsSuccess);
        Assert.Equal(new ShoeAudience(expectedSegment, expectedChild), result.Value);
    }

    [Theory]
    [InlineData(Gender.Kids, null, null, ShoeAudienceRules.ChildGenderRequired)]
    [InlineData(Gender.Kids, ShoeSegment.Teen, null, ShoeAudienceRules.ChildGenderRequired)]
    [InlineData(Gender.Male, null, ChildGender.Boy, ShoeAudienceRules.ChildGenderForbidden)]
    [InlineData(Gender.Female, ShoeSegment.Women, ChildGender.Girl, ShoeAudienceRules.ChildGenderForbidden)]
    [InlineData(Gender.Male, ShoeSegment.Teen, ChildGender.Boy, ShoeAudienceRules.SegmentMismatch)]
    [InlineData(Gender.Kids, ShoeSegment.Men, null, ShoeAudienceRules.SegmentMismatch)]
    public void Audience_RejectsMissingForbiddenAndMismatchedValues(Gender gender, ShoeSegment? segment, ChildGender? child, string error)
    {
        var result = ShoeAudienceRules.Resolve(Cat("men"), "Кроссовки", gender, segment, child);

        Assert.False(result.IsSuccess);
        Assert.Equal(error, result.Errors[0]);
    }

    [Fact]
    public void Audience_IsNotAllowedForNonShoes_NorForShoesInACategoryWithoutSizes()
    {
        Assert.True(ShoeAudienceRules.Resolve(Cat("men"), "Худи", Gender.Male, null, null).IsSuccess);
        Assert.False(ShoeAudienceRules.Resolve(Cat("men"), "Худи", Gender.Male, ShoeSegment.Men, null).IsSuccess);
        Assert.False(ShoeAudienceRules.Resolve(Cat("sport", hasSizes: false), "Кроссовки", Gender.Male, ShoeSegment.Men, null).IsSuccess);
        Assert.True(ShoeAudienceRules.Resolve(Cat("sport", hasSizes: false), "Кроссовки", Gender.Male, null, null).IsSuccess);
    }

    [Fact]
    public void CategoriesWithoutSizes_AndUnknownCategories_HaveNoGrid()
    {
        Assert.Empty(SizeGrids.For(Cat("appliances", hasSizes: false), "Холодильники"));
        Assert.Empty(SizeGrids.For(null, "Худи"));
    }

    [Theory]
    [InlineData("Этажерки")]
    [InlineData("Органайзеры")]
    [InlineData("Системы хранения")]
    [InlineData("Декор")]
    public void HomeGoodsTypes_HaveNoGrid_AndTakeNoSizes(string type)
    {
        var grid = SizeGrids.For(Cat("dom-i-byt", hasSizes: false), type);
        Assert.Empty(grid);
        Assert.False(ProductSizeRules.Normalize(["M"], grid).IsSuccess);
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
        Assert.Null(ProductSizeRules.Normalize(SizeGrids.ShoesBySegment[ShoeSegment.Men].Reverse().ToList(), SizeGrids.ShoesBySegment[ShoeSegment.Men]).Value);
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

        var kidsShoes = Dto(["38"], "Кроссовки") with { Gender = Gender.Kids, ChildGender = ChildGender.Boy };

        Assert.False((await sut.CreateProductAsync(kidsShoes)).IsSuccess); // 38 is outside the kids grid 27-37
        var ok = await sut.CreateProductAsync(kidsShoes with { AvailableSizes = ["30", "31"] });

        Assert.True(ok.IsSuccess);
        Assert.Equal("Кроссовки", ok.Value!.ProductType);
        Assert.Equal(ShoeSegment.Kids, ok.Value.ShoeSegment);
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
        var shoes = new Product { Id = 5, CategoryId = 1, ProductType = "Кроссовки", Name = "Обувь", Price = new Money(1), Images = ["a"], AvailableSizes = ["38"], ShoeSegment = ShoeSegment.Women };
        _products.GetByIdAsync(5, Arg.Any<CancellationToken>()).Returns(shoes);

        // A client that doesn't send a type must not reset it (the name says nothing about shoes).
        var kept = await sut.UpdateProductAsync(5, Dto(["37", "38"]) with { Name = "Модель Икс", Gender = Gender.Female });
        Assert.True(kept.IsSuccess);
        Assert.Equal("Кроссовки", shoes.ProductType);
        Assert.Equal(["37", "38"], shoes.AvailableSizes);

        // Switched to clothes, the old shoe sizes are no longer valid.
        var switched = await sut.UpdateProductAsync(5, Dto(["37"], "Худи"));
        Assert.False(switched.IsSuccess);
    }

    [Theory]
    [InlineData(Gender.Male, "men", "38", false)]
    [InlineData(Gender.Male, "men", "39", true)]
    [InlineData(Gender.Male, "men", "45", true)]
    [InlineData(Gender.Male, "men", "46", false)]
    [InlineData(Gender.Female, "women", "34", false)]
    [InlineData(Gender.Female, "women", "35", true)]
    [InlineData(Gender.Female, "women", "41", true)]
    [InlineData(Gender.Female, "women", "42", false)]
    public async Task AdultShoes_AcceptOnlySizesOfTheirOwnGrid(Gender gender, string slug, string size, bool accepted)
    {
        var sut = Service(Cat(slug));
        var dto = Dto([size], "Кроссовки") with { Gender = gender };

        Assert.Equal(accepted, (await sut.CreateProductAsync(dto)).IsSuccess);
    }

    [Theory]
    [InlineData(ShoeSegment.Kids, "26", false)]
    [InlineData(ShoeSegment.Kids, "27", true)]
    [InlineData(ShoeSegment.Kids, "37", true)]
    [InlineData(ShoeSegment.Kids, "38", false)]
    [InlineData(ShoeSegment.Teen, "36", false)]
    [InlineData(ShoeSegment.Teen, "37", true)]
    [InlineData(ShoeSegment.Teen, "41", true)]
    [InlineData(ShoeSegment.Teen, "42", false)]
    public async Task ChildrensShoes_AcceptOnlySizesOfTheirSegment(ShoeSegment segment, string size, bool accepted)
    {
        var sut = Service(Cat("kids"));
        var dto = Dto([size], "Кроссовки") with { Gender = Gender.Kids, ShoeSegment = segment, ChildGender = ChildGender.Girl };

        Assert.Equal(accepted, (await sut.CreateProductAsync(dto)).IsSuccess);
    }

    [Fact]
    public async Task ChildrensShoes_NeedBoyOrGirl_AndAdultShoesMustNotHaveOne()
    {
        var sut = Service(Cat("kids"));
        var kids = Dto(null, "Кроссовки") with { Gender = Gender.Kids };

        Assert.Equal(ShoeAudienceRules.ChildGenderRequired, (await sut.CreateProductAsync(kids)).Errors[0]);
        Assert.True((await sut.CreateProductAsync(kids with { ChildGender = ChildGender.Boy })).IsSuccess);
        Assert.Equal(ShoeAudienceRules.ChildGenderForbidden,
            (await sut.CreateProductAsync(Dto(null, "Кроссовки") with { ChildGender = ChildGender.Boy })).Errors[0]);
    }

    [Fact]
    public async Task TheProductCarriesItsSegmentTheGridAndWhichSizesAreAvailable()
    {
        var sut = Service(Cat("kids"));
        var dto = Dto(["37", "39"], "Кроссовки") with { Gender = Gender.Kids, ShoeSegment = ShoeSegment.Teen, ChildGender = ChildGender.Boy };

        var created = (await sut.CreateProductAsync(dto)).Value!;

        Assert.Equal(ShoeSegment.Teen, created.ShoeSegment);
        Assert.Equal(ChildGender.Boy, created.ChildGender);
        Assert.Equal(["37", "38", "39", "40", "41"], created.Sizes!.Select(s => s.Size));
        Assert.Equal(["37", "39"], created.Sizes!.Where(s => s.Available).Select(s => s.Size));
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
