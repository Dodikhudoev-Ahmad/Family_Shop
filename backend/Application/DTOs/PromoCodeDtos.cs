using Domain.Entities;

namespace Application.DTOs;

public record PromoCodeDto(
    int Id,
    string Code,
    PromoCodeDiscountType DiscountType,
    decimal DiscountValue,
    decimal? MinOrderAmount,
    decimal? MaxDiscountAmount,
    DateTime ValidFrom,
    DateTime ValidUntil,
    int? UsageLimit,
    int UsageCount,
    bool IsActive);

public record PromoCodeUpsertDto(
    string Code,
    PromoCodeDiscountType DiscountType,
    decimal DiscountValue,
    decimal? MinOrderAmount,
    decimal? MaxDiscountAmount,
    DateTime ValidFrom,
    DateTime ValidUntil,
    int? UsageLimit,
    bool IsActive);

public record ValidatePromoCodeRequestDto(string Code, decimal OrderSubtotal);

public record PromoCodeApplicationDto(
    int PromoCodeId,
    string Code,
    PromoCodeDiscountType DiscountType,
    decimal DiscountValue,
    decimal DiscountAmount,
    decimal FinalTotal);

public record PromoCodeFilterDto(int Page = 1, int PageSize = 10);
