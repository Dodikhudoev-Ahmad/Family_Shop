using FamilyShop.Application.Common;
using FamilyShop.Application.DTOs;

namespace FamilyShop.Application.Interfaces;

public interface IProductService
{
    Task<PagedResult<ProductDto>> GetProductsAsync(ProductFilterDto filter, CancellationToken cancellationToken = default);
    Task<ProductDto?> GetProductByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Result<ProductDto>> CreateProductAsync(ProductUpsertDto dto, CancellationToken cancellationToken = default);
    Task<Result<ProductDto>> UpdateProductAsync(int id, ProductUpsertDto dto, CancellationToken cancellationToken = default);
    Task<Result<bool>> DeleteProductAsync(int id, CancellationToken cancellationToken = default);
}
