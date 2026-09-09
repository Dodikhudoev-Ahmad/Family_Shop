using FamilyShop.Application.DTOs;

namespace FamilyShop.Application.Interfaces;

public interface ICategoryService
{
    Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken = default);
}
