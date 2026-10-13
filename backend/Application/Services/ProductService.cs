using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;

namespace Application.Services;

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
            filter.ProductType,
            cancellationToken);

        var categories = (await _unitOfWork.Categories.GetAllAsync(cancellationToken)).ToDictionary(c => c.Id);
        var dtos = items.Select(p => ToDto(p, categories.GetValueOrDefault(p.CategoryId))).ToList();
        return new PagedResult<ProductDto>(dtos, totalCount, filter.Page, filter.PageSize);
    }

    public async Task<ProductDto?> GetProductByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        var product = await _unitOfWork.Products.GetByIdAsync(id, cancellationToken);
        if (product is null)
        {
            return null;
        }

        var category = await _unitOfWork.Categories.GetByIdAsync(product.CategoryId, cancellationToken);
        return ToDto(product, category);
    }

    public async Task<Result<ProductDto>> CreateProductAsync(ProductUpsertDto dto, CancellationToken cancellationToken = default)
    {
        var category = await _unitOfWork.Categories.GetByIdAsync(dto.CategoryId, cancellationToken);
        if (category is null)
        {
            return Result<ProductDto>.Failure("Категория не найдена.");
        }

        var type = ResolveType(dto, existingType: null);
        var audience = ShoeAudienceRules.Resolve(category, type, dto.Gender, dto.ShoeSegment, dto.ChildGender);
        if (!audience.IsSuccess)
        {
            return Result<ProductDto>.Failure(audience.Errors);
        }

        var sizes = ProductSizeRules.Normalize(dto.AvailableSizes, SizeGrids.For(category, type, audience.Value.Segment));
        if (!sizes.IsSuccess)
        {
            return Result<ProductDto>.Failure(sizes.Errors);
        }

        var now = DateTime.UtcNow;
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
            ProductType = type,
            AvailableSizes = sizes.Value,
            ShoeSegment = audience.Value.Segment,
            ChildGender = audience.Value.ChildGender,
            CreatedAt = now,
            UpdatedAt = now
        };

        await _unitOfWork.Products.AddAsync(product, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<ProductDto>.Success(ToDto(product, category));
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

        var type = ResolveType(dto, existingType: product.ProductType);
        var audience = ShoeAudienceRules.Resolve(category, type, dto.Gender, dto.ShoeSegment, dto.ChildGender);
        if (!audience.IsSuccess)
        {
            return Result<ProductDto>.Failure(audience.Errors);
        }

        var sizes = ProductSizeRules.Normalize(dto.AvailableSizes, SizeGrids.For(category, type, audience.Value.Segment));
        if (!sizes.IsSuccess)
        {
            return Result<ProductDto>.Failure(sizes.Errors);
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
        product.ProductType = type;
        product.AvailableSizes = sizes.Value;
        product.ShoeSegment = audience.Value.Segment;
        product.ChildGender = audience.Value.ChildGender;
        product.UpdatedAt = DateTime.UtcNow;

        _unitOfWork.Products.Update(product);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<ProductDto>.Success(ToDto(product, category));
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

    // An explicit type from the admin wins; without one a new product gets the type inferred from its name, and an
    // edited one keeps the type it has (an old client that doesn't send a type must not reset it).
    private static string? ResolveType(ProductUpsertDto dto, string? existingType) =>
        !string.IsNullOrWhiteSpace(dto.ProductType)
            ? dto.ProductType.Trim()
            : existingType ?? ProductTypeClassifier.Infer(dto.Name);

    private static ProductDto ToDto(Product p, Category? category)
    {
        var grid = SizeGrids.For(category, p.ProductType, p.ShoeSegment);
        var offered = SizeGrids.Effective(p, category);
        var sizes = grid.Select(size => new ProductSizeDto(size, p.Stock > 0 && offered.Contains(size))).ToList();

        // A shoe gets its offered sizes spelled out (not "null = the whole grid"): a client that still carries the old
        // grids in its own code then never offers a size this product does not have.
        var availableSizes = p.ShoeSegment is null ? p.AvailableSizes : offered.ToList();

        return new(p.Id, p.Name, p.Description, p.Price.Amount, p.DiscountPrice?.Amount, p.Stock, p.CategoryId, p.Gender, p.Images,
            p.CreatedAt, p.IsBestseller, p.AverageRating, p.ReviewCount, p.ProductType, availableSizes, p.ShoeSegment, p.ChildGender, sizes);
    }
}
