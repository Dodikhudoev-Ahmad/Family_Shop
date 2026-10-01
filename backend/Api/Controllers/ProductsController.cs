using Microsoft.AspNetCore.Authorization;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Api.Common;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;

namespace Api.Controllers;

/// <summary>Товары каталога.</summary>
[ApiController]
[Route("api/v1/products")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;
    private readonly IValidator<ProductFilterDto> _filterValidator;

    public ProductsController(IProductService productService, IValidator<ProductFilterDto> filterValidator)
    {
        _productService = productService;
        _filterValidator = filterValidator;
    }

    /// <summary>Список товаров с фильтрацией по полу, категории, цене и поисковой строке (name/description), сортировкой и пагинацией.</summary>
    [AllowAnonymous]
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
        [FromQuery] string? productType = null,
        CancellationToken cancellationToken = default)
    {
        var filter = new ProductFilterDto(gender, categoryId, minPrice, maxPrice, search, sortBy, page, pageSize, productType);
        var errors = await _filterValidator.ValidateOrNullAsync(filter, cancellationToken);
        if (errors is not null)
        {
            return BadRequest(ApiResponse<PagedResult<ProductDto>>.Fail(errors));
        }

        var result = await _productService.GetProductsAsync(filter, cancellationToken);
        return Ok(ApiResponse<PagedResult<ProductDto>>.Ok(result));
    }

    /// <summary>Карточка товара по идентификатору.</summary>
    [AllowAnonymous]
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<ProductDto>>> GetProduct(int id, CancellationToken cancellationToken)
    {
        var product = await _productService.GetProductByIdAsync(id, cancellationToken);
        return product is null
            ? NotFound(ApiResponse<ProductDto>.Fail("Product not found."))
            : Ok(ApiResponse<ProductDto>.Ok(product));
    }
}
