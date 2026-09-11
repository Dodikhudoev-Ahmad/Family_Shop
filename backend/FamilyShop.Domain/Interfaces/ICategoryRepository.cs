using FamilyShop.Domain.Entities;

namespace FamilyShop.Domain.Interfaces;

public interface ICategoryRepository : IRepository<Category>
{
    Task<bool> AnyByParentCategoryIdAsync(int parentCategoryId, CancellationToken cancellationToken = default);
    Task<bool> AnyBySlugAsync(string slug, int? excludeId, CancellationToken cancellationToken = default);
}
