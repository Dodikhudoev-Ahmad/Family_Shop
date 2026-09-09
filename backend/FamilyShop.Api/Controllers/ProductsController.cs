using Microsoft.AspNetCore.Mvc;
using FamilyShop.Api.Common;
using FamilyShop.Application.Common;
using FamilyShop.Application.DTOs;
using FamilyShop.Application.Interfaces;
using FamilyShop.Domain.Entities;

namespace FamilyShop.Api.Controllers;

/// <summary>Товары каталога.</summary>
[ApiController]
[Route("api/v1/products")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;

    public ProductsController(IProductService productService)
    {
        _productService = productService;
    }

    /// <summary>Список товаров с фильтрацией по полу, категории, цене и поисковой строке (name/description), сортировкой и пагинацией.</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<ProductDto>>>> GetProducts(
        [FromQuery] Gender? gender,
        [FromQuery] int? categoryId,
        [FromQuery] decimal? minPrice,
        [FromQuery] decimal? maxPrice,
        [FromQuery] string? search,
        [FromQuery] ProductSortBy sortBy = ProductSortBy.Newest,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 8,
        CancellationToken cancellationToken = default)
    {
        var filter = new ProductFilterDto(gender, categoryId, minPrice, maxPrice, search, sortBy, page, pageSize);
        var result = await _productService.GetProductsAsync(filter, cancellationToken);
        return Ok(ApiResponse<PagedResult<ProductDto>>.Ok(result));
    }

    /// <summary>Карточка товара по идентификатору.</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<ProductDto>>> GetProduct(int id, CancellationToken cancellationToken)
    {
        var product = await _productService.GetProductByIdAsync(id, cancellationToken);
        return product is null
            ? NotFound(ApiResponse<ProductDto>.Fail("Product not found."))
            : Ok(ApiResponse<ProductDto>.Ok(product));
    }
}
