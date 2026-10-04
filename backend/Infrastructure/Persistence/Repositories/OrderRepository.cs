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
        DateTime todayStartUtc,
        CancellationToken cancellationToken = default)
    {
        var today = todayStartUtc;

        var totalOrders = await DbSet.CountAsync(cancellationToken);
        var newOrdersCount = await DbSet.CountAsync(o => o.Status == OrderStatus.Created, cancellationToken);
        // "Today" is read from the money ledger, not from the orders: the money exists from the moment an order is delivered
        // (cash on delivery), so today's figures are the day's incomes minus its reversals - an order placed yesterday and
        // delivered today counts today, one placed today and not yet delivered does not, and a cancelled one never had any.
        // "Всего заказов" stays a count of every order ever placed.
        var todaysPayments = await Context.Set<Payment>()
            .AsNoTracking()
            .Where(p => p.CreatedAt >= today)
            .GroupBy(p => p.Type)
            .Select(g => new { Type = g.Key, Sum = g.Sum(p => p.Amount), Count = g.Count() })
            .ToListAsync(cancellationToken);
        var income = todaysPayments.FirstOrDefault(p => p.Type == PaymentType.Income);
        var reversal = todaysPayments.FirstOrDefault(p => p.Type == PaymentType.Reversal);

        return ((income?.Count ?? 0) - (reversal?.Count ?? 0), (income?.Sum ?? 0) - (reversal?.Sum ?? 0), newOrdersCount, totalOrders);
    }

    public Task<bool> HasItemsForProductAsync(int productId, CancellationToken cancellationToken = default)
    {
        return Context.Set<OrderItem>().AnyAsync(i => i.ProductId == productId, cancellationToken);
    }

    public Task<bool> HasActiveOrdersForUserAsync(int userId, CancellationToken cancellationToken = default)
    {
        return DbSet.AnyAsync(
            o => o.UserId == userId && o.Status != OrderStatus.Delivered && o.Status != OrderStatus.Cancelled,
            cancellationToken);
    }

    public Task<int> AnonymizeContactDataForUserAsync(int userId, CancellationToken cancellationToken = default)
    {
        return DbSet
            .Where(o => o.UserId == userId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.ContactName, string.Empty)
                .SetProperty(o => o.ContactPhone, string.Empty)
                .SetProperty(o => o.City, (string?)null)
                .SetProperty(o => o.Address, (string?)null), cancellationToken);
    }

    public async Task<bool> TryChangeStatusAsync(int orderId, OrderStatus expected, OrderStatus newStatus, CancellationToken cancellationToken = default)
    {
        var affected = await DbSet
            .Where(o => o.Id == orderId && o.Status == expected)
            .ExecuteUpdateAsync(setters => setters.SetProperty(o => o.Status, newStatus), cancellationToken);

        return affected > 0;
    }

    public Task<bool> AnyByPromoCodeIdAsync(int promoCodeId, CancellationToken cancellationToken = default)
    {
        return DbSet.AnyAsync(o => o.PromoCodeId == promoCodeId, cancellationToken);
    }
}
