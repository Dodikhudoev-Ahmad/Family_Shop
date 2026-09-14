using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyShop.Api.Common;
using FamilyShop.Application.DTOs;
using FamilyShop.Application.Interfaces;

namespace FamilyShop.Api.Controllers;

/// <summary>Управление категориями каталога для администратора.</summary>
[ApiController]
[Route("api/v1/admin/categories")]
[Authorize(Roles = "Admin")]
public class AdminCategoriesController : ControllerBase
{
    private readonly ICategoryService _categoryService;

    public AdminCategoriesController(ICategoryService categoryService)
    {
        _categoryService = categoryService;
    }

    /// <summary>Создаёт новую категорию.</summary>
    [HttpPost]
    public async Task<ActionResult<ApiResponse<CategoryDto>>> CreateCategory(CategoryUpsertDto request, CancellationToken cancellationToken)
    {
        var result = await _categoryService.CreateCategoryAsync(request, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<CategoryDto>.Ok(result.Value!))
            : BadRequest(ApiResponse<CategoryDto>.Fail(result.Errors));
    }

    /// <summary>Обновляет существующую категорию.</summary>
    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponse<CategoryDto>>> UpdateCategory(int id, CategoryUpsertDto request, CancellationToken cancellationToken)
    {
        var result = await _categoryService.UpdateCategoryAsync(id, request, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<CategoryDto>.Ok(result.Value!))
            : BadRequest(ApiResponse<CategoryDto>.Fail(result.Errors));
    }

    /// <summary>Удаляет категорию.</summary>
    [HttpDelete("{id:int}")]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteCategory(int id, CancellationToken cancellationToken)
    {
        var result = await _categoryService.DeleteCategoryAsync(id, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<bool>.Ok(true))
            : BadRequest(ApiResponse<bool>.Fail(result.Errors));
    }
}
