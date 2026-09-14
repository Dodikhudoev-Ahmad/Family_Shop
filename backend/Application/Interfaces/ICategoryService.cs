using Application.Common;
using Application.DTOs;

namespace Application.Interfaces;

public interface ICategoryService
{
    Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken = default);
    Task<Result<CategoryDto>> CreateCategoryAsync(CategoryUpsertDto dto, CancellationToken cancellationToken = default);
    Task<Result<CategoryDto>> UpdateCategoryAsync(int id, CategoryUpsertDto dto, CancellationToken cancellationToken = default);
    Task<Result<bool>> DeleteCategoryAsync(int id, CancellationToken cancellationToken = default);
}
