using Domain.Entities;

namespace Application.DTOs;

public record ProductDto(
    int Id,
    string Name,
    string Description,
    decimal Price,
    decimal? DiscountPrice,
    int Stock,
    int CategoryId,
    Gender Gender,
    List<string> Images,
    DateTime CreatedAt,
    bool IsBestseller,
    decimal AverageRating,
    int ReviewCount,
    string? ProductType = null,
    List<string>? AvailableSizes = null,
    ShoeSegment? ShoeSegment = null,
    ChildGender? ChildGender = null,
    List<ProductSizeDto>? Sizes = null);

/// <summary>One size of the product's grid and whether it can be bought now (offered by the admin and in stock).</summary>
public record ProductSizeDto(string Size, bool Available);

public record ProductUpsertDto(
    string Name,
    string Description,
    decimal Price,
    decimal? DiscountPrice,
    int Stock,
    int CategoryId,
    Gender Gender,
    List<string> Images,
    bool IsBestseller,
    string? ProductType = null,
    List<string>? AvailableSizes = null,
    ShoeSegment? ShoeSegment = null,
    ChildGender? ChildGender = null);

/// <summary>The size grid of one shoe segment as the server defines it: the one place clients take the ranges from.
/// <see cref="ChildGenders"/> is empty for adult segments, boy and girl for kids and teen.</summary>
public record ShoeSizeGridDto(
    ShoeSegment Segment,
    Gender Gender,
    IReadOnlyList<string> Sizes,
    IReadOnlyList<ChildGender> ChildGenders);

public record SizeGridsDto(IReadOnlyList<ShoeSizeGridDto> Shoes);
