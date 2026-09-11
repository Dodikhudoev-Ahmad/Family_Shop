using FamilyShop.Application.Common;
using FamilyShop.Application.DTOs;
using FamilyShop.Application.Interfaces;
using FamilyShop.Domain.Entities;
using FamilyShop.Domain.Interfaces;
using FamilyShop.Domain.ValueObjects;

namespace FamilyShop.Application.Services;

public class ProductService : IProductService
{
    private readonly IUnitOfWork _unitOfWork;

    public ProductService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
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

        var (items, totalCount) = await _unitOfWork.Products.GetByFilterAsync(
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
        var product = await _unitOfWork.Products.GetByIdAsync(id, cancellationToken);
        return product is null ? null : ToDto(product);
    }

    public async Task<Result<ProductDto>> CreateProductAsync(ProductUpsertDto dto, CancellationToken cancellationToken = default)
    {
        var category = await _unitOfWork.Categories.GetByIdAsync(dto.CategoryId, cancellationToken);
        if (category is null)
        {
            return Result<ProductDto>.Failure("Категория не найдена.");
        }

        var product = new Product
        {
            Name = dto.Name.Trim(),
            Description = dto.Description.Trim(),
            Price = new Money(dto.Price),
            DiscountPrice = dto.DiscountPrice is null ? null : new Money(dto.DiscountPrice.Value),
            Stock = dto.Stock,
            CategoryId = dto.CategoryId,
            Gender = dto.Gender,
            Images = dto.Images,
            IsBestseller = dto.IsBestseller,
            CreatedAt = DateTime.UtcNow
        };

        await _unitOfWork.Products.AddAsync(product, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<ProductDto>.Success(ToDto(product));
    }

    public async Task<Result<ProductDto>> UpdateProductAsync(int id, ProductUpsertDto dto, CancellationToken cancellationToken = default)
    {
        var product = await _unitOfWork.Products.GetByIdAsync(id, cancellationToken);
        if (product is null)
        {
            return Result<ProductDto>.Failure("Товар не найден.");
        }

        var category = await _unitOfWork.Categories.GetByIdAsync(dto.CategoryId, cancellationToken);
        if (category is null)
        {
            return Result<ProductDto>.Failure("Категория не найдена.");
        }

        product.Name = dto.Name.Trim();
        product.Description = dto.Description.Trim();
        product.Price = new Money(dto.Price);
        product.DiscountPrice = dto.DiscountPrice is null ? null : new Money(dto.DiscountPrice.Value);
        product.Stock = dto.Stock;
        product.CategoryId = dto.CategoryId;
        product.Gender = dto.Gender;
        product.Images = dto.Images;
        product.IsBestseller = dto.IsBestseller;

        _unitOfWork.Products.Update(product);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<ProductDto>.Success(ToDto(product));
    }

    public async Task<Result<bool>> DeleteProductAsync(int id, CancellationToken cancellationToken = default)
    {
        var product = await _unitOfWork.Products.GetByIdAsync(id, cancellationToken);
        if (product is null)
        {
            return Result<bool>.Failure("Товар не найден.");
        }

        if (await _unitOfWork.Orders.HasItemsForProductAsync(id, cancellationToken))
        {
            return Result<bool>.Failure("Нельзя удалить товар, который есть в оформленных заказах.");
        }

        _unitOfWork.Products.Remove(product);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<bool>.Success(true);
    }

    private static ProductDto ToDto(Domain.Entities.Product p) =>
        new(p.Id, p.Name, p.Description, p.Price.Amount, p.DiscountPrice?.Amount, p.Stock, p.CategoryId, p.Gender, p.Images, p.CreatedAt, p.IsBestseller, p.AverageRating, p.ReviewCount);
}
