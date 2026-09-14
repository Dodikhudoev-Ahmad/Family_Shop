using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Api.Common;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;

namespace Api.Controllers;

/// <summary>Управление товарами каталога для администратора.</summary>
[ApiController]
[Route("api/v1/admin/products")]
[Authorize(Roles = "Admin")]
public class AdminProductsController : ControllerBase
{
    private const long MaxImageSizeBytes = 5 * 1024 * 1024;

    private readonly IProductService _productService;
    private readonly IImageStorageService _imageStorageService;

    public AdminProductsController(IProductService productService, IImageStorageService imageStorageService)
    {
        _productService = productService;
        _imageStorageService = imageStorageService;
    }

    /// <summary>Создаёт новый товар.</summary>
    [HttpPost]
    public async Task<ActionResult<ApiResponse<ProductDto>>> CreateProduct(ProductUpsertDto request, CancellationToken cancellationToken)
    {
        var result = await _productService.CreateProductAsync(request, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<ProductDto>.Ok(result.Value!))
            : BadRequest(ApiResponse<ProductDto>.Fail(result.Errors));
    }

    /// <summary>Обновляет существующий товар.</summary>
    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponse<ProductDto>>> UpdateProduct(int id, ProductUpsertDto request, CancellationToken cancellationToken)
    {
        var result = await _productService.UpdateProductAsync(id, request, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<ProductDto>.Ok(result.Value!))
            : BadRequest(ApiResponse<ProductDto>.Fail(result.Errors));
    }

    /// <summary>Удаляет товар.</summary>
    [HttpDelete("{id:int}")]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteProduct(int id, CancellationToken cancellationToken)
    {
        var result = await _productService.DeleteProductAsync(id, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<bool>.Ok(true))
            : BadRequest(ApiResponse<bool>.Fail(result.Errors));
    }

    /// <summary>Загружает изображение товара и возвращает его абсолютный URL.</summary>
    [HttpPost("images")]
    [RequestSizeLimit(MaxImageSizeBytes)]
    public async Task<ActionResult<ApiResponse<string>>> UploadImage(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length == 0)
        {
            return BadRequest(ApiResponse<string>.Fail("Файл не выбран."));
        }

        await using var stream = file.OpenReadStream();
        var result = await _imageStorageService.SaveImageAsync(stream, file.FileName, file.ContentType, cancellationToken);
        if (!result.IsSuccess)
        {
            return BadRequest(ApiResponse<string>.Fail(result.Errors));
        }

        var absoluteUrl = $"{Request.Scheme}://{Request.Host}{result.Value}";
        return Ok(ApiResponse<string>.Ok(absoluteUrl));
    }
}
