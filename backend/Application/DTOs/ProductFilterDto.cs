using Domain.Entities;

namespace Application.DTOs;

public enum ProductSortBy
{
    Newest,
    PriceAsc,
    PriceDesc,
    Popular
}

public record ProductFilterDto(
    Gender? Gender,
    int? CategoryId,
    decimal? MinPrice,
    decimal? MaxPrice,
    string? Search = null,
    ProductSortBy SortBy = ProductSortBy.Newest,
    int Page = 1,
    int PageSize = 8,
    string? ProductType = null);
