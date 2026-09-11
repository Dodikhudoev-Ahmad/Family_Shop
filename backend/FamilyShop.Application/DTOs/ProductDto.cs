using FamilyShop.Domain.Entities;

namespace FamilyShop.Application.DTOs;

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
    int ReviewCount);

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
