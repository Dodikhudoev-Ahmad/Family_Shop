using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Services;

/// <summary>Read side of orders: a customer's own list, the admin list with filters, and the dashboard figures.
/// Used by <see cref="OrderService"/>.</summary>
internal sealed class OrderQueries
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly StoreClock _clock;

    public OrderQueries(IUnitOfWork unitOfWork, StoreClock clock)
    {
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<IReadOnlyList<OrderDto>> GetOrdersByUserIdAsync(int userId, CancellationToken cancellationToken = default)
    {
        var orders = await _unitOfWork.Orders.GetByUserIdAsync(userId, cancellationToken);
        return orders.OrderByDescending(o => o.CreatedAt).Select(OrderMapper.ToDto).ToList();
    }

    public async Task<PagedResult<AdminOrderDto>> GetOrdersAsync(OrderFilterDto filter, CancellationToken cancellationToken = default)
    {
        var sortOrder = filter.SortBy == OrderSortBy.Oldest ? OrderSortOrder.Oldest : OrderSortOrder.Newest;

        var (items, totalCount) = await _unitOfWork.Orders.GetByFilterAsync(
            filter.Status,
            // The date inputs of the admin page are calendar days of the shop: "from" is the start of that local day,
            // "to" its last instant (the day itself is included).
            filter.DateFrom is { } from ? _clock.StartOfLocalDayUtc(from) : null,
            filter.DateTo is { } to ? _clock.EndOfLocalDayUtc(to) : null,
            filter.Search,
            sortOrder,
            filter.Page,
            filter.PageSize,
            cancellationToken);

        return new PagedResult<AdminOrderDto>(items.Select(OrderMapper.ToAdminDto).ToList(), totalCount, filter.Page, filter.PageSize);
    }

    public async Task<OrderStatsDto> GetStatsAsync(CancellationToken cancellationToken = default)
    {
        // "Today" begins at the shop's local midnight (Store:TimeZone), whatever UTC says; dates stay stored in UTC.
        var (ordersToday, revenueToday, newOrdersCount, totalOrders, newToday) =
            await _unitOfWork.Orders.GetStatsAsync(_clock.StartOfTodayUtc(), cancellationToken);
        return new OrderStatsDto(ordersToday, revenueToday, newOrdersCount, totalOrders, _clock.ZoneId, newToday);
    }
}
