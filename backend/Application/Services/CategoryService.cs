using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Services;

public class CategoryService : ICategoryService
{
    private readonly IUnitOfWork _unitOfWork;

    public CategoryService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyList<CategoryDto>> GetCategoriesAsync(CancellationToken cancellationToken = default)
    {
        var categories = await _unitOfWork.Categories.GetAllAsync(cancellationToken);
        return categories
            .Select(ToDto)
            .ToList();
    }

    public async Task<Result<CategoryDto>> CreateCategoryAsync(CategoryUpsertDto dto, CancellationToken cancellationToken = default)
    {
        var slug = dto.Slug.Trim().ToLowerInvariant();

        if (await _unitOfWork.Categories.AnyBySlugAsync(slug, null, cancellationToken))
        {
            return Result<CategoryDto>.Failure("Категория с таким адресом (slug) уже существует.");
        }

        if (dto.ParentCategoryId is not null && await _unitOfWork.Categories.GetByIdAsync(dto.ParentCategoryId.Value, cancellationToken) is null)
        {
            return Result<CategoryDto>.Failure("Родительская категория не найдена.");
        }

        var category = new Category
        {
            Name = dto.Name.Trim(),
            Slug = slug,
            ParentCategoryId = dto.ParentCategoryId
        };

        await _unitOfWork.Categories.AddAsync(category, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<CategoryDto>.Success(ToDto(category));
    }

    public async Task<Result<CategoryDto>> UpdateCategoryAsync(int id, CategoryUpsertDto dto, CancellationToken cancellationToken = default)
    {
        var category = await _unitOfWork.Categories.GetByIdAsync(id, cancellationToken);
        if (category is null)
        {
            return Result<CategoryDto>.Failure("Категория не найдена.");
        }

        var slug = dto.Slug.Trim().ToLowerInvariant();

        if (await _unitOfWork.Categories.AnyBySlugAsync(slug, id, cancellationToken))
        {
            return Result<CategoryDto>.Failure("Категория с таким адресом (slug) уже существует.");
        }

        if (dto.ParentCategoryId == id)
        {
            return Result<CategoryDto>.Failure("Категория не может быть родителем самой себе.");
        }

        if (dto.ParentCategoryId is not null && await _unitOfWork.Categories.GetByIdAsync(dto.ParentCategoryId.Value, cancellationToken) is null)
        {
            return Result<CategoryDto>.Failure("Родительская категория не найдена.");
        }

        category.Name = dto.Name.Trim();
        category.Slug = slug;
        category.ParentCategoryId = dto.ParentCategoryId;

        _unitOfWork.Categories.Update(category);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<CategoryDto>.Success(ToDto(category));
    }

    public async Task<Result<bool>> DeleteCategoryAsync(int id, CancellationToken cancellationToken = default)
    {
        var category = await _unitOfWork.Categories.GetByIdAsync(id, cancellationToken);
        if (category is null)
        {
            return Result<bool>.Failure("Категория не найдена.");
        }

        if (await _unitOfWork.Products.AnyByCategoryIdAsync(id, cancellationToken))
        {
            return Result<bool>.Failure("Нельзя удалить категорию, к которой привязаны товары.");
        }

        if (await _unitOfWork.Categories.AnyByParentCategoryIdAsync(id, cancellationToken))
        {
            return Result<bool>.Failure("Нельзя удалить категорию, у которой есть подкатегории.");
        }

        _unitOfWork.Categories.Remove(category);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<bool>.Success(true);
    }

    private static CategoryDto ToDto(Category c) => new(c.Id, c.Name, c.Slug, c.ParentCategoryId);
}
