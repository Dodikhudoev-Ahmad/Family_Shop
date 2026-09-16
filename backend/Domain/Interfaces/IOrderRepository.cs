using Domain.Entities;

namespace Domain.Interfaces;

public enum OrderSortOrder
{
    Newest,
    Oldest
}

public interface IOrderRepository : IRepository<Order>
{
    Task<IReadOnlyList<Order>> GetByUserIdAsync(int userId, CancellationToken cancellationToken = default);

    Task<Order?> GetByIdWithItemsAsync(int id, CancellationToken cancellationToken = default);

    Task<(IReadOnlyList<Order> Items, int TotalCount)> GetByFilterAsync(
        OrderStatus? status,
        DateTime? dateFrom,
        DateTime? dateTo,
        string? search,
        OrderSortOrder sortOrder,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    Task<(int OrdersToday, decimal RevenueToday, int NewOrdersCount, int TotalOrders)> GetStatsAsync(
        CancellationToken cancellationToken = default);

    Task<bool> HasItemsForProductAsync(int productId, CancellationToken cancellationToken = default);

    Task<bool> AnyByPromoCodeIdAsync(int promoCodeId, CancellationToken cancellationToken = default);
}
