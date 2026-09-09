using FamilyShop.Application.DTOs;
using FamilyShop.Application.Interfaces;
using FamilyShop.Domain.Interfaces;

namespace FamilyShop.Application.Services;

public class CategoryService : ICategoryService
{
    private readonly ICategoryRepository _categoryRepository;

    public CategoryService(ICategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public async Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken = default)
    {
        var categories = await _categoryRepository.GetAllAsync(cancellationToken);
        return categories
            .Select(c => new CategoryDto(c.Id, c.Name, c.Slug, c.ParentCategoryId))
            .ToList();
    }
}
