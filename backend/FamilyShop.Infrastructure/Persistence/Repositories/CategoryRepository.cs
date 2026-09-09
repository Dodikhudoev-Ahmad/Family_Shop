using FamilyShop.Domain.Entities;
using FamilyShop.Domain.Interfaces;

namespace FamilyShop.Infrastructure.Persistence.Repositories;

public class CategoryRepository : RepositoryBase<Category>, ICategoryRepository
{
    public CategoryRepository(AppDbContext context) : base(context)
    {
    }
}
