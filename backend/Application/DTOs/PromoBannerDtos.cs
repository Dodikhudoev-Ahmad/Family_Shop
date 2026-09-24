using Domain.Entities;

namespace Application.DTOs;

public record PromoBannerDto(
    int Id,
    string Title,
    string? Subtitle,
    string? ButtonText,
    string? ButtonLink,
    string? ImageUrl,
    bool IsActive,
    int SortOrder,
    PromoBannerPlacement Placement);

public record PromoBannerUpsertDto(
    string Title,
    string? Subtitle,
    string? ButtonText,
    string? ButtonLink,
    string? ImageUrl,
    bool IsActive,
    int SortOrder,
    PromoBannerPlacement Placement);
