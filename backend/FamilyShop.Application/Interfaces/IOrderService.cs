using FamilyShop.Application.Common;
using FamilyShop.Application.DTOs;
using FamilyShop.Domain.Entities;

namespace FamilyShop.Application.Interfaces;

public interface IOrderService
{
    Task<Result<OrderDto>> CreateOrderAsync(int userId, CreateOrderRequestDto request, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<OrderDto>> GetOrdersByUserIdAsync(int userId, CancellationToken cancellationToken = default);
    Task<PagedResult<AdminOrderDto>> GetOrdersAsync(OrderFilterDto filter, CancellationToken cancellationToken = default);
    Task<Result<AdminOrderDto>> UpdateOrderStatusAsync(int orderId, OrderStatus newStatus, CancellationToken cancellationToken = default);
    Task<OrderStatsDto> GetStatsAsync(CancellationToken cancellationToken = default);
}
