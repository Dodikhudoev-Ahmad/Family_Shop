using Microsoft.EntityFrameworkCore;
using Domain.Entities;
using Domain.Interfaces;

namespace Infrastructure.Persistence.Repositories;

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
            .Include(o => o.PromoCode)
            .Where(o => o.UserId == userId)
            .ToListAsync(cancellationToken);
    }

    public async Task<Order?> GetByIdWithItemsAsync(int id, CancellationToken cancellationToken = default)
    {
        return await DbSet
            .Include(o => o.Items)
            .ThenInclude(i => i.Product)
            .Include(o => o.PromoCode)
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
    }

    public async Task<(IReadOnlyList<Order> Items, int TotalCount)> GetByFilterAsync(
        OrderStatus? status,
        DateTime? dateFrom,
        DateTime? dateTo,
        string? search,
        OrderSortOrder sortOrder,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var query = DbSet
            .Include(o => o.Items)
            .ThenInclude(i => i.Product)
            .Include(o => o.PromoCode)
            .AsQueryable();

        if (status is not null)
        {
            query = query.Where(o => o.Status == status);
        }

        if (dateFrom is not null)
        {
            query = query.Where(o => o.CreatedAt >= dateFrom.Value);
        }

        if (dateTo is not null)
        {
            query = query.Where(o => o.CreatedAt <= dateTo.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            // Escape LIKE wildcards, same convention as ProductRepository.GetByFilterAsync.
            var pattern = $"%{search.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_")}%";
            var searchOrderId = int.TryParse(search, out var parsedId) ? parsedId : (int?)null;
            query = query.Where(o =>
                EF.Functions.ILike(o.ContactName, pattern, "\\") ||
                EF.Functions.ILike(o.ContactPhone, pattern, "\\") ||
                (searchOrderId != null && o.Id == searchOrderId));
        }

        // Skip/Take requires a fully deterministic ORDER BY - see ProductRepository for why Id
        // is always appended as a tiebreaker.
        query = sortOrder switch
        {
            OrderSortOrder.Oldest => query.OrderBy(o => o.CreatedAt).ThenBy(o => o.Id),
            _ => query.OrderByDescending(o => o.CreatedAt).ThenBy(o => o.Id)
        };

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<(int OrdersToday, decimal RevenueToday, int NewOrdersCount, int TotalOrders)> GetStatsAsync(
        CancellationToken cancellationToken = default)
    {
        var today = DateTime.UtcNow.Date;

        var totalOrders = await DbSet.CountAsync(cancellationToken);
        var newOrdersCount = await DbSet.CountAsync(o => o.Status == OrderStatus.Created, cancellationToken);
        var todaysTotals = await DbSet
            .Where(o => o.CreatedAt >= today)
            .Select(o => o.TotalPrice)
            .ToListAsync(cancellationToken);

        return (todaysTotals.Count, todaysTotals.Sum(m => m.Amount), newOrdersCount, totalOrders);
    }

    public Task<bool> HasItemsForProductAsync(int productId, CancellationToken cancellationToken = default)
    {
        return Context.Set<OrderItem>().AnyAsync(i => i.ProductId == productId, cancellationToken);
    }
}
