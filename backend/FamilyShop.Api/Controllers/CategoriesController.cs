using Microsoft.AspNetCore.Mvc;
using FamilyShop.Api.Common;
using FamilyShop.Application.DTOs;
using FamilyShop.Application.Interfaces;

namespace FamilyShop.Api.Controllers;

/// <summary>Категории каталога.</summary>
[ApiController]
[Route("api/v1/categories")]
public class CategoriesController : ControllerBase
{
    private readonly ICategoryService _categoryService;

    public CategoriesController(ICategoryService categoryService)
    {
        _categoryService = categoryService;
    }

    /// <summary>Список категорий.</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<CategoryDto>>>> GetCategories(CancellationToken cancellationToken)
    {
        var categories = await _categoryService.GetCategoriesAsync(cancellationToken);
        return Ok(ApiResponse<IReadOnlyList<CategoryDto>>.Ok(categories));
    }
}
