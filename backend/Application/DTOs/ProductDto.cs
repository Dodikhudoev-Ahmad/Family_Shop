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
    string? ProductType = null);

public record ProductUpsertDto(
    string Name,
    string Description,
    decimal Price,
    decimal? DiscountPrice,
    int Stock,
    int CategoryId,
    Gender Gender,
    List<string> Images,
    bool IsBestseller);
