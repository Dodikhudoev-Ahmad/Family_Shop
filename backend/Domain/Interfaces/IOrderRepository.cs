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

    /// <summary>True when the user has an order that is still in progress (Created, Processing or Shipped) - i.e. not
    /// yet Delivered or Cancelled. Such an order still needs the contact details to be fulfilled.</summary>
    Task<bool> HasActiveOrdersForUserAsync(int userId, CancellationToken cancellationToken = default);

    /// <summary>Blanks the contact name, phone, city and address of all of the user's orders (account deletion).
    /// The orders themselves - lines, totals, status, dates - stay for the shop's records.</summary>
    Task<int> AnonymizeContactDataForUserAsync(int userId, CancellationToken cancellationToken = default);

    Task<bool> AnyByPromoCodeIdAsync(int promoCodeId, CancellationToken cancellationToken = default);
}
