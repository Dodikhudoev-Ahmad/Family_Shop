using Microsoft.EntityFrameworkCore;
using FamilyShop.Domain.Entities;
using FamilyShop.Domain.Interfaces;

namespace FamilyShop.Infrastructure.Persistence.Repositories;

public class CategoryRepository : RepositoryBase<Category>, ICategoryRepository
{
    public CategoryRepository(AppDbContext context) : base(context)
    {
    }

    public Task<bool> AnyByParentCategoryIdAsync(int parentCategoryId, CancellationToken cancellationToken = default)
    {
        return DbSet.AnyAsync(c => c.ParentCategoryId == parentCategoryId, cancellationToken);
    }

    public Task<bool> AnyBySlugAsync(string slug, int? excludeId, CancellationToken cancellationToken = default)
    {
        return DbSet.AnyAsync(c => c.Slug == slug && c.Id != excludeId, cancellationToken);
    }
}
