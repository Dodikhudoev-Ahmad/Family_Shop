using Microsoft.EntityFrameworkCore;
using FamilyShop.Domain.Entities;
using FamilyShop.Domain.Interfaces;

namespace FamilyShop.Infrastructure.Persistence.Repositories;

public class OrderRepository : RepositoryBase<Order>, IOrderRepository
{
    public OrderRepository(AppDbContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<Order>> GetByUserIdAsync(int userId, CancellationToken cancellationToken = default)
    {
        return await DbSet
            .Include(o => o.Items)
            .ThenInclude(i => i.Product)
            .Where(o => o.UserId == userId)
            .ToListAsync(cancellationToken);
    }
}
