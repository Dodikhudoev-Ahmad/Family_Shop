using FamilyShop.Application.Common;
using FamilyShop.Application.DTOs;
using FamilyShop.Application.Interfaces;
using FamilyShop.Domain.Interfaces;

namespace FamilyShop.Application.Services;

public class ProductService : IProductService
{
    private readonly IProductRepository _productRepository;

    public ProductService(IProductRepository productRepository)
    {
        _productRepository = productRepository;
    }

    public async Task<PagedResult<ProductDto>> GetProductsAsync(ProductFilterDto filter, CancellationToken cancellationToken = default)
    {
        var sortOrder = filter.SortBy switch
        {
            ProductSortBy.PriceAsc => ProductSortOrder.PriceAsc,
            ProductSortBy.PriceDesc => ProductSortOrder.PriceDesc,
            ProductSortBy.Popular => ProductSortOrder.Popular,
            _ => ProductSortOrder.Newest
        };

        var (items, totalCount) = await _productRepository.GetByFilterAsync(
            filter.Gender,
            filter.CategoryId,
            filter.MinPrice,
            filter.MaxPrice,
            filter.Search,
            sortOrder,
            filter.Page,
            filter.PageSize,
            cancellationToken);

        return new PagedResult<ProductDto>(items.Select(ToDto).ToList(), totalCount, filter.Page, filter.PageSize);
    }

    public async Task<ProductDto?> GetProductByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        var product = await _productRepository.GetByIdAsync(id, cancellationToken);
        return product is null ? null : ToDto(product);
    }

    private static ProductDto ToDto(Domain.Entities.Product p) =>
        new(p.Id, p.Name, p.Description, p.Price.Amount, p.DiscountPrice?.Amount, p.Stock, p.CategoryId, p.Gender, p.Images, p.CreatedAt, p.IsBestseller, p.AverageRating, p.ReviewCount);
}
